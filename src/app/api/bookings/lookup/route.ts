import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTurfUpiConfig, type PaymentMethod, type PaymentStatus } from "@/config/payment";
import { getTodayDateString } from "@/lib/time";
import { buildUpiPaymentUri } from "@/lib/upi";
import { sortBookingsForLookup } from "@/lib/booking-lookup";
import { isValidShortReference, validateCustomerPhone } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Tighter than the booking-creation limit: the lookup credential is now a
// 5-digit code (see the module doc comment below for why), so this budget
// is deliberately stingy to make brute-forcing it impractical.
const RATE_LIMIT_MAX_REQUESTS = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;

interface BookingRow {
  id: string;
  turf_id: string;
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
  // supabase-js can't infer the embed's cardinality without a typed
  // Database schema, so it may type this as an object or an array
  // depending on the query shape -- handle both at runtime.
  turfs: { name: string; upi_vpa: string | null; payee_name: string | null; upi_phone: string | null } | { name: string; upi_vpa: string | null; payee_name: string | null; upi_phone: string | null }[] | null;
}

function getTurf(turfs: BookingRow["turfs"]) {
  if (!turfs) return null;
  return Array.isArray(turfs) ? (turfs[0] ?? null) : turfs;
}

function toLookupResponse(booking: BookingRow) {
  const turf = getTurf(booking.turfs);
  let upi = null;
  if (booking.payment_method === "upi" && turf) {
    const upiConfig = getTurfUpiConfig(turf);
    if (upiConfig) {
      const amount = Number(booking.total_price);
      upi = {
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
  }

  return {
    reference: booking.short_reference,
    turfName: turf?.name ?? "",
    bookingDate: booking.booking_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    durationMinutes: booking.duration_minutes,
    totalPrice: Number(booking.total_price),
    status: booking.status,
    paymentMethod: booking.payment_method,
    paymentStatus: booking.payment_status,
    upi,
  };
}

export interface BookingLookupDeps {
  getAdminClient: () => SupabaseClient;
}

const defaultDeps: BookingLookupDeps = { getAdminClient: createSupabaseAdminClient };

/**
 * A phone number alone proves nothing about ownership, so this never
 * returns data from a phone number by itself. The caller must also supply
 * the specific 5-digit booking reference shown on one of their own
 * confirmations. Only once that exact (phone, reference) pair matches an
 * existing booking do we reveal every booking under that phone number.
 *
 * Security trade-off, documented rather than hidden: a 5-digit reference
 * (90,000 possible values) is far weaker than the Phase 5 design this
 * replaces, which used the booking's full uuid (effectively unguessable)
 * as the credential. That uuid is no longer shown to customers at all
 * (replaced by the short reference everywhere, per spec), so it can no
 * longer be what the customer types back in here either. The tighter rate
 * limit above and the still-required exact phone match are the mitigation;
 * see README for the full trade-off writeup. True OTP verification isn't
 * implemented: no SMS/OTP provider is configured in this environment, and
 * this app does not pretend one is.
 */
export async function handleBookingLookupRequest(
  request: Request,
  deps: BookingLookupDeps = defaultDeps
) {
  const rateLimit = checkRateLimit(`bookings-lookup:${getClientIp(request)}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many lookup attempts. Please wait a while and try again." },
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

  const phoneResult = validateCustomerPhone(input.phone);
  if (!phoneResult.ok) {
    return NextResponse.json({ error: phoneResult.error }, { status: 400 });
  }
  const reference = typeof input.reference === "string" ? input.reference.trim() : "";
  if (!isValidShortReference(reference)) {
    return NextResponse.json({ error: "A valid 5-digit booking reference is required." }, { status: 400 });
  }

  const admin = deps.getAdminClient();

  const { data: ownedBooking, error: ownershipError } = await admin
    .from("bookings")
    .select("id")
    .eq("short_reference", reference)
    .eq("customer_phone", phoneResult.value)
    .maybeSingle();

  if (ownershipError) {
    console.error("bookings/lookup: ownership check failed", ownershipError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!ownedBooking) {
    return NextResponse.json(
      { error: "No booking found for that mobile number and reference. Double-check both and try again." },
      { status: 404 }
    );
  }

  const { data: bookings, error: bookingsError } = await admin
    .from("bookings")
    .select(
      "id, turf_id, booking_date, start_time, end_time, duration_minutes, total_price, status, payment_method, payment_status, short_reference, created_at, turfs(name, upi_vpa, payee_name, upi_phone)"
    )
    .eq("customer_phone", phoneResult.value);

  if (bookingsError) {
    console.error("bookings/lookup: failed to load bookings", bookingsError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const sorted = sortBookingsForLookup((bookings ?? []) as BookingRow[], getTodayDateString());
  return NextResponse.json({ bookings: sorted.map(toLookupResponse) }, { status: 200 });
}

export async function POST(request: Request) {
  return handleBookingLookupRequest(request);
}
