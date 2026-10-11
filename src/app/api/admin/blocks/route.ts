import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { timeToMinutes } from "@/lib/time";
import { isValidDateString, isValidTimeString, isValidUuid, validateNonBlankString } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function handleBlocksGet(request: Request, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const turfId = searchParams.get("turfId");

  const admin = deps.getAdminClient();
  let query = admin
    .from("turf_blocks")
    .select("id, turf_id, block_date, start_time, end_time, reason, created_at, turfs(name)")
    .order("block_date", { ascending: false });

  if (turfId) {
    if (!isValidUuid(turfId)) {
      return NextResponse.json({ error: "A valid turfId is required." }, { status: 400 });
    }
    query = query.eq("turf_id", turfId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("admin/blocks GET failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ blocks: data ?? [] }, { status: 200 });
}

export async function handleBlocksPost(request: Request, deps: AdminAuthDeps = defaultAdminAuthDeps) {
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
  if (typeof input.blockDate !== "string" || !isValidDateString(input.blockDate)) {
    return NextResponse.json({ error: "A valid blockDate (YYYY-MM-DD) is required." }, { status: 400 });
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
  let reason: string | null = null;
  if (input.reason !== undefined && input.reason !== null && input.reason !== "") {
    const reasonResult = validateNonBlankString(input.reason, { min: 1, max: 300, label: "Reason" });
    if (!reasonResult.ok) {
      return NextResponse.json({ error: reasonResult.error }, { status: 400 });
    }
    reason = reasonResult.value;
  }

  const admin = deps.getAdminClient();
  const { data, error } = await admin.rpc("create_turf_block", {
    p_turf_id: input.turfId,
    p_block_date: input.blockDate,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_reason: reason,
  });

  if (error) {
    const match = /BLOCK_OVERLAPS_BOOKINGS:(\d+)/.exec(error.message ?? "");
    if (match) {
      return NextResponse.json(
        {
          error: `This block overlaps ${match[1]} existing active booking(s). Cancel them first or choose a different time range.`,
        },
        { status: 409 }
      );
    }
    if ((error.message ?? "").includes("end_time must be after start_time")) {
      return NextResponse.json({ error: "endTime must be later than startTime." }, { status: 400 });
    }
    console.error("admin/blocks POST failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ block: data }, { status: 201 });
}

export async function GET(request: Request) {
  return handleBlocksGet(request);
}

export async function POST(request: Request) {
  return handleBlocksPost(request);
}
