/**
 * App-level booking config that isn't turf-specific data (which now comes
 * from Supabase -- see src/types/database.ts). Shared between client and
 * server so duration validation can never drift between the two.
 */
export const DURATION_OPTIONS_MINUTES = [30, 60, 90, 120, 150, 180] as const;

export const BOOKING_DAYS_AHEAD = 14;

export const CURRENCY_SYMBOL = "₹";
