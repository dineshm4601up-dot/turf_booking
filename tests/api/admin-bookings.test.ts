import { describe, expect, it } from "vitest";
import { handleAdminBookingsGet } from "../../src/app/api/admin/bookings/route";
import { handleBookingStatusPatch } from "../../src/app/api/admin/bookings/[id]/route";
import { makeAdminDeps } from "../helpers/admin-deps";
import type { FakeTables } from "../helpers/fake-supabase";

const TURF_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_PENDING = "22222222-2222-4222-8222-222222222222";
const BOOKING_CONFIRMED = "33333333-3333-4333-8333-333333333333";
const BOOKING_CANCELLED = "44444444-4444-4444-8444-444444444444";

function buildTables(): FakeTables {
  return {
    bookings: [
      {
        id: BOOKING_PENDING,
        turf_id: TURF_ID,
        customer_name: "Alice",
        customer_phone: "9000000001",
        booking_date: "2026-10-20",
        start_time: "10:00",
        end_time: "11:00",
        duration_minutes: 60,
        total_price: 800,
        status: "pending",
        short_reference: "10001",
        created_at: "2026-10-12T10:00:00.000Z",
      },
      {
        id: BOOKING_CONFIRMED,
        turf_id: TURF_ID,
        customer_name: "Bob",
        customer_phone: "9000000002",
        booking_date: "2026-10-21",
        start_time: "12:00",
        end_time: "13:00",
        duration_minutes: 60,
        total_price: 900,
        status: "confirmed",
        created_at: "2026-10-12T11:00:00.000Z",
      },
      {
        id: BOOKING_CANCELLED,
        turf_id: TURF_ID,
        customer_name: "Carol",
        customer_phone: "9000000003",
        booking_date: "2026-10-22",
        start_time: "14:00",
        end_time: "15:00",
        duration_minutes: 60,
        total_price: 700,
        status: "cancelled",
        created_at: "2026-10-12T12:00:00.000Z",
      },
    ],
  };
}

function patchRequest(status: string) {
  return new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status }) });
}

describe("GET /api/admin/bookings", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    const res = await handleAdminBookingsGet(new Request("http://localhost/api/admin/bookings"), makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
  });

  it("lists all bookings for an admin with no filters", async () => {
    const tables = buildTables();
    const res = await handleAdminBookingsGet(new Request("http://localhost/api/admin/bookings"), makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
  });

  it("filters by status", async () => {
    const tables = buildTables();
    const res = await handleAdminBookingsGet(
      new Request("http://localhost/api/admin/bookings?status=pending"),
      makeAdminDeps(tables, "admin")
    );
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].id).toBe(BOOKING_PENDING);
  });

  it("filters by date", async () => {
    const tables = buildTables();
    const res = await handleAdminBookingsGet(
      new Request("http://localhost/api/admin/bookings?date=2026-10-21"),
      makeAdminDeps(tables, "admin")
    );
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].id).toBe(BOOKING_CONFIRMED);
  });

  it("searches by customer name", async () => {
    const tables = buildTables();
    const res = await handleAdminBookingsGet(
      new Request("http://localhost/api/admin/bookings?search=alice"),
      makeAdminDeps(tables, "admin")
    );
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].id).toBe(BOOKING_PENDING);
  });

  it("searches by the 5-digit short reference", async () => {
    const tables = buildTables();
    const res = await handleAdminBookingsGet(
      new Request("http://localhost/api/admin/bookings?search=10001"),
      makeAdminDeps(tables, "admin")
    );
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].id).toBe(BOOKING_PENDING);
  });

  it("searches by exact booking reference (uuid)", async () => {
    const tables = buildTables();
    const res = await handleAdminBookingsGet(
      new Request(`http://localhost/api/admin/bookings?search=${BOOKING_CONFIRMED}`),
      makeAdminDeps(tables, "admin")
    );
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].id).toBe(BOOKING_CONFIRMED);
  });

  it("never exposes customer info from this endpoint to anyone but an authorized admin", async () => {
    const tables = buildTables();
    const unauthenticated = await handleAdminBookingsGet(new Request("http://localhost/api/admin/bookings"), makeAdminDeps(tables, "unauthenticated"));
    expect(unauthenticated.status).toBe(401);
    const unauthenticatedBody = await unauthenticated.json();
    expect(unauthenticatedBody.bookings).toBeUndefined();

    const nonAdmin = await handleAdminBookingsGet(new Request("http://localhost/api/admin/bookings"), makeAdminDeps(tables, "non-admin"));
    expect(nonAdmin.status).toBe(403);
    const nonAdminBody = await nonAdmin.json();
    expect(nonAdminBody.bookings).toBeUndefined();
  });
});

describe("PATCH /api/admin/bookings/:id", () => {
  it("rejects a non-admin from changing status", async () => {
    const tables = buildTables();
    const res = await handleBookingStatusPatch(patchRequest("confirmed"), BOOKING_PENDING, makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
    expect(tables.bookings![0]!.status).toBe("pending");
  });

  it("confirms a pending booking", async () => {
    const tables = buildTables();
    const res = await handleBookingStatusPatch(patchRequest("confirmed"), BOOKING_PENDING, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    expect(tables.bookings![0]!.status).toBe("confirmed");
  });

  it("cancels a confirmed booking, freeing its slot", async () => {
    const tables = buildTables();
    const res = await handleBookingStatusPatch(patchRequest("cancelled"), BOOKING_CONFIRMED, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    expect(tables.bookings![1]!.status).toBe("cancelled");
  });

  it("rejects reviving a cancelled booking", async () => {
    const tables = buildTables();
    const res = await handleBookingStatusPatch(patchRequest("confirmed"), BOOKING_CANCELLED, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(400);
    expect(tables.bookings![2]!.status).toBe("cancelled");
  });

  it("rejects moving a confirmed booking back to pending", async () => {
    const tables = buildTables();
    const res = await handleBookingStatusPatch(patchRequest("pending"), BOOKING_CONFIRMED, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(400);
  });

  it("404s for a booking that doesn't exist", async () => {
    const tables = buildTables();
    const res = await handleBookingStatusPatch(
      patchRequest("confirmed"),
      "99999999-9999-4999-8999-999999999999",
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(404);
  });

  // NOTE: a true concurrent-request race (two PATCHes in flight at once,
  // each reading "pending" before either writes) can't be reproduced in
  // this single-threaded mocked suite -- there's no point in the fake
  // client's sequential execution where two calls are ever actually
  // overlapping. The guard itself (`.eq("status", existing.status)` on the
  // UPDATE) is the same pattern as a real optimistic-lock: Postgres
  // evaluates an UPDATE ... WHERE atomically, so in production, only one
  // of two simultaneous requests can ever match and change the row; the
  // other legitimately gets zero rows back and this route's 409. What IS
  // tested above is the business rule the guard protects: an invalid
  // transition (e.g. reviving a cancelled booking) is rejected regardless
  // of timing.
});
