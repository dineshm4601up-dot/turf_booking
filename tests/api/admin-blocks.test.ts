import { describe, expect, it } from "vitest";
import { handleBlocksGet, handleBlocksPost } from "../../src/app/api/admin/blocks/route";
import { handleBlockDelete } from "../../src/app/api/admin/blocks/[id]/route";
import { makeAdminDeps } from "../helpers/admin-deps";
import type { FakeTables, RpcHandler } from "../helpers/fake-supabase";

const TURF_ID = "11111111-1111-4111-8111-111111111111";

function buildTables(): FakeTables {
  return { turfs: [{ id: TURF_ID, name: "Test Turf" }], turf_blocks: [], bookings: [] };
}

/** Simulates the Phase 4 create_turf_block() Postgres function. */
const createBlockRpc: RpcHandler = (fnName, args, tables) => {
  if (fnName !== "create_turf_block") return { error: { message: "unknown function" } };
  const turfId = args.p_turf_id as string;
  const blockDate = args.p_block_date as string;
  const startTime = args.p_start_time as string;
  const endTime = args.p_end_time as string;
  const reason = (args.p_reason as string | null) ?? null;

  if (endTime <= startTime) {
    return { error: { message: "end_time must be after start_time" } };
  }

  const bookings = tables.bookings ?? [];
  const conflicts = bookings.filter(
    (b) =>
      b.turf_id === turfId &&
      b.booking_date === blockDate &&
      b.status !== "cancelled" &&
      (startTime as string) < (b.end_time as string) &&
      (b.start_time as string) < (endTime as string)
  );
  if (conflicts.length > 0) {
    return { error: { message: `BLOCK_OVERLAPS_BOOKINGS:${conflicts.length}` } };
  }

  const block = {
    id: `33333333-3333-4333-8333-33333333333${(tables.turf_blocks ?? []).length}`,
    turf_id: turfId,
    block_date: blockDate,
    start_time: startTime,
    end_time: endTime,
    reason,
    created_at: new Date().toISOString(),
  };
  tables.turf_blocks = [...(tables.turf_blocks ?? []), block];
  return { data: block };
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/blocks", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    const res = await handleBlocksGet(new Request("http://localhost/api/admin/blocks"), makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
  });

  it("lists blocks for an admin", async () => {
    const tables = buildTables();
    tables.turf_blocks!.push({ id: "b1", turf_id: TURF_ID, block_date: "2026-11-01", start_time: "09:00", end_time: "10:00" });
    const res = await handleBlocksGet(new Request("http://localhost/api/admin/blocks"), makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocks).toHaveLength(1);
  });
});

describe("POST /api/admin/blocks", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    const res = await handleBlocksPost(
      postRequest({ turfId: TURF_ID, blockDate: "2026-11-01", startTime: "09:00", endTime: "10:00" }),
      makeAdminDeps(tables, "non-admin", { onRpc: createBlockRpc })
    );
    expect(res.status).toBe(403);
  });

  it("rejects endTime not later than startTime", async () => {
    const tables = buildTables();
    const res = await handleBlocksPost(
      postRequest({ turfId: TURF_ID, blockDate: "2026-11-01", startTime: "10:00", endTime: "09:00" }),
      makeAdminDeps(tables, "admin", { onRpc: createBlockRpc })
    );
    expect(res.status).toBe(400);
  });

  it("creates a block when there is no conflicting active booking", async () => {
    const tables = buildTables();
    const res = await handleBlocksPost(
      postRequest({ turfId: TURF_ID, blockDate: "2026-11-01", startTime: "09:00", endTime: "10:00", reason: "Maintenance" }),
      makeAdminDeps(tables, "admin", { onRpc: createBlockRpc })
    );
    expect(res.status).toBe(201);
    expect(tables.turf_blocks).toHaveLength(1);
  });

  it("rejects a block that would silently overlap an existing active booking", async () => {
    const tables = buildTables();
    tables.bookings!.push({
      turf_id: TURF_ID,
      booking_date: "2026-11-01",
      start_time: "09:30",
      end_time: "10:30",
      status: "confirmed",
    });

    const res = await handleBlocksPost(
      postRequest({ turfId: TURF_ID, blockDate: "2026-11-01", startTime: "09:00", endTime: "10:00" }),
      makeAdminDeps(tables, "admin", { onRpc: createBlockRpc })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/overlaps 1 existing active booking/i);
    expect(tables.turf_blocks).toHaveLength(0);
  });

  it("a cancelled booking does not prevent a block over the same time", async () => {
    const tables = buildTables();
    tables.bookings!.push({
      turf_id: TURF_ID,
      booking_date: "2026-11-01",
      start_time: "09:30",
      end_time: "10:30",
      status: "cancelled",
    });

    const res = await handleBlocksPost(
      postRequest({ turfId: TURF_ID, blockDate: "2026-11-01", startTime: "09:00", endTime: "10:00" }),
      makeAdminDeps(tables, "admin", { onRpc: createBlockRpc })
    );
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/admin/blocks/:id", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    tables.turf_blocks!.push({ id: "b1", turf_id: TURF_ID });
    const res = await handleBlockDelete("b1", makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
  });

  it("removes an existing block, freeing the time for customer booking again", async () => {
    const tables = buildTables();
    const blockId = "55555555-5555-4555-8555-555555555555";
    tables.turf_blocks!.push({ id: blockId, turf_id: TURF_ID });
    const res = await handleBlockDelete(blockId, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    expect(tables.turf_blocks).toHaveLength(0);
  });

  it("404s for a block that doesn't exist", async () => {
    const tables = buildTables();
    const res = await handleBlockDelete("99999999-9999-4999-8999-999999999999", makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(404);
  });
});
