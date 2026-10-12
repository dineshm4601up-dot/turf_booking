import { timeToMinutes } from "@/lib/time";
import { isPhoneLike, isValidTimeString, validateNonBlankString, validatePositiveInteger } from "@/lib/validation";
import { isAmenityKey } from "@/config/turf";

export interface TurfInputResult {
  name: string;
  location: string;
  sport_type: string;
  opening_time: string;
  closing_time: string;
  slot_interval_minutes: number;
}

export type TurfValidation = { ok: true; value: TurfInputResult } | { ok: false; error: string };

export function validateTurfInput(input: Record<string, unknown>): TurfValidation {
  const nameResult = validateNonBlankString(input.name, { min: 2, max: 150, label: "Name" });
  if (!nameResult.ok) return { ok: false, error: nameResult.error };

  const locationResult = validateNonBlankString(input.location, { min: 2, max: 200, label: "Location" });
  if (!locationResult.ok) return { ok: false, error: locationResult.error };

  const sportTypeResult = validateNonBlankString(input.sportType, { min: 2, max: 150, label: "Sport type" });
  if (!sportTypeResult.ok) return { ok: false, error: sportTypeResult.error };

  if (typeof input.openingTime !== "string" || !isValidTimeString(input.openingTime)) {
    return { ok: false, error: "A valid openingTime (HH:mm) is required." };
  }
  if (typeof input.closingTime !== "string" || !isValidTimeString(input.closingTime)) {
    return { ok: false, error: "A valid closingTime (HH:mm) is required." };
  }
  if (timeToMinutes(input.openingTime) >= timeToMinutes(input.closingTime)) {
    return { ok: false, error: "closingTime must be later than openingTime." };
  }

  const slotIntervalResult = validatePositiveInteger(input.slotIntervalMinutes, {
    min: 5,
    max: 240,
    label: "slotIntervalMinutes",
  });
  if (!slotIntervalResult.ok) return { ok: false, error: slotIntervalResult.error };

  return {
    ok: true,
    value: {
      name: nameResult.value,
      location: locationResult.value,
      sport_type: sportTypeResult.value,
      opening_time: input.openingTime,
      closing_time: input.closingTime,
      slot_interval_minutes: slotIntervalResult.value,
    },
  };
}

/** Initial value only -- never a hardcoded destination; every turf can edit it afterward. */
export const DEFAULT_TURF_WHATSAPP_NUMBER = "9344689836";

export interface TurfPaymentInputResult {
  upi_vpa: string | null;
  upi_phone: string | null;
  payee_name: string | null;
  whatsapp_number: string;
  contact_phone: string | null;
}

export type TurfPaymentValidation =
  | { ok: true; value: TurfPaymentInputResult }
  | { ok: false; error: string };

function validateOptionalText(raw: unknown, max: number, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: `${label} must be text.` };
  const value = raw.trim();
  if (value.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value };
}

function validateOptionalPhoneLike(raw: unknown, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !isPhoneLike(raw)) {
    return { ok: false, error: `${label} must be a valid phone number.` };
  }
  return { ok: true, value: raw.trim() };
}

function validateRequiredPhoneLike(raw: unknown, label: string): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !isPhoneLike(raw)) {
    return { ok: false, error: `${label} must be a valid phone number.` };
  }
  return { ok: true, value: raw.trim() };
}

function validateOptionalVpa(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !/^[\w.-]{2,100}@[\w.-]{2,100}$/.test(raw.trim())) {
    return { ok: false, error: "upiVpa must look like a UPI ID (e.g. name@bank)." };
  }
  return { ok: true, value: raw.trim() };
}

/**
 * Separate from validateTurfInput's core fields (name/hours/etc.) because
 * every field here is optional except whatsappNumber -- an admin can save
 * the turf's hours without having UPI details ready yet, and the booking
 * API treats UPI as "available" only once both upi_vpa and payee_name are
 * actually set, regardless of when each was filled in.
 */
export function validateTurfPaymentInput(input: Record<string, unknown>): TurfPaymentValidation {
  const upiVpaResult = validateOptionalVpa(input.upiVpa);
  if (!upiVpaResult.ok) return upiVpaResult;

  const upiPhoneResult = validateOptionalPhoneLike(input.upiPhone, "upiPhone");
  if (!upiPhoneResult.ok) return upiPhoneResult;

  const payeeNameResult = validateOptionalText(input.payeeName, 150, "payeeName");
  if (!payeeNameResult.ok) return payeeNameResult;

  const whatsappResult = validateRequiredPhoneLike(input.whatsappNumber, "whatsappNumber");
  if (!whatsappResult.ok) return whatsappResult;

  const contactPhoneResult = validateOptionalPhoneLike(input.contactPhone, "contactPhone");
  if (!contactPhoneResult.ok) return contactPhoneResult;

  return {
    ok: true,
    value: {
      upi_vpa: upiVpaResult.value,
      upi_phone: upiPhoneResult.value,
      payee_name: payeeNameResult.value,
      whatsapp_number: whatsappResult.value,
      contact_phone: contactPhoneResult.value,
    },
  };
}

export interface TurfDisplayInputResult {
  is_verified: boolean;
  max_persons: number | null;
  turf_count: number;
  amenities: string[];
}

export type TurfDisplayValidation =
  | { ok: true; value: TurfDisplayInputResult }
  | { ok: false; error: string };

/**
 * Validates the Phase 8 home-page-redesign fields: all optional-ish in the
 * sense that a turf can be saved without any of them configured yet (the
 * customer UI simply omits the corresponding section), except turfCount
 * which always has a sensible default of 1.
 */
export function validateTurfDisplayInput(input: Record<string, unknown>): TurfDisplayValidation {
  const isVerified = Boolean(input.isVerified);

  let maxPersons: number | null = null;
  if (input.maxPersons !== undefined && input.maxPersons !== null && input.maxPersons !== "") {
    const maxPersonsResult = validatePositiveInteger(input.maxPersons, { min: 1, max: 1000, label: "maxPersons" });
    if (!maxPersonsResult.ok) return { ok: false, error: maxPersonsResult.error };
    maxPersons = maxPersonsResult.value;
  }

  const turfCountResult = validatePositiveInteger(input.turfCount ?? 1, { min: 1, max: 100, label: "turfCount" });
  if (!turfCountResult.ok) return { ok: false, error: turfCountResult.error };

  let amenities: string[] = [];
  if (input.amenities !== undefined && input.amenities !== null) {
    if (!Array.isArray(input.amenities) || !input.amenities.every((a) => typeof a === "string" && isAmenityKey(a))) {
      return { ok: false, error: "amenities must be an array of known amenity values." };
    }
    amenities = [...new Set(input.amenities as string[])];
  }

  return {
    ok: true,
    value: { is_verified: isVerified, max_persons: maxPersons, turf_count: turfCountResult.value, amenities },
  };
}
