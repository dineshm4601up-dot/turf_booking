export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Format AND calendar-validity check (rejects e.g. 2026-02-30). */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validateCustomerName(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "Name is required." };
  }
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 100) {
    return { ok: false, error: "Name must be between 2 and 100 characters." };
  }
  if (!/^[a-zA-ZÀ-ɏ' .-]+$/.test(value)) {
    return { ok: false, error: "Name can only contain letters, spaces, apostrophes, periods and hyphens." };
  }
  return { ok: true, value };
}

/**
 * Strict Indian mobile number normalization: strips only unambiguous
 * formatting (spaces, hyphens) and a leading country code (+91/91) or
 * trunk prefix (0), then requires exactly 10 digits starting with 6-9 --
 * the valid range for Indian mobile numbers. Any letter, symbol, or wrong
 * length fails here rather than being silently stripped away, so e.g.
 * "98765432ab" is rejected outright instead of being misread as something
 * that happens to count 10 digits.
 *
 * Returns the normalized bare 10-digit string (no country code, no
 * formatting) or null if the input isn't a valid Indian mobile number.
 * Both the booking API and the booking-lookup API call this exact
 * function, so a phone number is compared the same way everywhere it's
 * used, and the same normalized form is what's stored in `customer_phone`
 * (as text, per spec -- never parsed as a number).
 */
export function normalizeIndianMobileNumber(raw: string): string | null {
  let value = raw.trim().replace(/[\s-]/g, "");
  value = value.replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(value) ? value : null;
}

export function validateCustomerPhone(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "Mobile number is required." };
  }
  const normalized = normalizeIndianMobileNumber(raw);
  if (!normalized) {
    return {
      ok: false,
      error: "Enter a valid 10-digit Indian mobile number (digits only, starting with 6-9).",
    };
  }
  return { ok: true, value: normalized };
}

/**
 * Used by every mobile-number <input>'s onChange handler (not just its
 * `maxLength` attribute): strips anything that isn't a digit and truncates
 * to `maxLength`, so an 11th digit (or a pasted letter) never appears in
 * the field at all, rather than being accepted and only rejected later on
 * blur/submit.
 */
export function restrictToDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

/**
 * Looser than normalizeIndianMobileNumber: used for admin-entered contact
 * numbers (UPI phone, WhatsApp number, public contact number) that aren't
 * necessarily Indian mobile numbers in the strict 6-9/10-digit sense (a
 * landline, or a number with a country code the admin typed themselves).
 * Still rejects letters and obviously-wrong input.
 */
export function isPhoneLike(value: string): boolean {
  return /^[0-9+\-\s()]{7,20}$/.test(value.trim()) && /\d{7,}/.test(value.replace(/\D/g, ""));
}

export function validateNonBlankString(
  raw: unknown,
  { min = 1, max = 200, label = "This field" }: { min?: number; max?: number; label?: string } = {}
): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: `${label} is required.` };
  }
  const value = raw.trim();
  if (value.length < min || value.length > max) {
    return { ok: false, error: `${label} must be between ${min} and ${max} characters.` };
  }
  return { ok: true, value };
}

export function validatePositiveInteger(
  raw: unknown,
  { min = 1, max = 100_000, label = "This field" }: { min?: number; max?: number; label?: string } = {}
): ValidationResult<number> {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
    return { ok: false, error: `${label} must be a whole number between ${min} and ${max}.` };
  }
  return { ok: true, value: raw };
}

export function validateDayOfWeek(raw: unknown): ValidationResult<number> {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 6) {
    return { ok: false, error: "dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday)." };
  }
  return { ok: true, value: raw };
}

export function validatePrice(raw: unknown, label = "Price"): ValidationResult<number> {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return { ok: false, error: `${label} must be a positive number.` };
  }
  return { ok: true, value: Math.round(raw * 100) / 100 };
}

export function validateIdempotencyKey(raw: unknown): ValidationResult<string | null> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(raw)) {
    return { ok: false, error: "Invalid idempotency key." };
  }
  return { ok: true, value: raw };
}
