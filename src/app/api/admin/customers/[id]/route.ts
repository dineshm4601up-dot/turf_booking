import { NextResponse } from "next/server";
import type { AdminAuthDeps } from "@/lib/admin-auth";
import { adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { isValidUuid, validateCustomerName, validateCustomerPhone } from "@/lib/validation";

export const dynamic = "force-dynamic";

function isUniqueViolationOnPhone(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" && (error.message ?? "").includes("customers_phone");
}

/**
 * Admin-only edit of a customer's saved name (always) and phone number
 * (if sent). Historical bookings are never touched by this -- their own
 * customer_name/customer_phone stay exactly as recorded; only the
 * Customer Master record changes, which is what future booking forms,
 * booking lookup, and admin booking displays read as the canonical value
 * (see GET /api/admin/bookings's withCanonicalCustomer).
 */
export async function handleCustomerPatch(request: Request, customerId: string, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  if (!isValidUuid(customerId)) {
    return NextResponse.json({ error: "A valid customer id is required." }, { status: 400 });
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

  const admin = deps.getAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("id", customerId)
    .maybeSingle<{ id: string; name: string; phone: string }>();

  if (fetchError) {
    console.error("admin/customers PATCH: fetch failed", fetchError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const update: Record<string, string> = {};

  if (input.name !== undefined) {
    const nameResult = validateCustomerName(input.name);
    if (!nameResult.ok) {
      return NextResponse.json({ error: nameResult.error }, { status: 400 });
    }
    update.name = nameResult.value;
  }

  if (input.phone !== undefined) {
    const phoneResult = validateCustomerPhone(input.phone);
    if (!phoneResult.ok) {
      return NextResponse.json({ error: phoneResult.error }, { status: 400 });
    }
    update.phone = phoneResult.value;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Provide at least a name or phone to update." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await admin
    .from("customers")
    .update(update)
    .eq("id", customerId)
    .select("id, name, phone, created_at, updated_at")
    .maybeSingle();

  if (updateError) {
    if (isUniqueViolationOnPhone(updateError)) {
      return NextResponse.json({ error: "That phone number already belongs to another customer." }, { status: 409 });
    }
    console.error("admin/customers PATCH: update failed", updateError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ customer: updated }, { status: 200 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleCustomerPatch(request, id);
}
