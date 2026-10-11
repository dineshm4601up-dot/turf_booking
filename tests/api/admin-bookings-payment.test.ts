import { describe, expect, it } from "vitest";
import { handlePaymentStatusPatch } from "../../src/app/api/admin/bookings/[id]/payment/route";
import { makeAdminDeps } from "../helpers/admin-deps";
import type { FakeTables } from "../helpers/fake-supabase";

const TURF_ID = "11111111-1111-4111-8111-111111111111";
const CASH_BOOKING = "22222222-2222-4222-8222-222222222222";
const UPI_BOOKING = "33333333-3333-4333-8333-333333333333";

function buildTables(): FakeTables {
  return {
    bookings: [
      {
        id: CASH_BOOKING,
        turf_id: TURF_ID,
        customer_name: "Alice",
        payment_method: "cash",
        payment_status: "unpaid",
        status: "confirmed",
      },
      {
        id: UPI_BOOKING,
        turf_id: TURF_ID,
        customer_name: "Bob",
        payment_method: "upi",
        payment_status: "pending_verification",
        status: "confirmed",
      },
    ],
    payment_events: [],
  };
}

function patchRequest(paymentStatus: string) {
  return new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ paymentStatus }) });
}

describe("PATCH /api/admin/bookings/:id/payment", () => {
  it("rejects an unauthenticated request", async () => {
    const tables = buildTables();
    const res = await handlePaymentStatusPatch(patchRequest("paid"), CASH_BOOKING, makeAdminDeps(tables, "unauthenticated"));
    expect(res.status).toBe(401);
  });

  it("rejects an authenticated non-admin", async () => {
    const tables = buildTables();
    const res = await handlePaymentStatusPatch(patchRequest("paid"), CASH_BOOKING, makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
    expect(tables.bookings![0]!.payment_status).toBe("unpaid");
  });

  it("rejects an invalid paymentStatus value", async () => {
    const tables = buildTables();
    const res = await handlePaymentStatusPatch(patchRequest("refunded"), CASH_BOOKING, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(400);
  });

  it("404s for a booking that doesn't exist", async () => {
    const tables = buildTables();
    const res = await handlePaymentStatusPatch(
      patchRequest("paid"),
      "99999999-9999-4999-8999-999999999999",
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(404);
  });

  it("rejects setting the same status it already has", async () => {
    const tables = buildTables();
    const res = await handlePaymentStatusPatch(patchRequest("unpaid"), CASH_BOOKING, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(400);
  });

  it("marks a cash booking as paid and records an audit event", async () => {
    const tables = buildTables();
    const res = await handlePaymentStatusPatch(patchRequest("paid"), CASH_BOOKING, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.payment_status).toBe("paid");
    expect(body.booking.payment_updated_at).toBeTruthy();

    expect(tables.payment_events).toHaveLength(1);
    expect(tables.payment_events![0]).toMatchObject({
      booking_id: CASH_BOOKING,
      previous_status: "unpaid",
      new_status: "paid",
    });
  });

  it("verifies a upi booking as paid", async () => {
    const tables = buildTables();
    const res = await handlePaymentStatusPatch(patchRequest("paid"), UPI_BOOKING, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    expect(tables.bookings![1]!.payment_status).toBe("paid");
  });

  it("marks a upi booking as failed", async () => {
    const tables = buildTables();
    const res = await handlePaymentStatusPatch(patchRequest("failed"), UPI_BOOKING, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    expect(tables.bookings![1]!.payment_status).toBe("failed");
  });

  it("never changes the booking's approval status, only payment_status", async () => {
    const tables = buildTables();
    const res = await handlePaymentStatusPatch(patchRequest("paid"), CASH_BOOKING, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    expect(tables.bookings![0]!.status).toBe("confirmed");
  });
});
