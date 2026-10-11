import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Deleting a pricing rule never touches bookings: total_price is stored on
 * the booking row at creation time, not recalculated from turf_pricing, so
 * historical totals are unaffected by this (or by any future edit to
 * pricing rules).
 */
export async function handlePricingDelete(pricingId: string, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  if (!isValidUuid(pricingId)) {
    return NextResponse.json({ error: "A valid pricing rule id is required." }, { status: 400 });
  }

  const admin = deps.getAdminClient();
  const { data, error } = await admin.from("turf_pricing").delete().eq("id", pricingId).select("id").maybeSingle();

  if (error) {
    console.error("admin/pricing DELETE failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Pricing rule not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handlePricingDelete(id);
}
