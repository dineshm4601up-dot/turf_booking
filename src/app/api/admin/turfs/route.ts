import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import {
  DEFAULT_TURF_WHATSAPP_NUMBER,
  validateTurfDisplayInput,
  validateTurfInput,
  validateTurfPaymentInput,
} from "@/lib/admin/turf-validation";
import { findAvailableSlug, isUniqueViolationOnSlug } from "@/lib/admin/turf-slug";

export const dynamic = "force-dynamic";

const TURF_SELECT_COLUMNS =
  "id, slug, name, location, sport_type, opening_time, closing_time, slot_interval_minutes, is_active, upi_vpa, upi_phone, payee_name, qr_image_url, whatsapp_number, contact_phone, is_verified, max_persons, turf_count, amenities, cover_image_url, created_at";

export async function handleTurfsGet(deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  const admin = deps.getAdminClient();
  const { data, error } = await admin
    .from("turfs")
    .select(TURF_SELECT_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("admin/turfs GET failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ turfs: data ?? [] }, { status: 200 });
}

export async function handleTurfsPost(request: Request, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const validated = validateTurfInput(body as Record<string, unknown>);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const bodyWithDefaults = {
    ...(body as Record<string, unknown>),
    whatsappNumber: (body as Record<string, unknown>).whatsappNumber ?? DEFAULT_TURF_WHATSAPP_NUMBER,
  };
  const paymentValidated = validateTurfPaymentInput(bodyWithDefaults);
  if (!paymentValidated.ok) {
    return NextResponse.json({ error: paymentValidated.error }, { status: 400 });
  }
  const displayValidated = validateTurfDisplayInput(body as Record<string, unknown>);
  if (!displayValidated.ok) {
    return NextResponse.json({ error: displayValidated.error }, { status: 400 });
  }

  const admin = deps.getAdminClient();

  // Slugs are generated once, at creation, from the turf's name -- see
  // findAvailableSlug for why both an in-app uniqueness check and a
  // 23505-on-insert retry are needed (the check alone can't rule out two
  // concurrent requests for the same new name racing each other).
  const slug = await findAvailableSlug(admin, validated.value.name);
  let result = await admin
    .from("turfs")
    .insert({ ...validated.value, ...paymentValidated.value, ...displayValidated.value, slug, is_active: true })
    .select(TURF_SELECT_COLUMNS)
    .single();

  if (result.error && isUniqueViolationOnSlug(result.error)) {
    const retrySlug = await findAvailableSlug(admin, validated.value.name);
    result = await admin
      .from("turfs")
      .insert({ ...validated.value, ...paymentValidated.value, ...displayValidated.value, slug: retrySlug, is_active: true })
      .select(TURF_SELECT_COLUMNS)
      .single();
  }

  if (result.error) {
    console.error("admin/turfs POST failed", result.error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ turf: result.data }, { status: 201 });
}

export async function GET() {
  return handleTurfsGet();
}

export async function POST(request: Request) {
  return handleTurfsPost(request);
}
