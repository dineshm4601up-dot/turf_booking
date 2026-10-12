import { describe, expect, it } from "vitest";
import { handleCustomerLookupRequest } from "../../src/app/api/customers/lookup/route";
import { createFakeSupabaseClient, type FakeTables } from "../helpers/fake-supabase";

const PHONE_KNOWN = "9876543210";
const PHONE_UNKNOWN = "9000000000";

function buildTables(): FakeTables {
  return {
    customers: [
      {
        id: "customer-1",
        phone: PHONE_KNOWN,
        name: "Priya Sharma",
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-01T00:00:00.000Z",
      },
    ],
  };
}

let ipCounter = 0;
function makeRequest(body: Record<string, unknown>) {
  ipCounter += 1;
  return new Request("http://localhost/api/customers/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `30.0.0.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

describe("POST /api/customers/lookup", () => {
  it("rejects a malformed phone number", async () => {
    const tables = buildTables();
    const res = await handleCustomerLookupRequest(makeRequest({ phone: "123" }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(400);
  });

  it("returns the saved name for a known number", async () => {
    const tables = buildTables();
    const res = await handleCustomerLookupRequest(makeRequest({ phone: PHONE_KNOWN }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Priya Sharma");
  });

  it("returns null (not an error) for an unknown number", async () => {
    const tables = buildTables();
    const res = await handleCustomerLookupRequest(makeRequest({ phone: PHONE_UNKNOWN }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBeNull();
  });

  it("never exposes the internal customer id", async () => {
    const tables = buildTables();
    const res = await handleCustomerLookupRequest(makeRequest({ phone: PHONE_KNOWN }), {
      getAdminClient: () => createFakeSupabaseClient(tables),
    });
    const body = await res.json();
    expect(body.id).toBeUndefined();
    expect(Object.keys(body)).toEqual(["name"]);
  });

  it("rate limits repeated lookup attempts from the same client", async () => {
    const tables = buildTables();
    const deps = { getAdminClient: () => createFakeSupabaseClient(tables) };
    const fixedIp = "203.0.113.200";
    const requestFactory = () =>
      new Request("http://localhost/api/customers/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": fixedIp },
        body: JSON.stringify({ phone: PHONE_KNOWN }),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const res = await handleCustomerLookupRequest(requestFactory(), deps);
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
