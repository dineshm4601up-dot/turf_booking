import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { isBookingStatus, isValidStatusTransition, type BookingStatus } from "@/lib/booking-status";
import { isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface BookingRow {
  id: string;
  turf_id: string;
  customer_name: string;
  customer_phone: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_price: number;
  status: BookingStatus;
  created_at: string;
}

/**
 * The only way a booking's status changes. Customers and browser code
 * never call this directly -- there is no client-writable status field
 * anywhere else. Concurrency is handled with a guarded UPDATE
 * (`.eq("status", currentStatus)`): if another admin changed the status in
 * the meantime, zero rows match and we report a conflict instead of
 * silently overwriting their change.
 */
export async function handleBookingStatusPatch(
  request: Request,
  bookingId: string,
  deps: AdminAuthDeps = defaultAdminAuthDeps
) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  if (!isValidUuid(bookingId)) {
    return NextResponse.json({ error: "A valid booking id is required." }, { status: 400 });
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
  const nextStatus = (body as Record<string, unknown>).status;
  if (!isBookingStatus(nextStatus)) {
    return NextResponse.json({ error: "status must be one of pending, confirmed, cancelled." }, { status: 400 });
  }

  const admin = deps.getAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("bookings")
    .select(
      "id, turf_id, customer_name, customer_phone, booking_date, start_time, end_time, duration_minutes, total_price, status, created_at"
    )
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();

  if (fetchError) {
    console.error("admin/bookings PATCH: fetch failed", fetchError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (!isValidStatusTransition(existing.status, nextStatus)) {
    return NextResponse.json(
      { error: `Cannot change status from "${existing.status}" to "${nextStatus}".` },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await admin
    .from("bookings")
    .update({ status: nextStatus })
    .eq("id", bookingId)
    .eq("status", existing.status)
    .select(
      "id, turf_id, customer_name, customer_phone, booking_date, start_time, end_time, duration_minutes, total_price, status, created_at"
    )
    .maybeSingle<BookingRow>();

  if (updateError) {
    console.error("admin/bookings PATCH: update failed", updateError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "This booking was just updated by someone else. Please refresh and try again." },
      { status: 409 }
    );
  }

  return NextResponse.json({ booking: updated }, { status: 200 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleBookingStatusPatch(request, id);
}
