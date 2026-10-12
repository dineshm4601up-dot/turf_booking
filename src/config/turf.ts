/**
 * App-level booking config that isn't turf-specific data (which now comes
 * from Supabase -- see src/types/database.ts). Shared between client and
 * server so duration validation can never drift between the two.
 */
export const DURATION_OPTIONS_MINUTES = [30, 60, 90, 120, 150, 180] as const;

export const BOOKING_DAYS_AHEAD = 14;

export const CURRENCY_SYMBOL = "₹";

/**
 * The fixed, known set of amenities a turf can advertise -- kept in sync
 * with the `turfs_amenities_known_values` check constraint (see
 * supabase/migrations/20261016000001_turf_display_fields.sql). Admin UI
 * renders these as checkboxes; the customer page renders only the ones a
 * turf has actually selected (never showing an amenity it doesn't have,
 * never fabricating one it hasn't configured).
 */
export const AMENITY_OPTIONS = [
  { key: "parking", label: "Parking" },
  { key: "restroom", label: "Rest room" },
  { key: "sports_kits", label: "Sports kits" },
  { key: "dressing_room", label: "Dressing room" },
  { key: "drinking_water", label: "Drinking water" },
  { key: "wifi", label: "WiFi" },
] as const;

export type AmenityKey = (typeof AMENITY_OPTIONS)[number]["key"];

export function isAmenityKey(value: string): value is AmenityKey {
  return (AMENITY_OPTIONS as readonly { key: string }[]).some((o) => o.key === value);
}
