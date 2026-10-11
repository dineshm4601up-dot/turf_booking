import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAuthDeps } from "@/lib/admin-auth";
import { createFakeSupabaseClient, type FakeTables, type InsertHandler, type RpcHandler } from "./fake-supabase";

export type AuthScenario = "admin" | "non-admin" | "unauthenticated";

/**
 * Builds AdminAuthDeps for the three scenarios every admin route must
 * handle correctly: a real admin, a signed-in user who isn't an admin, and
 * nobody signed in at all. Mutates `tables.admin_users` to match the
 * scenario unless the caller already seeded it.
 */
export function makeAdminDeps(
  tables: FakeTables,
  scenario: AuthScenario,
  options: { onInsert?: InsertHandler; onRpc?: RpcHandler } = {}
): AdminAuthDeps {
  const adminUserId = "admin-user-1";
  if (!tables.admin_users) {
    tables.admin_users = scenario === "admin" ? [{ user_id: adminUserId }] : [];
  }

  return {
    getServerClient: async () =>
      ({
        auth: {
          async getUser() {
            if (scenario === "unauthenticated") {
              return { data: { user: null }, error: { message: "no session" } };
            }
            const userId = scenario === "admin" ? adminUserId : "non-admin-user-1";
            return { data: { user: { id: userId, email: `${userId}@example.com` } }, error: null };
          },
        },
      }) as unknown as SupabaseClient,
    getAdminClient: () => createFakeSupabaseClient(tables, options),
  };
}
