import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DURATION_OPTIONS_MINUTES } from "@/config/turf";
import { addMinutesToTime, getDayOfWeek, getTodayDateString } from "@/lib/time";
import { calculateBookingPrice, type PricingPeriod } from "@/lib/pricing";
import { computeGridAvailability, isRangeBookable, type BusyInterval } from "@/lib/slot-availability";
import { isValidDateString, isValidTimeString, isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface TurfRow {
  id: string;
  name: string;
  opening_time: string;
  closing_time: string;
  slot_interval_minutes: number;
  is_active: boolean;
}

export interface AvailabilityDeps {
  getAdminClient: () => SupabaseClient;
}

const defaultDeps: AvailabilityDeps = { getAdminClient: createSupabaseAdminClient };

/**
 * The actual handler, with the Supabase client injected so tests can supply
 * a fake one instead of mocking the module. GET below is the thin Next.js
 * entry point that wires in the real client.
 */
export async function handleAvailabilityRequest(request: Request, deps: AvailabilityDeps = defaultDeps) {
  const { searchParams } = new URL(request.url);
  const turfId = searchParams.get("turfId") ?? "";
  const date = searchParams.get("date") ?? "";
  const startTime = searchParams.get("startTime");

  if (!isValidUuid(turfId)) {
    return NextResponse.json({ error: "A valid turfId is required." }, { status: 400 });
  }
  if (!isValidDateString(date)) {
    return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
  }
  if (startTime !== null && !isValidTimeString(startTime)) {
    return NextResponse.json({ error: "startTime must be in HH:mm format." }, { status: 400 });
  }

  let admin: SupabaseClient;
  try {
    admin = deps.getAdminClient();
  } catch {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const { data: turf, error: turfError } = await admin
    .from("turfs")
    .select("id, name, opening_time, closing_time, slot_interval_minutes, is_active")
    .eq("id", turfId)
    .maybeSingle<TurfRow>();

  if (turfError) {
    console.error("availability: failed to load turf", turfError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!turf || !turf.is_active) {
    return NextResponse.json({ error: "Turf not found." }, { status: 404 });
  }

  const todayStr = getTodayDateString();
  const isPastDate = date < todayStr;
  const isToday = date === todayStr;
  const now = new Date();
  const nowMinutesIfToday = isToday ? now.getHours() * 60 + now.getMinutes() : null;

  let busyIntervals: BusyInterval[] = [];
  let pricingPeriods: PricingPeriod[] = [];

  if (!isPastDate) {
    const [bookingsResult, blocksResult, pricingResult] = await Promise.all([
      admin
        .from("bookings")
        .select("start_time, end_time")
        .eq("turf_id", turfId)
        .eq("booking_date", date)
        .in("status", ["pending", "confirmed"]),
      admin.from("turf_blocks").select("start_time, end_time").eq("turf_id", turfId).eq("block_date", date),
      admin
        .from("turf_pricing")
        .select("start_time, end_time, price_per_hour")
        .eq("turf_id", turfId)
        .eq("day_of_week", getDayOfWeek(date)),
    ]);

    if (bookingsResult.error || blocksResult.error || pricingResult.error) {
      console.error(
        "availability: failed to load bookings/blocks/pricing",
        bookingsResult.error,
        blocksResult.error,
        pricingResult.error
      );
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }

    busyIntervals = [
      ...(bookingsResult.data ?? []).map((b) => ({ startTime: b.start_time, endTime: b.end_time })),
      ...(blocksResult.data ?? []).map((b) => ({ startTime: b.start_time, endTime: b.end_time })),
    ];
    pricingPeriods = (pricingResult.data ?? []).map((p) => ({
      startTime: p.start_time,
      endTime: p.end_time,
      pricePerHour: Number(p.price_per_hour),
    }));
  }

  const slots = isPastDate
    ? []
    : computeGridAvailability({
        openingTime: turf.opening_time,
        closingTime: turf.closing_time,
        slotIntervalMinutes: turf.slot_interval_minutes,
        durationMinutes: turf.slot_interval_minutes,
        busyIntervals,
        nowMinutesIfToday,
      }).map((slot) => ({ startTime: slot.startTime, available: slot.available }));

  const responseBody: Record<string, unknown> = {
    turfId,
    date,
    turf: {
      name: turf.name,
      openingTime: turf.opening_time,
      closingTime: turf.closing_time,
      slotIntervalMinutes: turf.slot_interval_minutes,
    },
    slots,
  };

  if (startTime !== null) {
    responseBody.durationOptions = isPastDate
      ? DURATION_OPTIONS_MINUTES.map((durationMinutes) => ({
          durationMinutes,
          endTime: addMinutesToTime(startTime, durationMinutes),
          available: false,
          price: null,
        }))
      : DURATION_OPTIONS_MINUTES.map((durationMinutes) => {
          const endTime = addMinutesToTime(startTime, durationMinutes);
          const bookable = isRangeBookable({
            startTime,
            endTime,
            openingTime: turf.opening_time,
            closingTime: turf.closing_time,
            busyIntervals,
            nowMinutesIfToday,
          });

          if (!bookable) {
            return { durationMinutes, endTime, available: false, price: null };
          }

          const priceResult = calculateBookingPrice(pricingPeriods, startTime, endTime);
          return {
            durationMinutes,
            endTime,
            available: priceResult.ok,
            price: priceResult.ok ? priceResult.totalPrice : null,
          };
        });
  }

  return NextResponse.json(responseBody, { status: 200 });
}

export async function GET(request: Request) {
  return handleAvailabilityRequest(request);
}
