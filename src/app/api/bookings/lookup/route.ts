import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTurfUpiConfig, type PaymentMethod, type PaymentStatus } from "@/config/payment";
import { getTodayDateString } from "@/lib/time";
import { buildUpiPaymentUri } from "@/lib/upi";
import { sortBookingsForLookup } from "@/lib/booking-lookup";
import { validateCustomerPhone } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Abuse protection for a lookup that's intentionally phone-number-only (see
// the module doc comment below): this bounds how many distinct phone
// numbers one client can probe per window, without requiring any paid
// SMS/OTP service.
const RATE_LIMIT_MAX_REQUESTS = 15;
const RATE_LIMIT_WINDOW_MS = 5 * 60_000;

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
      const note = `${turf.name} ${booking.booking_date} ${booking.start_time}`;
      upi = {
        payeeVpa: upiConfig.payeeVpa,
        payeeName: upiConfig.payeeName,
        payeePhone: upiConfig.payeePhone,
        amount,
        note,
        uri: buildUpiPaymentUri({
          payeeVpa: upiConfig.payeeVpa,
          payeeName: upiConfig.payeeName,
          amount,
          transactionNote: note,
        }),
      };
    }
  }

  // Deliberately omits `id` (internal uuid) and `customer_phone`: nothing
  // in the UI needs either, and the booking is identified to the customer
  // by its turf/date/time/status instead.
  return {
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
 * Business requirement: customers look up their own bookings using only
 * their 10-digit mobile number -- no OTP, no booking reference, no login.
 * This intentionally means anyone who knows a customer's mobile number can
 * see that customer's booking history (turf, date, time, amount, payment
 * status). That is a real, deliberate reduction in confidentiality versus a
 * design that required a second secret -- it is not hidden here: the phone
 * number is still never returned in the response, no admin-only fields
 * (status-changing endpoints, pricing config, other customers' data) are
 * reachable from this route, and rate limiting bounds bulk probing of
 * numbers from a single client. See README for the full writeup.
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

  const admin = deps.getAdminClient();

  const { data: bookings, error: bookingsError } = await admin
    .from("bookings")
    .select(
      "id, turf_id, booking_date, start_time, end_time, duration_minutes, total_price, status, payment_method, payment_status, created_at, turfs(name, upi_vpa, payee_name, upi_phone)"
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
