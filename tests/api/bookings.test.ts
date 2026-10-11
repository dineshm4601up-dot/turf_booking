import { afterEach, describe, expect, it } from "vitest";
import { handleBookingRequest } from "../../src/app/api/bookings/route";
import { createFakeSupabaseClient, type FakeTables } from "../helpers/fake-supabase";
import { bookingsInsertHandler, forceShortReferenceCollisions } from "../helpers/bookings-insert-handler";

const TURF_ID = "11111111-1111-4111-8111-111111111111";
// Tuesday, in the future relative to this suite's run date.
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

let ipCounter = 0;
function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  ipCounter += 1;
  return new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${ipCounter}`, ...headers },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    turfId: TURF_ID,
    bookingDate: FUTURE_DATE,
    startTime: "10:00",
    durationMinutes: 60,
    customerName: "Priya Sharma",
    customerPhone: "9876543210",
    paymentMethod: "cash",
    ...overrides,
  };
}

describe("POST /api/bookings", () => {
  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.1.1.1" },
      body: "not json",
    });
    const tables = buildTables();
    const res = await handleBookingRequest(request, { getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }) });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid duration", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ durationMinutes: 45 })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed phone number", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ customerPhone: "12345" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed name", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ customerName: "X" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a past date", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ bookingDate: "2020-01-01" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a duration that extends past closing time", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ startTime: "21:30", durationMinutes: 120 })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts a booking that ends exactly at closing time", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ startTime: "21:00", durationMinutes: 120 })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(201);
  });

  it("rejects a booking inside a blocked period with 409", async () => {
    const tables = buildTables({
      turf_blocks: [{ turf_id: TURF_ID, block_date: FUTURE_DATE, start_time: "09:00", end_time: "12:00" }],
    });
    const res = await handleBookingRequest(makeRequest(validBody({ startTime: "10:00", durationMinutes: 60 })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(409);
  });

  it("returns a 422 configuration error instead of guessing a price when pricing is missing", async () => {
    const tables = buildTables({ turf_pricing: [] });
    const res = await handleBookingRequest(makeRequest(validBody()), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(422);
  });

  it("ignores a client-submitted price/status and computes its own", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(
      makeRequest(validBody({ totalPrice: 1, total_price: 1, status: "confirmed" })),
      { getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.totalPrice).toBe(800); // 1 hour at 800/hr, not the submitted "1".
    expect(body.status).toBe("pending"); // never the client-submitted "confirmed".
  });

  it("creates a pending booking with the server-calculated price", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ startTime: "10:00", durationMinutes: 90 })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.totalPrice).toBe(1200); // 1.5 hours at 800/hr.
    expect(body.endTime).toBe("11:30");
  });

  it("returns 409 when a second request overlaps an already-created booking", async () => {
    const tables = buildTables();
    const deps = { getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }) };

    const first = await handleBookingRequest(makeRequest(validBody({ startTime: "17:00", durationMinutes: 90 })), deps);
    expect(first.status).toBe(201);

    const second = await handleBookingRequest(makeRequest(validBody({ startTime: "18:00", durationMinutes: 60 })), deps);
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toMatch(/just booked/i);
  });

  it("allows a second, back-to-back booking immediately after the first", async () => {
    const tables = buildTables();
    const deps = { getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }) };

    const first = await handleBookingRequest(makeRequest(validBody({ startTime: "17:00", durationMinutes: 60 })), deps);
    expect(first.status).toBe(201);

    const second = await handleBookingRequest(makeRequest(validBody({ startTime: "18:00", durationMinutes: 60 })), deps);
    expect(second.status).toBe(201);
  });

  it("a cancelled booking does not block a new booking in the same slot", async () => {
    const tables = buildTables({
      bookings: [
        {
          turf_id: TURF_ID,
          customer_name: "Old Customer",
          customer_phone: "9000000000",
          booking_date: FUTURE_DATE,
          start_time: "10:00",
          end_time: "11:00",
          duration_minutes: 60,
          total_price: 800,
          status: "cancelled",
          idempotency_key: null,
        },
      ],
    });
    const res = await handleBookingRequest(makeRequest(validBody({ startTime: "10:00", durationMinutes: 60 })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(201);
  });

  it("replays an identical retry (same idempotency key) instead of creating a duplicate", async () => {
    const tables = buildTables();
    const deps = { getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }) };
    const idempotencyKey = "retry-key-123";

    const first = await handleBookingRequest(
      makeRequest(validBody({ startTime: "14:00", durationMinutes: 60 }), { "Idempotency-Key": idempotencyKey }),
      deps
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const second = await handleBookingRequest(
      makeRequest(validBody({ startTime: "14:00", durationMinutes: 60 }), { "Idempotency-Key": idempotencyKey }),
      deps
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    expect(secondBody.id).toBe(firstBody.id);
    expect((tables.bookings ?? []).filter((b) => b.idempotency_key === idempotencyKey)).toHaveLength(1);
  });

  it("rate limits repeated requests from the same client", async () => {
    const tables = buildTables();
    const deps = { getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }) };
    const fixedIp = "203.0.113.42";
    const requestFactory = (startHour: number) =>
      new Request("http://localhost/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": fixedIp },
        body: JSON.stringify(validBody({ startTime: `${String(startHour).padStart(2, "0")}:00`, durationMinutes: 30 })),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const res = await handleBookingRequest(requestFactory(6 + i), deps);
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  });
});

function buildTablesWithUpi(): FakeTables {
  const tables = buildTables();
  tables.turfs![0]!.upi_vpa = "turf@upi";
  tables.turfs![0]!.payee_name = "Test Turf Owner";
  tables.turfs![0]!.whatsapp_number = "9344689836";
  return tables;
}

describe("POST /api/bookings - payment method", () => {
  it("rejects a missing paymentMethod", async () => {
    const tables = buildTables();
    const body = validBody();
    delete (body as Record<string, unknown>).paymentMethod;
    const res = await handleBookingRequest(makeRequest(body), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid paymentMethod", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ paymentMethod: "cheque" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(400);
  });

  it("sets payment_status to unpaid for a cash booking", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ paymentMethod: "cash" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.paymentMethod).toBe("cash");
    expect(body.paymentStatus).toBe("unpaid");
    expect(body.upi).toBeNull();
  });

  it("sets payment_status to pending_verification for a upi booking and returns a UPI panel using the short reference", async () => {
    const tables = buildTablesWithUpi();
    const res = await handleBookingRequest(makeRequest(validBody({ paymentMethod: "upi" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.paymentMethod).toBe("upi");
    expect(body.paymentStatus).toBe("pending_verification");
    expect(body.upi).not.toBeNull();
    expect(body.upi.payeeVpa).toBe("turf@upi");
    expect(body.upi.reference).toBe(body.reference);
    expect(/^\d{5}$/.test(body.reference)).toBe(true);
    expect(body.upi.amount).toBe(body.totalPrice);
    expect(body.upi.uri).toContain("upi://pay?");
    expect(body.upi.uri).toContain(`tn=${body.reference}`);
  });

  it("rejects a upi booking when this turf hasn't configured UPI", async () => {
    const tables = buildTables(); // no upi_vpa/payee_name on this turf
    const res = await handleBookingRequest(makeRequest(validBody({ paymentMethod: "upi" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(400);
  });

  it("never trusts a client-submitted paymentStatus", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(
      makeRequest(validBody({ paymentMethod: "cash", paymentStatus: "paid" })),
      { getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.paymentStatus).toBe("unpaid"); // never the client-submitted "paid".
  });

  it("includes the turf's WhatsApp number in the response for the Notify button", async () => {
    const tables = buildTablesWithUpi();
    const res = await handleBookingRequest(makeRequest(validBody({ paymentMethod: "cash" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    const body = await res.json();
    expect(body.turfWhatsappNumber).toBe("9344689836");
  });
});

describe("POST /api/bookings - short reference", () => {
  afterEach(() => {
    forceShortReferenceCollisions(0);
  });

  it("returns a 5-digit string reference on every booking", async () => {
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody()), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    const body = await res.json();
    expect(typeof body.reference).toBe("string");
    expect(/^\d{5}$/.test(body.reference)).toBe(true);
  });

  it("retries once and still succeeds after a simulated short_reference collision", async () => {
    forceShortReferenceCollisions(1);
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ startTime: "11:00" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(/^\d{5}$/.test(body.reference)).toBe(true);
  });

  it("gives up after exhausting its retry budget and returns a clear error", async () => {
    forceShortReferenceCollisions(10); // more than MAX_SHORT_REFERENCE_RETRIES
    const tables = buildTables();
    const res = await handleBookingRequest(makeRequest(validBody({ startTime: "12:00" })), {
      getAdminClient: () => createFakeSupabaseClient(tables, { onInsert: bookingsInsertHandler }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/unique booking reference/i);
  });
});
