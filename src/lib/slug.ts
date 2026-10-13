/**
 * Turns a turf name into a URL-safe slug: lowercase ASCII letters, digits,
 * and single hyphens between words, with no leading/trailing hyphen (e.g.
 * "The 4th Zone Turf" -> "the-4th-zone-turf"). Matches the same algorithm
 * the backfill migration
 * (supabase/migrations/20261018000001_add_turf_slugs.sql) uses in SQL, so
 * a freshly created turf's slug looks exactly like one an existing turf
 * would have gotten from the backfill -- one algorithm, not two to keep in
 * sync.
 *
 * A name with no slug-able characters at all (rare, but not impossible)
 * falls back to a fixed base rather than producing an empty string; the
 * caller is still responsible for uniqueness (see
 * src/lib/admin/turf-slug.ts) since a fallback like this is exactly where
 * a collision is most likely.
 */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "turf";
}
