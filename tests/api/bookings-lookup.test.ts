import { describe, expect, it } from "vitest";
import { handleBookingLookupRequest } from "../../src/app/api/bookings/lookup/route";
import { createFakeSupabaseClient, type FakeTables } from "../helpers/fake-supabase";

const TURF_ID = "11111111-1111-4111-8111-111111111111";
const PHONE_A = "9876543210";
const PHONE_B = "9000000000";

const TURF_EMBED = { name: "Test Turf", upi_vpa: "turf@upi", payee_name: "Test Turf Owner", upi_phone: null };

function buildTables(): FakeTables {
  return {
    bookings: [
      {
        id: "booking-a1",
        turf_id: TURF_ID,
        customer_phone: PHONE_A,
        booking_date: "2026-10-10",
        start_time: "10:00",
        end_time: "11:00",
        duration_minutes: 60,
        total_price: 800,
        status: "confirmed",
        payment_method: "cash",
        payment_status: "unpaid",
        created_at: "2026-10-01T00:00:00.000Z",
        turfs: TURF_EMBED,
      },
      {
        id: "booking-a2",
        turf_id: TURF_ID,
        customer_phone: PHONE_A,
        booking_date: "2026-12-01",
        start_time: "17:00",
        end_time: "18:00",
        duration_minutes: 60,
        total_price: 900,
        status: "pending",
        payment_method: "upi",
        payment_status: "pending_verification",
        created_at: "2026-10-05T00:00:00.000Z",
        turfs: TURF_EMBED,
      },
      {
        id: "booking-b1",
        turf_id: TURF_ID,
        customer_phone: PHONE_B,
        booking_date: "2026-11-01",
        start_time: "09:00",
        end_time: "10:00",
        duration_minutes: 60,
        total_price: 700,
        status: "confirmed",
        payment_method: "cash",
        payment_status: "unpaid",
        created_at: "2026-10-02T00:00:00.000Z",
        turfs: TURF_EMBED,
      },
    ],
  };
}

let ipCounter = 0;
function makeRequest(body: Record<string, unknown>) {
  ipCounter += 1;
  return new Request("http://localhost/api/bookings/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `20.0.0.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bookings/lookup", () => {
  it("rejects a malformed phone number (wrong digit count)", async () => {
    const tables = buildTables();
    const res = await handleBookingLookupRequest(makeRequest({ phone: "123" }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a phone number with too many digits", async () => {
    const tables = buildTables();
    const res = await handleBookingLookupRequest(makeRequest({ phone: "98765432100" }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a phone number containing letters", async () => {
    const tables = buildTables();
    const res = await handleBookingLookupRequest(makeRequest({ phone: "98765432ab" }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(400);
  });

  it("does not require (or accept) any reference, OTP, or other field", async () => {
    const tables = buildTables();
    const res = await handleBookingLookupRequest(makeRequest({ phone: PHONE_A, reference: "ignored", otp: "0000" }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(200);
  });

  it("returns an empty list for a valid phone number with no bookings", async () => {
    const tables = buildTables();
    const res = await handleBookingLookupRequest(makeRequest({ phone: "9111111111" }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookings).toEqual([]);
  });

  it("returns every booking for that phone number alone, sorted upcoming-first", async () => {
    const tables = buildTables();
    const res = await handleBookingLookupRequest(makeRequest({ phone: PHONE_A }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookings).toHaveLength(2);
    expect(body.bookings.map((b: { bookingDate: string }) => b.bookingDate)).toEqual(["2026-12-01", "2026-10-10"]);
  });

  it("never returns another customer's booking", async () => {
    const tables = buildTables();
    const res = await handleBookingLookupRequest(makeRequest({ phone: PHONE_A }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    const body = await res.json();
    const dates = body.bookings.map((b: { bookingDate: string }) => b.bookingDate);
    expect(dates).not.toContain("2026-11-01"); // PHONE_B's booking
  });

  it("never exposes a customer_phone or internal uuid field in the response", async () => {
    const tables = buildTables();
    const res = await handleBookingLookupRequest(makeRequest({ phone: PHONE_A }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    const body = await res.json();
    for (const booking of body.bookings) {
      expect(booking.customer_phone).toBeUndefined();
      expect(booking.customerPhone).toBeUndefined();
      expect(booking.id).toBeUndefined();
      expect(booking.reference).toBeUndefined();
    }
  });

  it("includes a UPI panel (with a descriptive note, no reference) only for a pending-verification upi booking", async () => {
    const tables = buildTables();
    const res = await handleBookingLookupRequest(makeRequest({ phone: PHONE_A }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    const body = await res.json();
    const upiBooking = body.bookings.find((b: { paymentMethod: string }) => b.paymentMethod === "upi");
    const cashBooking = body.bookings.find((b: { paymentMethod: string }) => b.paymentMethod === "cash");
    expect(upiBooking.upi).not.toBeNull();
    expect(typeof upiBooking.upi.note).toBe("string");
    expect(cashBooking.upi).toBeNull();
  });

  it("rate limits repeated lookup attempts from the same client", async () => {
    const tables = buildTables();
    const deps = { getAdminClient: () => createFakeSupabaseClient(tables) };
    const fixedIp = "203.0.113.77";
    const requestFactory = () =>
      new Request("http://localhost/api/bookings/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": fixedIp },
        body: JSON.stringify({ phone: PHONE_A }),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const res = await handleBookingLookupRequest(requestFactory(), deps);
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
