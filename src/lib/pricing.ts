import { timeToMinutes } from "./time";

export interface PricingPeriod {
  startTime: string;
  endTime: string;
  pricePerHour: number;
}

export type PricingResult =
  | { ok: true; totalPrice: number }
  | { ok: false; error: string };

/**
 * Sums price across however many turf_pricing periods a booking spans.
 * Fails closed: a gap (no period covers part of the range) or an overlap
 * (two periods both claim the same minute -- a data problem) returns an
 * error instead of guessing, per the "never silently charge a guessed
 * price" requirement.
 */
export function calculateBookingPrice(
  periods: PricingPeriod[],
  startTime: string,
  endTime: string
): PricingResult {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const spanMinutes = endMinutes - startMinutes;

  if (spanMinutes <= 0) {
    return { ok: false, error: "Invalid time range." };
  }
  if (periods.length === 0) {
    return { ok: false, error: "No pricing is configured for this turf on this day." };
  }

  let coveredMinutes = 0;
  let total = 0;

  for (const period of periods) {
    const periodStart = timeToMinutes(period.startTime);
    const periodEnd = timeToMinutes(period.endTime);
    const overlapStart = Math.max(startMinutes, periodStart);
    const overlapEnd = Math.min(endMinutes, periodEnd);

    if (overlapEnd > overlapStart) {
      const overlapMinutes = overlapEnd - overlapStart;
      coveredMinutes += overlapMinutes;
      total += (overlapMinutes / 60) * period.pricePerHour;
    }
  }

  if (coveredMinutes > spanMinutes) {
    return {
      ok: false,
      error: "Pricing configuration is ambiguous for this time range (overlapping pricing periods).",
    };
  }
  if (coveredMinutes < spanMinutes) {
    return {
      ok: false,
      error: "Pricing is not fully configured for part of this time range.",
    };
  }

  return { ok: true, totalPrice: Math.round(total * 100) / 100 };
}
