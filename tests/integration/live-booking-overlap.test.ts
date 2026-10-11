import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * UNLIKE every other file in tests/, this hits a REAL Supabase project --
 * it is not mocked. It is skipped by default so `npm test` never touches
 * live data without explicit opt-in. To run it:
 *
 *   RUN_SUPABASE_INTEGRATION_TESTS=1 npm test -- tests/integration
 *
 * Requires the Phase 2 + Phase 3 migrations (including
 * 20261012000001_add_booking_idempotency_key.sql) to already be applied to
 * whatever project NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * point at. It creates one throwaway turf + a few bookings on a far-future
 * date and deletes everything it created in a `finally` block.
 */
const shouldRun = process.env.RUN_SUPABASE_INTEGRATION_TESTS === "1";

describe.skipIf(!shouldRun)("live Supabase: booking overlap constraint (opt-in, real database)", () => {
  it("rejects an overlapping booking, allows an adjacent one, and ignores cancelled bookings", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run this test.");
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const bookingDate = "2099-01-01"; // far future: never collides with real bookings.

    const { data: turf, error: turfError } = await admin
      .from("turfs")
      .insert({
        name: "Integration Test Turf (safe to delete)",
        location: "Test",
        sport_type: "Football",
        opening_time: "06:00",
        closing_time: "23:00",
      })
      .select("id")
      .single();
    expect(turfError).toBeNull();
    const turfId = turf!.id as string;

    try {
      const { error: firstError } = await admin.from("bookings").insert({
        turf_id: turfId,
        customer_name: "Integration A",
        customer_phone: "9000000001",
        booking_date: bookingDate,
        start_time: "17:00",
        end_time: "18:30",
        duration_minutes: 90,
        total_price: 100,
        status: "confirmed",
      });
      expect(firstError).toBeNull();

      const { error: overlapError } = await admin.from("bookings").insert({
        turf_id: turfId,
        customer_name: "Integration B",
        customer_phone: "9000000002",
        booking_date: bookingDate,
        start_time: "18:00",
        end_time: "19:00",
        duration_minutes: 60,
        total_price: 100,
        status: "confirmed",
      });
      expect(overlapError?.code).toBe("23P01");

      const { error: adjacentError } = await admin.from("bookings").insert({
        turf_id: turfId,
        customer_name: "Integration C",
        customer_phone: "9000000003",
        booking_date: bookingDate,
        start_time: "18:30",
        end_time: "19:30",
        duration_minutes: 60,
        total_price: 100,
        status: "confirmed",
      });
      expect(adjacentError).toBeNull();

      const { error: cancelledError } = await admin.from("bookings").insert({
        turf_id: turfId,
        customer_name: "Integration D",
        customer_phone: "9000000004",
        booking_date: bookingDate,
        start_time: "17:00",
        end_time: "18:30",
        duration_minutes: 90,
        total_price: 100,
        status: "cancelled",
      });
      expect(cancelledError).toBeNull();
    } finally {
      await admin.from("bookings").delete().eq("turf_id", turfId);
      await admin.from("turfs").delete().eq("id", turfId);
    }
  });
});
