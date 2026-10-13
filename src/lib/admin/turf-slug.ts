import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/slug";

/**
 * Finds a slug for `name` that isn't already used by a different turf,
 * appending "-2", "-3", ... to the base slug for each collision (matching
 * the backfill migration's own dedup numbering, so an admin-created turf's
 * slug follows the same convention as a backfilled one). Checks in-app
 * first so the common no-collision case needs no retry -- but this alone
 * is not the real safety net: two concurrent requests for the same new
 * name could both pass this check before either commits, so the caller's
 * INSERT/UPDATE must still handle a 23505 on turfs_slug_unique as the
 * actual authority (see POST /api/admin/turfs).
 */
export async function findAvailableSlug(
  admin: SupabaseClient,
  name: string,
  excludeTurfId?: string
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  // Defensive cap -- a real collision chain this long isn't a realistic
  // scenario for the number of turfs this app manages.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let query = admin.from("turfs").select("id").eq("slug", candidate);
    if (excludeTurfId) query = query.neq("id", excludeTurfId);
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return `${base}-${Date.now()}`;
}

export function isUniqueViolationOnSlug(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" && (error.message ?? "").includes("turfs_slug");
}
