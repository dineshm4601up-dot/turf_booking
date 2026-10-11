import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { timeToMinutes } from "@/lib/time";
import { isValidTimeString, isValidUuid, validateDayOfWeek, validatePrice } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function handlePricingGet(request: Request, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const turfId = searchParams.get("turfId");

  const admin = deps.getAdminClient();
  let query = admin
    .from("turf_pricing")
    .select("id, turf_id, day_of_week, start_time, end_time, price_per_hour, created_at, turfs(name)")
    .order("turf_id", { ascending: true })
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (turfId) {
    if (!isValidUuid(turfId)) {
      return NextResponse.json({ error: "A valid turfId is required." }, { status: 400 });
    }
    query = query.eq("turf_id", turfId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("admin/pricing GET failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ pricingRules: data ?? [] }, { status: 200 });
}

export async function handlePricingPost(request: Request, deps: AdminAuthDeps = defaultAdminAuthDeps) {
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
  const input = body as Record<string, unknown>;

  if (typeof input.turfId !== "string" || !isValidUuid(input.turfId)) {
    return NextResponse.json({ error: "A valid turfId is required." }, { status: 400 });
  }
  const dayResult = validateDayOfWeek(input.dayOfWeek);
  if (!dayResult.ok) {
    return NextResponse.json({ error: dayResult.error }, { status: 400 });
  }
  if (typeof input.startTime !== "string" || !isValidTimeString(input.startTime)) {
    return NextResponse.json({ error: "A valid startTime (HH:mm) is required." }, { status: 400 });
  }
  if (typeof input.endTime !== "string" || !isValidTimeString(input.endTime)) {
    return NextResponse.json({ error: "A valid endTime (HH:mm) is required." }, { status: 400 });
  }
  if (timeToMinutes(input.startTime) >= timeToMinutes(input.endTime)) {
    return NextResponse.json({ error: "endTime must be later than startTime." }, { status: 400 });
  }
  const priceResult = validatePrice(input.pricePerHour, "pricePerHour");
  if (!priceResult.ok) {
    return NextResponse.json({ error: priceResult.error }, { status: 400 });
  }

  const admin = deps.getAdminClient();
  const { data, error } = await admin
    .from("turf_pricing")
    .insert({
      turf_id: input.turfId,
      day_of_week: dayResult.value,
      start_time: input.startTime,
      end_time: input.endTime,
      price_per_hour: priceResult.value,
    })
    .select("id, turf_id, day_of_week, start_time, end_time, price_per_hour, created_at")
    .single();

  if (error) {
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "This pricing rule overlaps an existing rule for the same turf and day." },
        { status: 409 }
      );
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: "Turf not found." }, { status: 404 });
    }
    console.error("admin/pricing POST failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ pricingRule: data }, { status: 201 });
}

export async function GET(request: Request) {
  return handlePricingGet(request);
}

export async function POST(request: Request) {
  return handlePricingPost(request);
}
