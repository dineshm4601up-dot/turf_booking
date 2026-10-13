import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { validateTurfDisplayInput, validateTurfInput, validateTurfPaymentInput } from "@/lib/admin/turf-validation";
import { findAvailableSlug } from "@/lib/admin/turf-slug";
import { isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

const TURF_SELECT_COLUMNS =
  "id, slug, name, location, sport_type, opening_time, closing_time, slot_interval_minutes, is_active, upi_vpa, upi_phone, payee_name, qr_image_url, whatsapp_number, contact_phone, is_verified, max_persons, turf_count, amenities, cover_image_url, created_at";

interface ExistingTurfRow {
  id: string;
  slug: string | null;
  name: string;
  location: string;
  sport_type: string;
  opening_time: string;
  closing_time: string;
  slot_interval_minutes: number;
  is_active: boolean;
  upi_vpa: string | null;
  upi_phone: string | null;
  payee_name: string | null;
  whatsapp_number: string;
  contact_phone: string | null;
  is_verified: boolean;
  max_persons: number | null;
  turf_count: number;
  amenities: string[];
}

export async function handleTurfPatch(request: Request, turfId: string, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  if (!isValidUuid(turfId)) {
    return NextResponse.json({ error: "A valid turf id is required." }, { status: 400 });
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
    .from("turfs")
    .select(
      "id, slug, name, location, sport_type, opening_time, closing_time, slot_interval_minutes, is_active, upi_vpa, upi_phone, payee_name, whatsapp_number, contact_phone, is_verified, max_persons, turf_count, amenities"
    )
    .eq("id", turfId)
    .maybeSingle<ExistingTurfRow>();

  if (fetchError) {
    console.error("admin/turfs PATCH: fetch failed", fetchError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Turf not found." }, { status: 404 });
  }

  const merged = {
    name: input.name ?? existing.name,
    location: input.location ?? existing.location,
    sportType: input.sportType ?? existing.sport_type,
    openingTime: input.openingTime ?? existing.opening_time,
    closingTime: input.closingTime ?? existing.closing_time,
    slotIntervalMinutes: input.slotIntervalMinutes ?? existing.slot_interval_minutes,
  };

  const validated = validateTurfInput(merged);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const mergedPayment = {
    upiVpa: input.upiVpa ?? existing.upi_vpa,
    upiPhone: input.upiPhone ?? existing.upi_phone,
    payeeName: input.payeeName ?? existing.payee_name,
    whatsappNumber: input.whatsappNumber ?? existing.whatsapp_number,
    contactPhone: input.contactPhone ?? existing.contact_phone,
  };
  const paymentValidated = validateTurfPaymentInput(mergedPayment);
  if (!paymentValidated.ok) {
    return NextResponse.json({ error: paymentValidated.error }, { status: 400 });
  }

  const mergedDisplay = {
    isVerified: input.isVerified ?? existing.is_verified,
    maxPersons: input.maxPersons ?? existing.max_persons,
    turfCount: input.turfCount ?? existing.turf_count,
    amenities: input.amenities ?? existing.amenities,
  };
  const displayValidated = validateTurfDisplayInput(mergedDisplay);
  if (!displayValidated.ok) {
    return NextResponse.json({ error: displayValidated.error }, { status: 400 });
  }

  const isActive = typeof input.isActive === "boolean" ? input.isActive : existing.is_active;

  // The slug is never regenerated on an edit, even when the name changes:
  // preserving it is how an already-shared /book/<slug> link is kept from
  // silently breaking (the alternative the brief allows -- a redirect --
  // isn't needed once the slug simply never changes). The only case this
  // computes a fresh one is defensive: a turf somehow missing a slug
  // (shouldn't happen once the backfill migration has run, but a save
  // should never fail because of it).
  const slug = existing.slug ?? (await findAvailableSlug(admin, validated.value.name, turfId));

  const { data: updated, error: updateError } = await admin
    .from("turfs")
    .update({ ...validated.value, ...paymentValidated.value, ...displayValidated.value, slug, is_active: isActive })
    .eq("id", turfId)
    .select(TURF_SELECT_COLUMNS)
    .single();

  if (updateError) {
    console.error("admin/turfs PATCH: update failed", updateError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ turf: updated }, { status: 200 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleTurfPatch(request, id);
}
