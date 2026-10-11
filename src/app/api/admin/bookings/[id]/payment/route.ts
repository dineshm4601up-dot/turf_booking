import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { isPaymentStatus, type PaymentStatus } from "@/config/payment";
import { isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface BookingRow {
  id: string;
  payment_method: string | null;
  payment_status: PaymentStatus;
}

/**
 * The only way a booking's payment_status changes -- deliberately a
 * separate endpoint from the booking-status PATCH, so a payment
 * verification action can never be confused with (or smuggled into) a
 * booking approval/cancellation action. Customers and browser code never
 * call this; only an authorized admin, after checkAdminAuth(). Every
 * change is recorded in payment_events (who, from, to, when) and stamps
 * bookings.payment_updated_at, independent of the guarded UPDATE's
 * optimistic-concurrency check (same `.eq("payment_status", current)`
 * pattern as the booking-status route).
 */
export async function handlePaymentStatusPatch(
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
  const nextStatus = (body as Record<string, unknown>).paymentStatus;
  if (!isPaymentStatus(nextStatus)) {
    return NextResponse.json(
      { error: "paymentStatus must be one of: unpaid, pending_verification, paid, failed." },
      { status: 400 }
    );
  }

  const admin = deps.getAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("bookings")
    .select("id, payment_method, payment_status")
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();

  if (fetchError) {
    console.error("admin/bookings payment PATCH: fetch failed", fetchError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (existing.payment_status === nextStatus) {
    return NextResponse.json({ error: `Payment is already marked as "${nextStatus}".` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("bookings")
    .update({ payment_status: nextStatus, payment_updated_at: now })
    .eq("id", bookingId)
    .eq("payment_status", existing.payment_status)
    .select("id, turf_id, customer_name, booking_date, start_time, end_time, duration_minutes, total_price, status, payment_method, payment_status, payment_updated_at, created_at")
    .maybeSingle();

  if (updateError) {
    console.error("admin/bookings payment PATCH: update failed", updateError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "This booking's payment status was just updated by someone else. Please refresh and try again." },
      { status: 409 }
    );
  }

  const { error: auditError } = await admin.from("payment_events").insert({
    booking_id: bookingId,
    previous_status: existing.payment_status,
    new_status: nextStatus,
    changed_by: authResult.status === "ok" ? authResult.userId : null,
  });
  if (auditError) {
    // The payment status change itself already succeeded; losing the audit
    // row is logged but not surfaced as a failure to the admin.
    console.error("admin/bookings payment PATCH: failed to record audit event", auditError);
  }

  return NextResponse.json({ booking: updated }, { status: 200 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handlePaymentStatusPatch(request, id);
}
