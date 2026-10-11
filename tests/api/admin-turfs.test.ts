import { describe, expect, it } from "vitest";
import { handleTurfsGet, handleTurfsPost } from "../../src/app/api/admin/turfs/route";
import { handleTurfPatch } from "../../src/app/api/admin/turfs/[id]/route";
import { handleBookingRequest } from "../../src/app/api/bookings/route";
import { makeAdminDeps } from "../helpers/admin-deps";
import type { FakeTables } from "../helpers/fake-supabase";

const TURF_ID = "11111111-1111-4111-8111-111111111111";

function buildTables(): FakeTables {
  return {
    turfs: [
      {
        id: TURF_ID,
        name: "Test Turf",
        location: "Test Location",
        sport_type: "Football",
        opening_time: "06:00",
        closing_time: "23:00",
        slot_interval_minutes: 30,
        is_active: true,
        upi_vpa: null,
        upi_phone: null,
        payee_name: null,
        whatsapp_number: "9344689836",
        contact_phone: null,
        created_at: new Date().toISOString(),
      },
    ],
  };
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/turfs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/turfs", () => {
  it("rejects an unauthenticated request", async () => {
    const tables = buildTables();
    const res = await handleTurfsGet(makeAdminDeps(tables, "unauthenticated"));
    expect(res.status).toBe(401);
  });

  it("rejects an authenticated non-admin", async () => {
    const tables = buildTables();
    const res = await handleTurfsGet(makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
  });

  it("lists turfs for an authorized admin", async () => {
    const tables = buildTables();
    const res = await handleTurfsGet(makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.turfs).toHaveLength(1);
  });
});

describe("POST /api/admin/turfs", () => {
  it("rejects a non-admin even with a perfectly valid body", async () => {
    const tables = buildTables();
    const res = await handleTurfsPost(
      postRequest({ name: "New Turf", location: "Test Location", sportType: "Cricket", openingTime: "06:00", closingTime: "22:00", slotIntervalMinutes: 30 }),
      makeAdminDeps(tables, "non-admin")
    );
    expect(res.status).toBe(403);
  });

  it("rejects closingTime not later than openingTime", async () => {
    const tables = buildTables();
    const res = await handleTurfsPost(
      postRequest({ name: "New Turf", location: "Test Location", sportType: "Cricket", openingTime: "22:00", closingTime: "22:00", slotIntervalMinutes: 30 }),
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(400);
  });

  it("rejects closingTime earlier than openingTime", async () => {
    const tables = buildTables();
    const res = await handleTurfsPost(
      postRequest({ name: "New Turf", location: "Test Location", sportType: "Cricket", openingTime: "22:00", closingTime: "06:00", slotIntervalMinutes: 30 }),
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(400);
  });

  it("creates a new, active turf for a valid admin request", async () => {
    const tables = buildTables();
    const res = await handleTurfsPost(
      postRequest({ name: "New Turf", location: "Test Location", sportType: "Cricket", openingTime: "06:00", closingTime: "22:00", slotIntervalMinutes: 30 }),
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.turf.is_active).toBe(true);
  });
});

describe("PATCH /api/admin/turfs/:id", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    const res = await handleTurfPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ isActive: false }) }),
      TURF_ID,
      makeAdminDeps(tables, "non-admin")
    );
    expect(res.status).toBe(403);
  });

  it("toggles is_active for an admin", async () => {
    const tables = buildTables();
    const res = await handleTurfPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ isActive: false }) }),
      TURF_ID,
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.turf.is_active).toBe(false);
  });

  it("rejects an edit that would make closingTime not later than openingTime", async () => {
    const tables = buildTables();
    const res = await handleTurfPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ openingTime: "23:00" }) }),
      TURF_ID,
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(400);
  });

  it("404s for a turf that doesn't exist", async () => {
    const tables = buildTables();
    const res = await handleTurfPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ isActive: false }) }),
      "99999999-9999-4999-8999-999999999999",
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(404);
  });

  it("deactivating a turf prevents new bookings without touching historical rows", async () => {
    const tables = buildTables();
    tables.bookings = [
      {
        id: "existing-booking-1",
        turf_id: TURF_ID,
        customer_name: "Past Customer",
        status: "confirmed",
      },
    ];

    const patchRes = await handleTurfPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ isActive: false }) }),
      TURF_ID,
      makeAdminDeps(tables, "admin")
    );
    expect(patchRes.status).toBe(200);

    // Historical booking untouched.
    expect(tables.bookings).toHaveLength(1);
    expect(tables.bookings![0]!.status).toBe("confirmed");

    // New booking attempt on the now-inactive turf is rejected.
    const bookingRes = await handleBookingRequest(
      new Request("http://localhost/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" },
        body: JSON.stringify({
          turfId: TURF_ID,
          bookingDate: "2099-01-01",
          startTime: "10:00",
          durationMinutes: 60,
          customerName: "New Customer",
          customerPhone: "9876543210",
          paymentMethod: "cash",
        }),
      }),
      { getAdminClient: () => makeAdminDeps(tables, "admin").getAdminClient() }
    );
    expect(bookingRes.status).toBe(404);
  });
});

describe("POST /api/admin/turfs - payment & contact fields", () => {
  it("defaults whatsappNumber to 9344689836 when creating a turf without one", async () => {
    const tables = buildTables();
    const res = await handleTurfsPost(
      postRequest({
        name: "New Turf",
        location: "Test Location",
        sportType: "Cricket",
        openingTime: "06:00",
        closingTime: "22:00",
        slotIntervalMinutes: 30,
      }),
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.turf.whatsapp_number).toBe("9344689836");
  });

  it("saves UPI VPA, payee name, UPI phone, WhatsApp number, and contact phone on create", async () => {
    const tables = buildTables();
    const res = await handleTurfsPost(
      postRequest({
        name: "New Turf",
        location: "Test Location",
        sportType: "Cricket",
        openingTime: "06:00",
        closingTime: "22:00",
        slotIntervalMinutes: 30,
        upiVpa: "owner@upi",
        upiPhone: "9876543210",
        payeeName: "Owner Name",
        whatsappNumber: "9123456780",
        contactPhone: "0441234567",
      }),
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.turf.upi_vpa).toBe("owner@upi");
    expect(body.turf.payee_name).toBe("Owner Name");
    expect(body.turf.whatsapp_number).toBe("9123456780");
    expect(body.turf.contact_phone).toBe("0441234567");
  });

  it("rejects a malformed UPI VPA", async () => {
    const tables = buildTables();
    const res = await handleTurfsPost(
      postRequest({
        name: "New Turf",
        location: "Test Location",
        sportType: "Cricket",
        openingTime: "06:00",
        closingTime: "22:00",
        slotIntervalMinutes: 30,
        upiVpa: "not-a-vpa",
      }),
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/admin/turfs/:id - payment & contact fields", () => {
  it("edits UPI/payee/WhatsApp/contact fields without touching core turf fields", async () => {
    const tables = buildTables();
    const res = await handleTurfPatch(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ upiVpa: "owner@upi", payeeName: "Owner Name" }),
      }),
      TURF_ID,
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.turf.upi_vpa).toBe("owner@upi");
    expect(body.turf.payee_name).toBe("Owner Name");
    // Untouched fields are preserved, not overwritten with blanks.
    expect(body.turf.name).toBe("Test Turf");
    expect(body.turf.whatsapp_number).toBe("9344689836");
  });

  it("never overwrites an existing field with a blank when that field isn't in the request", async () => {
    const tables = buildTables();
    tables.turfs![0]!.upi_vpa = "already-set@upi";
    tables.turfs![0]!.payee_name = "Already Set";

    const res = await handleTurfPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ contactPhone: "9988776655" }) }),
      TURF_ID,
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.turf.upi_vpa).toBe("already-set@upi");
    expect(body.turf.payee_name).toBe("Already Set");
    expect(body.turf.contact_phone).toBe("9988776655");
  });

  it("allows explicitly clearing a payment field by sending an empty string", async () => {
    const tables = buildTables();
    tables.turfs![0]!.upi_vpa = "already-set@upi";

    const res = await handleTurfPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ upiVpa: "" }) }),
      TURF_ID,
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.turf.upi_vpa).toBeNull();
  });

  it("rejects an invalid whatsappNumber", async () => {
    const tables = buildTables();
    const res = await handleTurfPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ whatsappNumber: "not a number" }) }),
      TURF_ID,
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(400);
  });
});
