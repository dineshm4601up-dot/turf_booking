/**
 * WhatsApp's click-to-chat URLs expect digits only (optionally with a
 * country code, no "+"). Indian numbers are assumed when exactly 10 digits
 * are given (the normal case for a WhatsApp number entered by an admin);
 * a number already carrying the "91" country code is left as-is.
 */
export function normalizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function buildWhatsappClickToChatUrl(phone: string, message: string): string {
  const normalized = normalizeWhatsappNumber(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export interface BookingWhatsAppMessageDetails {
  shortReference: string;
  turfName: string;
  customerName: string;
  customerPhone: string;
  bookingDateLabel: string;
  startTimeLabel: string;
  endTimeLabel: string;
  durationLabel: string;
  totalAmount: number;
  currencySymbol: string;
  paymentMethodLabel: string;
  paymentStatusLabel: string;
  bookingStatusLabel: string;
}

/** Matches the exact template the turf owner sees -- this is what gets prefilled, never sent automatically. */
export function buildBookingWhatsAppMessage(details: BookingWhatsAppMessageDetails): string {
  return [
    "New Turf Booking Request",
    "",
    `Booking Reference: ${details.shortReference}`,
    `Turf Name: ${details.turfName}`,
    `Customer Name: ${details.customerName}`,
    `Customer Mobile: ${details.customerPhone}`,
    `Booking Date: ${details.bookingDateLabel}`,
    `Start Time: ${details.startTimeLabel}`,
    `End Time: ${details.endTimeLabel}`,
    `Duration: ${details.durationLabel}`,
    `Total Amount: ${details.currencySymbol}${details.totalAmount}`,
    `Payment Method: ${details.paymentMethodLabel}`,
    `Payment Status: ${details.paymentStatusLabel}`,
    `Booking Status: ${details.bookingStatusLabel}`,
    "",
    "Please review and confirm this booking.",
  ].join("\n");
}
