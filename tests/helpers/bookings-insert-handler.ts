import type { FakeError, FakeTables, InsertHandler } from "./fake-supabase";

/**
 * Lets a test force the next N insert attempts to collide on
 * short_reference (simulating two concurrent requests picking the same
 * random candidate), to verify the route's retry loop actually retries
 * rather than just failing. Call reset (0) in afterEach/beforeEach so one
 * test's setting never leaks into the next.
 */
let forcedShortReferenceCollisions = 0;
export function forceShortReferenceCollisions(count: number): void {
  forcedShortReferenceCollisions = count;
}

let nextShortReference = 10000;
function generateShortReference(): string {
  const value = String(nextShortReference);
  nextShortReference += 1;
  return value;
}

/**
 * Simulates, in memory, the Postgres guarantees the real schema provides
 * (see supabase/migrations): the booking overlap exclusion constraint
 * (23P01), the partial unique index on idempotency_key (23505), and the
 * unique constraint on short_reference (23505). This lets route tests
 * verify OUR error-handling maps those codes to the right HTTP responses,
 * without a real database. It is not a substitute for the real
 * constraints -- see supabase/tests/booking_overlap_tests.sql for that.
 */
export const bookingsInsertHandler: InsertHandler = (
  table: string,
  row: Record<string, unknown>,
  tables: FakeTables
) => {
  if (table !== "bookings") return {};

  const existing = tables.bookings ?? [];
  const idempotencyKey = row.idempotency_key;

  if (idempotencyKey && existing.some((b) => b.idempotency_key === idempotencyKey)) {
    const error: FakeError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_bookings_idempotency_key"',
    };
    return { error };
  }

  const overlaps = existing.some((b) => {
    if (b.turf_id !== row.turf_id || b.booking_date !== row.booking_date) return false;
    if (b.status === "cancelled") return false;
    return (row.start_time as string) < (b.end_time as string) && (b.start_time as string) < (row.end_time as string);
  });
  if (overlaps) {
    const error: FakeError = { code: "23P01", message: "conflicting key value violates exclusion constraint" };
    return { error };
  }

  if (forcedShortReferenceCollisions > 0) {
    forcedShortReferenceCollisions -= 1;
    const error: FakeError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "bookings_short_reference_unique"',
    };
    return { error };
  }

  return {
    data: {
      id: `booking-${existing.length + 1}`,
      short_reference: generateShortReference(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...row,
    },
  };
};
