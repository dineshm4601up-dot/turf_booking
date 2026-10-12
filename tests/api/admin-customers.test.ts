import { describe, expect, it } from "vitest";
import { handleAdminCustomersGet } from "../../src/app/api/admin/customers/route";
import { handleCustomerPatch } from "../../src/app/api/admin/customers/[id]/route";
import type { FakeTables } from "../helpers/fake-supabase";
import { makeAdminDeps } from "../helpers/admin-deps";

const CUSTOMER_A = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_B = "22222222-2222-4222-8222-222222222222";

function buildTables(): FakeTables {
  return {
    customers: [
      { id: CUSTOMER_A, phone: "9876543210", name: "Priya Sharma", created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" },
      { id: CUSTOMER_B, phone: "9000000000", name: "Rahul Verma", created_at: "2026-10-02T00:00:00.000Z", updated_at: "2026-10-02T00:00:00.000Z" },
    ],
    bookings: [
      { id: "booking-1", customer_id: CUSTOMER_A, booking_date: "2026-10-10", status: "confirmed" },
      { id: "booking-2", customer_id: CUSTOMER_A, booking_date: "2026-12-01", status: "pending" },
      { id: "booking-3", customer_id: CUSTOMER_B, booking_date: "2026-11-05", status: "confirmed" },
    ],
  };
}

describe("GET /api/admin/customers", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    const res = await handleAdminCustomersGet(new Request("http://localhost/api/admin/customers"), makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const tables = buildTables();
    const res = await handleAdminCustomersGet(new Request("http://localhost/api/admin/customers"), makeAdminDeps(tables, "unauthenticated"));
    expect(res.status).toBe(401);
  });

  it("lists customers with booking count and most recent booking date", async () => {
    const tables = buildTables();
    const res = await handleAdminCustomersGet(new Request("http://localhost/api/admin/customers"), makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    const priya = body.customers.find((c: { id: string }) => c.id === CUSTOMER_A);
    expect(priya.bookingCount).toBe(2);
    expect(priya.mostRecentBookingDate).toBe("2026-12-01");
    const rahul = body.customers.find((c: { id: string }) => c.id === CUSTOMER_B);
    expect(rahul.bookingCount).toBe(1);
  });

  it("reports zero bookings and a null most-recent-date for a customer with no bookings", async () => {
    const tables = buildTables();
    tables.customers!.push({
      id: "33333333-3333-4333-8333-333333333333",
      phone: "9111111111",
      name: "New Customer",
      created_at: "2026-10-03T00:00:00.000Z",
      updated_at: "2026-10-03T00:00:00.000Z",
    });
    const res = await handleAdminCustomersGet(new Request("http://localhost/api/admin/customers"), makeAdminDeps(tables, "admin"));
    const body = await res.json();
    const fresh = body.customers.find((c: { id: string }) => c.id === "33333333-3333-4333-8333-333333333333");
    expect(fresh.bookingCount).toBe(0);
    expect(fresh.mostRecentBookingDate).toBeNull();
  });

  it("searches by name", async () => {
    const tables = buildTables();
    const res = await handleAdminCustomersGet(
      new Request("http://localhost/api/admin/customers?search=priya"),
      makeAdminDeps(tables, "admin")
    );
    const body = await res.json();
    expect(body.customers).toHaveLength(1);
    expect(body.customers[0].id).toBe(CUSTOMER_A);
  });

  it("searches by mobile number", async () => {
    const tables = buildTables();
    const res = await handleAdminCustomersGet(
      new Request("http://localhost/api/admin/customers?search=9000000000"),
      makeAdminDeps(tables, "admin")
    );
    const body = await res.json();
    expect(body.customers).toHaveLength(1);
    expect(body.customers[0].id).toBe(CUSTOMER_B);
  });
});

describe("PATCH /api/admin/customers/:id", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    const res = await handleCustomerPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ name: "New Name" }) }),
      CUSTOMER_A,
      makeAdminDeps(tables, "non-admin")
    );
    expect(res.status).toBe(403);
  });

  it("edits the saved name for an admin", async () => {
    const tables = buildTables();
    const res = await handleCustomerPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ name: "Priya S. Sharma" }) }),
      CUSTOMER_A,
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customer.name).toBe("Priya S. Sharma");
    expect(tables.customers!.find((c) => c.id === CUSTOMER_A)!.name).toBe("Priya S. Sharma");
  });

  it("rejects an invalid name", async () => {
    const tables = buildTables();
    const res = await handleCustomerPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ name: "X" }) }),
      CUSTOMER_A,
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(400);
  });

  it("404s for a customer that doesn't exist", async () => {
    const tables = buildTables();
    const res = await handleCustomerPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ name: "New Name" }) }),
      "99999999-9999-4999-8999-999999999999",
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(404);
  });

  it("edits the phone number when it doesn't conflict with another customer", async () => {
    const tables = buildTables();
    const res = await handleCustomerPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ phone: "9999999999" }) }),
      CUSTOMER_A,
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customer.phone).toBe("9999999999");
  });

  it("prevents changing a customer's phone to one that already belongs to another customer", async () => {
    const tables = buildTables();
    // Simulates the real unique index on customers.phone
    // (idx_customers_phone_unique) rejecting the update, the same way it
    // would reject an insert -- see customers-aware onUpdate below.
    const onUpdate = (table: string, partial: Record<string, unknown>, matching: Record<string, unknown>[]) => {
      if (table !== "customers" || typeof partial.phone !== "string") return undefined;
      const conflict = (tables.customers ?? []).some(
        (c) => c.phone === partial.phone && !matching.some((m) => m.id === c.id)
      );
      if (!conflict) return undefined;
      return {
        error: { code: "23505", message: 'duplicate key value violates unique constraint "idx_customers_phone_unique"' },
      };
    };

    const res = await handleCustomerPatch(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ phone: "9000000000" }) }),
      CUSTOMER_A,
      makeAdminDeps(tables, "admin", { onUpdate })
    );
    expect(res.status).toBe(409);
    // The target customer's phone was never actually changed.
    expect(tables.customers!.find((c) => c.id === CUSTOMER_A)!.phone).toBe("9876543210");
  });
});
