import { describe, expect, it } from "vitest";
import { handlePricingGet, handlePricingPost } from "../../src/app/api/admin/pricing/route";
import { handlePricingDelete } from "../../src/app/api/admin/pricing/[id]/route";
import { makeAdminDeps } from "../helpers/admin-deps";
import type { FakeError, FakeTables, InsertHandler } from "../helpers/fake-supabase";

const TURF_ID = "11111111-1111-4111-8111-111111111111";

function buildTables(): FakeTables {
  return {
    turfs: [{ id: TURF_ID, name: "Test Turf" }],
    turf_pricing: [],
  };
}

/** Simulates the Phase 4 exclusion constraint on turf_pricing (23P01). */
const pricingInsertHandler: InsertHandler = (table, row, tables) => {
  if (table !== "turf_pricing") return {};
  const existing = tables.turf_pricing ?? [];
  const overlaps = existing.some((r) => {
    if (r.turf_id !== row.turf_id || r.day_of_week !== row.day_of_week) return false;
    return (row.start_time as string) < (r.end_time as string) && (r.start_time as string) < (row.end_time as string);
  });
  if (overlaps) {
    const error: FakeError = { code: "23P01", message: "conflicting key value violates exclusion constraint" };
    return { error };
  }
  return { data: { id: `pricing-${existing.length + 1}`, created_at: new Date().toISOString(), ...row } };
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/pricing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/pricing", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    const res = await handlePricingGet(new Request("http://localhost/api/admin/pricing"), makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
  });

  it("lists pricing rules for an admin", async () => {
    const tables = buildTables();
    tables.turf_pricing!.push({ id: "p1", turf_id: TURF_ID, day_of_week: 1, start_time: "06:00", end_time: "23:00", price_per_hour: 800 });
    const res = await handlePricingGet(new Request("http://localhost/api/admin/pricing"), makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pricingRules).toHaveLength(1);
  });
});

describe("POST /api/admin/pricing", () => {
  it("rejects an out-of-range dayOfWeek", async () => {
    const tables = buildTables();
    const res = await handlePricingPost(
      postRequest({ turfId: TURF_ID, dayOfWeek: 7, startTime: "06:00", endTime: "23:00", pricePerHour: 800 }),
      makeAdminDeps(tables, "admin", { onInsert: pricingInsertHandler })
    );
    expect(res.status).toBe(400);
  });

  it("rejects endTime not later than startTime", async () => {
    const tables = buildTables();
    const res = await handlePricingPost(
      postRequest({ turfId: TURF_ID, dayOfWeek: 1, startTime: "17:00", endTime: "17:00", pricePerHour: 800 }),
      makeAdminDeps(tables, "admin", { onInsert: pricingInsertHandler })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-positive price", async () => {
    const tables = buildTables();
    const res = await handlePricingPost(
      postRequest({ turfId: TURF_ID, dayOfWeek: 1, startTime: "06:00", endTime: "23:00", pricePerHour: 0 }),
      makeAdminDeps(tables, "admin", { onInsert: pricingInsertHandler })
    );
    expect(res.status).toBe(400);
  });

  it("creates a valid pricing rule", async () => {
    const tables = buildTables();
    const res = await handlePricingPost(
      postRequest({ turfId: TURF_ID, dayOfWeek: 1, startTime: "06:00", endTime: "17:00", pricePerHour: 700 }),
      makeAdminDeps(tables, "admin", { onInsert: pricingInsertHandler })
    );
    expect(res.status).toBe(201);
  });

  it("rejects a rule that overlaps an existing one for the same turf and day", async () => {
    const tables = buildTables();
    const deps = makeAdminDeps(tables, "admin", { onInsert: pricingInsertHandler });

    const first = await handlePricingPost(
      postRequest({ turfId: TURF_ID, dayOfWeek: 1, startTime: "06:00", endTime: "17:00", pricePerHour: 700 }),
      deps
    );
    expect(first.status).toBe(201);

    const overlapping = await handlePricingPost(
      postRequest({ turfId: TURF_ID, dayOfWeek: 1, startTime: "16:00", endTime: "20:00", pricePerHour: 900 }),
      deps
    );
    expect(overlapping.status).toBe(409);
  });

  it("allows a back-to-back (adjacent) rule for the same turf and day", async () => {
    const tables = buildTables();
    const deps = makeAdminDeps(tables, "admin", { onInsert: pricingInsertHandler });

    const first = await handlePricingPost(
      postRequest({ turfId: TURF_ID, dayOfWeek: 1, startTime: "06:00", endTime: "17:00", pricePerHour: 700 }),
      deps
    );
    expect(first.status).toBe(201);

    const adjacent = await handlePricingPost(
      postRequest({ turfId: TURF_ID, dayOfWeek: 1, startTime: "17:00", endTime: "23:00", pricePerHour: 900 }),
      deps
    );
    expect(adjacent.status).toBe(201);
  });
});

describe("DELETE /api/admin/pricing/:id", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    tables.turf_pricing!.push({ id: "p1", turf_id: TURF_ID, day_of_week: 1 });
    const res = await handlePricingDelete("p1", makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
  });

  it("deletes an existing rule without touching other tables", async () => {
    const tables = buildTables();
    const pricingId = "22222222-2222-4222-8222-222222222222";
    tables.turf_pricing!.push({ id: pricingId, turf_id: TURF_ID, day_of_week: 1 });
    tables.bookings = [{ id: "b1", total_price: 800 }];

    const res = await handlePricingDelete(pricingId, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    expect(tables.turf_pricing).toHaveLength(0);
    // Historical booking price is untouched -- it was never linked by FK.
    expect(tables.bookings![0]!.total_price).toBe(800);
  });

  it("404s for a rule that doesn't exist", async () => {
    const tables = buildTables();
    const res = await handlePricingDelete("99999999-9999-4999-8999-999999999999", makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(404);
  });
});
