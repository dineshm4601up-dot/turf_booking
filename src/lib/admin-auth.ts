import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";

export interface AdminAuthDeps {
  /** Cookie-bound client (anon key) used only to identify the caller. */
  getServerClient: () => Promise<SupabaseClient>;
  /** Service-role client used only to check admin_users membership -- never trust a client-supplied role. */
  getAdminClient: () => SupabaseClient;
}

export const defaultAdminAuthDeps: AdminAuthDeps = {
  getServerClient: createSupabaseServerClient,
  getAdminClient: createSupabaseAdminClient,
};

export type AdminAuthResult =
  | { status: "ok"; userId: string; email: string | null }
  | { status: "unauthenticated" }
  | { status: "forbidden" };

/**
 * The one function every admin page and every admin API route must call
 * before doing anything. Two separate clients, by design:
 *
 * 1. `getServerClient()` (anon key, bound to the request's cookies) answers
 *    "who is making this request" -- `auth.getUser()` validates the JWT
 *    with the Auth server rather than trusting an unverified cookie claim.
 * 2. `getAdminClient()` (service role) answers "is that verified user an
 *    admin", by checking admin_users -- a table RLS deliberately makes
 *    unreadable to the anon/authenticated roles (see Phase 2), so this
 *    check can only happen server-side with the service-role key, never by
 *    trusting anything the client sent.
 */
export async function checkAdminAuth(deps: AdminAuthDeps = defaultAdminAuthDeps): Promise<AdminAuthResult> {
  const serverClient = await deps.getServerClient();
  const { data: userData, error: userError } = await serverClient.auth.getUser();

  if (userError || !userData.user) {
    return { status: "unauthenticated" };
  }

  const adminClient = deps.getAdminClient();
  const { data: adminRow } = await adminClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminRow) {
    return { status: "forbidden" };
  }

  return { status: "ok", userId: userData.user.id, email: userData.user.email ?? null };
}

/** For Route Handlers: returns a response to return immediately, or null if the caller is an authorized admin. */
export function adminAuthErrorResponse(result: AdminAuthResult): NextResponse | null {
  if (result.status === "unauthenticated") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (result.status === "forbidden") {
    return NextResponse.json({ error: "You do not have administrator access." }, { status: 403 });
  }
  return null;
}
