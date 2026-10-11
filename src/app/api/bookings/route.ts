import { NextResponse } from "next/server";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DURATION_OPTIONS_MINUTES } from "@/config/turf";
import { getTurfUpiConfig, isPaymentMethod, type PaymentMethod, type PaymentStatus } from "@/config/payment";
import { addMinutesToTime, getDayOfWeek, getTodayDateString, timeToMinutes } from "@/lib/time";
import { calculateBookingPrice, type PricingPeriod } from "@/lib/pricing";
import { isRangeBookable, type BusyInterval } from "@/lib/slot-availability";
import { buildUpiPaymentUri } from "@/lib/upi";
import {
  isValidDateString,
  isValidTimeString,
  isValidUuid,
  validateCustomerName,
  validateCustomerPhone,
  validateIdempotencyKey,
} from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_SHORT_REFERENCE_RETRIES = 5;

interface TurfRow {
  id: string;
  name: string;
  opening_time: string;
  closing_time: string;
  slot_interval_minutes: number;
  is_active: boolean;
  upi_vpa: string | null;
  upi_phone: string | null;
  payee_name: string | null;
  whatsapp_number: string;
}

interface BookingRow {
  id: string;
  turf_id: string;
  customer_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_price: number;
  status: string;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  short_reference: string;
  created_at: string;
}

const BOOKING_SELECT_COLUMNS =
  "id, turf_id, customer_name, booking_date, start_time, end_time, duration_minutes, total_price, status, payment_method, payment_status, short_reference, created_at";

/**
 * Builds the UPI payment panel for a upi-method booking: VPA, payee name,
 * amount, the short 5-digit reference (not the uuid -- this is the one
 * customers and the turf owner actually read/communicate), and the
 * deep-link URI the QR code and "Pay with UPI" button both use. `turf`
 * carries that specific turf's own UPI details (per-turf config, not a
 * global setting). Returns null for a cash booking, or for a upi booking
 * if the turf somehow isn't configured for UPI (shouldn't happen -- the
 * booking API refuses to create a upi booking when it isn't -- but this
 * keeps the response honest rather than fabricating a panel either way).
 */
function buildUpiPanel(booking: BookingRow, turf: TurfRow) {
  if (booking.payment_method !== "upi") return null;
  const upiConfig = getTurfUpiConfig(turf);
  if (!upiConfig) return null;

  const amount = Number(booking.total_price);
  return {
    payeeVpa: upiConfig.payeeVpa,
    payeeName: upiConfig.payeeName,
    payeePhone: upiConfig.payeePhone,
    amount,
    reference: booking.short_reference,
    uri: buildUpiPaymentUri({
      payeeVpa: upiConfig.payeeVpa,
      payeeName: upiConfig.payeeName,
      amount,
      transactionNote: booking.short_reference,
    }),
  };
}

function toBookingResponse(booking: BookingRow, turf: TurfRow) {
  return {
    id: booking.id,
    reference: booking.short_reference,
    turfId: booking.turf_id,
    turfName: turf.name,
    turfWhatsappNumber: turf.whatsapp_number,
    customerName: booking.customer_name,
    bookingDate: booking.booking_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    durationMinutes: booking.duration_minutes,
    totalPrice: Number(booking.total_price),
    status: booking.status,
    paymentMethod: booking.payment_method,
    paymentStatus: booking.payment_status,
    upi: buildUpiPanel(booking, turf),
    createdAt: booking.created_at,
  };
}

function isUniqueViolationOn(error: PostgrestError, columnHint: string): boolean {
  return error.code === "23505" && (error.message ?? "").includes(columnHint);
}

export interface BookingDeps {
  getAdminClient: () => SupabaseClient;
}

const defaultDeps: BookingDeps = { getAdminClient: createSupabaseAdminClient };

/**
 * The actual handler, with the Supabase client injected so tests can supply
 * a fake one instead of mocking the module. POST below is the thin Next.js
 * entry point that wires in the real client.
 */
export async function handleBookingRequest(request: Request, deps: BookingDeps = defaultDeps) {
  const rateLimit = checkRateLimit(`bookings:${getClientIp(request)}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many booking attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const turfId = input.turfId;
  const bookingDate = input.bookingDate;
  const startTime = input.startTime;
  const durationMinutes = input.durationMinutes;

  if (typeof turfId !== "string" || !isValidUuid(turfId)) {
    return NextResponse.json({ error: "A valid turfId is required." }, { status: 400 });
  }
  if (typeof bookingDate !== "string" || !isValidDateString(bookingDate)) {
    return NextResponse.json({ error: "A valid bookingDate (YYYY-MM-DD) is required." }, { status: 400 });
  }
  if (typeof startTime !== "string" || !isValidTimeString(startTime)) {
    return NextResponse.json({ error: "A valid startTime (HH:mm) is required." }, { status: 400 });
  }
  if (
    typeof durationMinutes !== "number" ||
    !DURATION_OPTIONS_MINUTES.includes(durationMinutes as (typeof DURATION_OPTIONS_MINUTES)[number])
  ) {
    return NextResponse.json(
      { error: `durationMinutes must be one of: ${DURATION_OPTIONS_MINUTES.join(", ")}.` },
      { status: 400 }
    );
  }

  if (!isPaymentMethod(input.paymentMethod)) {
    return NextResponse.json(
      { error: `paymentMethod must be one of: cash, upi.` },
      { status: 400 }
    );
  }
  const paymentMethod = input.paymentMethod;

  const nameResult = validateCustomerName(input.customerName);
  if (!nameResult.ok) {
    return NextResponse.json({ error: nameResult.error }, { status: 400 });
  }
  const phoneResult = validateCustomerPhone(input.customerPhone);
  if (!phoneResult.ok) {
    return NextResponse.json({ error: phoneResult.error }, { status: 400 });
  }
  const idempotencyKeyResult = validateIdempotencyKey(
    request.headers.get("Idempotency-Key") ?? input.idempotencyKey
  );
  if (!idempotencyKeyResult.ok) {
    return NextResponse.json({ error: idempotencyKeyResult.error }, { status: 400 });
  }
  const idempotencyKey = idempotencyKeyResult.value;

  let admin: SupabaseClient;
  try {
    admin = deps.getAdminClient();
  } catch {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const TURF_SELECT_FOR_BOOKING =
    "id, name, opening_time, closing_time, slot_interval_minutes, is_active, upi_vpa, upi_phone, payee_name, whatsapp_number";

  // Idempotent replay: a retried request with the same key returns the
  // booking already created by the original attempt instead of erroring
  // or creating a second one.
  if (idempotencyKey) {
    const { data: existing, error: existingError } = await admin
      .from("bookings")
      .select(BOOKING_SELECT_COLUMNS)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle<BookingRow>();

    if (existingError) {
      console.error("bookings: failed to check idempotency key", existingError);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
    if (existing) {
      const { data: existingTurf } = await admin
        .from("turfs")
        .select(TURF_SELECT_FOR_BOOKING)
        .eq("id", existing.turf_id)
        .maybeSingle<TurfRow>();
      if (existingTurf) {
        return NextResponse.json(toBookingResponse(existing, existingTurf), { status: 200 });
      }
    }
  }

  const { data: turf, error: turfError } = await admin
    .from("turfs")
    .select(TURF_SELECT_FOR_BOOKING)
    .eq("id", turfId)
    .maybeSingle<TurfRow>();

  if (turfError) {
    console.error("bookings: failed to load turf", turfError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!turf || !turf.is_active) {
    return NextResponse.json({ error: "Turf not found or is not currently accepting bookings." }, { status: 404 });
  }
  if (paymentMethod === "upi" && !getTurfUpiConfig(turf)) {
    return NextResponse.json(
      { error: "UPI payment isn't available for this turf yet. Please choose Cash at the turf instead." },
      { status: 400 }
    );
  }

  const endTime = addMinutesToTime(startTime, durationMinutes);

  const offsetFromOpening = timeToMinutes(startTime) - timeToMinutes(turf.opening_time);
  if (offsetFromOpening < 0 || offsetFromOpening % turf.slot_interval_minutes !== 0) {
    return NextResponse.json(
      { error: "Start time does not align with this turf's booking schedule." },
      { status: 400 }
    );
  }
  if (timeToMinutes(endTime) > timeToMinutes(turf.closing_time)) {
    return NextResponse.json(
      { error: "The selected duration extends past the turf's closing time." },
      { status: 400 }
    );
  }

  const todayStr = getTodayDateString();
  if (bookingDate < todayStr) {
    return NextResponse.json({ error: "Cannot book a date in the past." }, { status: 400 });
  }
  if (bookingDate === todayStr) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (timeToMinutes(startTime) < nowMinutes) {
      return NextResponse.json({ error: "Cannot book a time in the past." }, { status: 400 });
    }
  }

  const [blocksResult, pricingResult] = await Promise.all([
    admin.from("turf_blocks").select("start_time, end_time").eq("turf_id", turfId).eq("block_date", bookingDate),
    admin
      .from("turf_pricing")
      .select("start_time, end_time, price_per_hour")
      .eq("turf_id", turfId)
      .eq("day_of_week", getDayOfWeek(bookingDate)),
  ]);

  if (blocksResult.error || pricingResult.error) {
    console.error("bookings: failed to load blocks/pricing", blocksResult.error, pricingResult.error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const busyIntervals: BusyInterval[] = (blocksResult.data ?? []).map((b) => ({
    startTime: b.start_time,
    endTime: b.end_time,
  }));
  const blockedBookable = isRangeBookable({
    startTime,
    endTime,
    openingTime: turf.opening_time,
    closingTime: turf.closing_time,
    busyIntervals,
  });
  if (!blockedBookable) {
    return NextResponse.json(
      { error: "This time is blocked and unavailable for booking. Please select another time." },
      { status: 409 }
    );
  }

  const pricingPeriods: PricingPeriod[] = (pricingResult.data ?? []).map((p) => ({
    startTime: p.start_time,
    endTime: p.end_time,
    pricePerHour: Number(p.price_per_hour),
  }));
  const priceResult = calculateBookingPrice(pricingPeriods, startTime, endTime);
  if (!priceResult.ok) {
    console.error("bookings: pricing configuration error", priceResult.error, { turfId, bookingDate, startTime, endTime });
    return NextResponse.json(
      { error: "This turf's pricing isn't fully configured for the selected time. Please contact the turf directly." },
      { status: 422 }
    );
  }

  const insertPayload = {
    turf_id: turfId,
    customer_name: nameResult.value,
    customer_phone: phoneResult.value,
    booking_date: bookingDate,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationMinutes,
    total_price: priceResult.totalPrice,
    status: "pending",
    payment_method: paymentMethod,
    payment_status: paymentMethod === "upi" ? "pending_verification" : "unpaid",
    idempotency_key: idempotencyKey,
  };

  // The database's exclusion constraint (Phase 2) is the final, authoritative
  // guard against double-booking under concurrent requests -- everything
  // above is a best-effort pre-check, not a substitute for it. A collision
  // on the short_reference's unique constraint is retried (not fatal): the
  // column's DEFAULT generates a fresh random candidate on every fresh
  // INSERT attempt, so retrying is enough to resolve it under all but
  // near-total exhaustion of the ~90,000-value space.
  let inserted: BookingRow | null = null;
  let insertError: PostgrestError | null = null;

  for (let attempt = 0; attempt < MAX_SHORT_REFERENCE_RETRIES; attempt += 1) {
    const result = await admin.from("bookings").insert(insertPayload).select(BOOKING_SELECT_COLUMNS).single<BookingRow>();
    if (!result.error) {
      inserted = result.data;
      insertError = null;
      break;
    }
    insertError = result.error;
    if (isUniqueViolationOn(result.error, "short_reference")) {
      continue;
    }
    break;
  }

  if (!inserted) {
    const message = insertError?.message ?? "";
    if (message.includes("SHORT_REFERENCE_EXHAUSTED")) {
      console.error("bookings: short_reference pool exhausted");
      return NextResponse.json(
        { error: "No booking references are available right now. Please contact the turf directly." },
        { status: 503 }
      );
    }
    if (insertError?.code === "23P01") {
      return NextResponse.json(
        { error: "Sorry, this slot was just booked. Please select another time." },
        { status: 409 }
      );
    }
    if (insertError && isUniqueViolationOn(insertError, "idempotency_key") && idempotencyKey) {
      const { data: raceWinner } = await admin
        .from("bookings")
        .select(BOOKING_SELECT_COLUMNS)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle<BookingRow>();
      if (raceWinner) {
        return NextResponse.json(toBookingResponse(raceWinner, turf), { status: 200 });
      }
    }
    if (insertError && isUniqueViolationOn(insertError, "short_reference")) {
      return NextResponse.json(
        { error: "Could not generate a unique booking reference. Please try again." },
        { status: 500 }
      );
    }
    console.error("bookings: insert failed", insertError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(toBookingResponse(inserted, turf), { status: 201 });
}

export async function POST(request: Request) {
  return handleBookingRequest(request);
}
