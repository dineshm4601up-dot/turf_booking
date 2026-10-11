import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client using the service-role/secret key, which bypasses Row
 * Level Security. The `server-only` import makes any accidental client-side
 * import of this module a build error. Not called anywhere yet — reserved
 * for the Phase 3 server-side booking API, which needs to write bookings
 * that anon clients are intentionally not allowed to write directly.
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
