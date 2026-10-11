import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminAuthErrorResponse, checkAdminAuth } from "../src/lib/admin-auth";
import { createFakeSupabaseClient } from "./helpers/fake-supabase";

function fakeServerClient(user: { id: string; email: string } | null): SupabaseClient {
  return {
    auth: {
      async getUser() {
        if (!user) return { data: { user: null }, error: { message: "not authenticated" } };
        return { data: { user }, error: null };
      },
    },
  } as unknown as SupabaseClient;
}

describe("checkAdminAuth", () => {
  it("returns unauthenticated when there is no session", async () => {
    const result = await checkAdminAuth({
      getServerClient: async () => fakeServerClient(null),
      getAdminClient: () => createFakeSupabaseClient({ admin_users: [] }),
    });
    expect(result.status).toBe("unauthenticated");
  });

  it("returns forbidden for a signed-in user who is not in admin_users", async () => {
    const result = await checkAdminAuth({
      getServerClient: async () => fakeServerClient({ id: "user-1", email: "a@example.com" }),
      getAdminClient: () => createFakeSupabaseClient({ admin_users: [] }),
    });
    expect(result.status).toBe("forbidden");
  });

  it("returns ok for a signed-in user who is in admin_users", async () => {
    const result = await checkAdminAuth({
      getServerClient: async () => fakeServerClient({ id: "user-1", email: "a@example.com" }),
      getAdminClient: () => createFakeSupabaseClient({ admin_users: [{ user_id: "user-1" }] }),
    });
    expect(result).toEqual({ status: "ok", userId: "user-1", email: "a@example.com" });
  });

  it("never grants admin access just because a user is authenticated (no client-trusted flags)", async () => {
    const result = await checkAdminAuth({
      getServerClient: async () => fakeServerClient({ id: "user-2", email: "b@example.com" }),
      getAdminClient: () => createFakeSupabaseClient({ admin_users: [{ user_id: "user-1" }] }),
    });
    expect(result.status).toBe("forbidden");
  });
});

describe("adminAuthErrorResponse", () => {
  it("maps unauthenticated to 401", () => {
    const response = adminAuthErrorResponse({ status: "unauthenticated" });
    expect(response?.status).toBe(401);
  });
  it("maps forbidden to 403", () => {
    const response = adminAuthErrorResponse({ status: "forbidden" });
    expect(response?.status).toBe(403);
  });
  it("returns null (no early-exit) when ok", () => {
    const response = adminAuthErrorResponse({ status: "ok", userId: "u1", email: null });
    expect(response).toBeNull();
  });
});
