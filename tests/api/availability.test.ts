import { describe, expect, it } from "vitest";
import { handleAvailabilityRequest } from "../../src/app/api/availability/route";
import { createFakeSupabaseClient, type FakeTables } from "../helpers/fake-supabase";

const TURF_ID = "11111111-1111-4111-8111-111111111111";
// 2026-10-20 is a Tuesday (day_of_week = 2) and is in the future relative
// to this suite's run date, so it is never treated as a past date.
const FUTURE_DATE = "2026-10-20";
const FUTURE_DAY_OF_WEEK = 2;

function buildTables(overrides: Partial<FakeTables> = {}): FakeTables {
  return {
    turfs: [
      {
        id: TURF_ID,
        name: "Test Turf",
        opening_time: "06:00",
        closing_time: "23:00",
        slot_interval_minutes: 30,
        is_active: true,
      },
    ],
    bookings: [],
    turf_blocks: [],
    turf_pricing: [
      { turf_id: TURF_ID, day_of_week: FUTURE_DAY_OF_WEEK, start_time: "06:00", end_time: "23:00", price_per_hour: 800 },
    ],
    ...overrides,
  };
}

function makeRequest(params: Record<string, string>) {
  const search = new URLSearchParams(params).toString();
  return new Request(`http://localhost/api/availability?${search}`);
}

describe("GET /api/availability", () => {
  it("rejects an invalid turfId", async () => {
    const tables = buildTables();
    const res = await handleAvailabilityRequest(makeRequest({ turfId: "not-a-uuid", date: FUTURE_DATE }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid date", async () => {
    const tables = buildTables();
    const res = await handleAvailabilityRequest(makeRequest({ turfId: TURF_ID, date: "not-a-date" }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a turf that doesn't exist", async () => {
    const tables = buildTables({ turfs: [] });
    const res = await handleAvailabilityRequest(makeRequest({ turfId: TURF_ID, date: FUTURE_DATE }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for an inactive turf", async () => {
    const tables = buildTables();
    tables.turfs![0]!.is_active = false;
    const res = await handleAvailabilityRequest(makeRequest({ turfId: TURF_ID, date: FUTURE_DATE }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(404);
  });

  it("excludes slots that overlap a confirmed booking", async () => {
    const tables = buildTables({
      bookings: [
        { turf_id: TURF_ID, booking_date: FUTURE_DATE, start_time: "17:00", end_time: "18:30", status: "confirmed" },
      ],
    });
    const res = await handleAvailabilityRequest(makeRequest({ turfId: TURF_ID, date: FUTURE_DATE }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    const body = await res.json();
    const slotsByTime = Object.fromEntries(body.slots.map((s: { startTime: string; available: boolean }) => [s.startTime, s.available]));
    expect(slotsByTime["17:00"]).toBe(false);
    expect(slotsByTime["18:00"]).toBe(false);
    expect(slotsByTime["18:30"]).toBe(true);
  });

  it("does not let a cancelled booking block its old slot", async () => {
    const tables = buildTables({
      bookings: [
        { turf_id: TURF_ID, booking_date: FUTURE_DATE, start_time: "17:00", end_time: "18:30", status: "cancelled" },
      ],
    });
    const res = await handleAvailabilityRequest(makeRequest({ turfId: TURF_ID, date: FUTURE_DATE }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    const body = await res.json();
    const slotsByTime = Object.fromEntries(body.slots.map((s: { startTime: string; available: boolean }) => [s.startTime, s.available]));
    expect(slotsByTime["17:00"]).toBe(true);
  });

  it("excludes slots that overlap a blocked period", async () => {
    const tables = buildTables({
      turf_blocks: [{ turf_id: TURF_ID, block_date: FUTURE_DATE, start_time: "09:00", end_time: "12:00" }],
    });
    const res = await handleAvailabilityRequest(makeRequest({ turfId: TURF_ID, date: FUTURE_DATE }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    const body = await res.json();
    const slotsByTime = Object.fromEntries(body.slots.map((s: { startTime: string; available: boolean }) => [s.startTime, s.available]));
    expect(slotsByTime["10:00"]).toBe(false);
  });

  it("marks every slot unavailable for a date entirely in the past", async () => {
    const tables = buildTables();
    const res = await handleAvailabilityRequest(makeRequest({ turfId: TURF_ID, date: "2020-01-01" }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    const body = await res.json();
    expect(body.slots).toEqual([]);
  });

  it("returns per-duration availability and server-computed price for a given startTime", async () => {
    const tables = buildTables();
    const res = await handleAvailabilityRequest(
      makeRequest({ turfId: TURF_ID, date: FUTURE_DATE, startTime: "21:00" }),
      { getAdminClient: () => createFakeSupabaseClient(tables) }
    );
    const body = await res.json();
    const byDuration = Object.fromEntries(
      body.durationOptions.map((o: { durationMinutes: number; available: boolean; price: number | null }) => [
        o.durationMinutes,
        o,
      ])
    );
    // 21:00 + 2h = 23:00 exactly -> accepted.
    expect(byDuration[120].available).toBe(true);
    expect(byDuration[120].price).toBe(1600);
    // 21:00 + 2.5h = 23:30 -> past closing, rejected.
    expect(byDuration[150].available).toBe(false);
    expect(byDuration[150].price).toBeNull();
  });

  it("marks a slot unavailable (not a guessed price) when pricing is missing for that day", async () => {
    const tables = buildTables({ turf_pricing: [] });
    const res = await handleAvailabilityRequest(
      makeRequest({ turfId: TURF_ID, date: FUTURE_DATE, startTime: "10:00" }),
      { getAdminClient: () => createFakeSupabaseClient(tables) }
    );
    const body = await res.json();
    const thirtyMin = body.durationOptions.find((o: { durationMinutes: number }) => o.durationMinutes === 30);
    expect(thirtyMin.available).toBe(false);
    expect(thirtyMin.price).toBeNull();
  });
});
