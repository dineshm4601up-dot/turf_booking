export type BookingStatus = "pending" | "confirmed" | "cancelled";

export function isBookingStatus(value: unknown): value is BookingStatus {
  return value === "pending" || value === "confirmed" || value === "cancelled";
}

/**
 * The only admin-driven status changes allowed: pending -> confirmed,
 * pending -> cancelled, confirmed -> cancelled. Everything else (including
 * any transition out of 'cancelled', which is terminal) is rejected.
 * Confirming never needs a fresh overlap check: a pending booking already
 * occupies its slot under the bookings_no_overlap exclusion constraint
 * (its WHERE clause only excludes 'cancelled'), so moving it to 'confirmed'
 * can't newly conflict with anything that wasn't already blocked.
 */
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled"],
  cancelled: [],
};

export function isValidStatusTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

const CUSTOMER_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Awaiting approval",
  confirmed: "Approved",
  cancelled: "Cancelled",
};

/** Customer-facing phrasing -- "pending"/"confirmed" read as internal jargon; this is what a customer actually wants to know. */
export function getCustomerStatusLabel(status: BookingStatus): string {
  return CUSTOMER_STATUS_LABELS[status];
}
