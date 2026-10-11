import { addMinutesToTime, generateTimeSlots, timeToMinutes } from "./time";

export interface BusyInterval {
  startTime: string;
  endTime: string;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  // Half-open [start, end) ranges: back-to-back intervals don't overlap.
  return aStart < bEnd && bStart < aEnd;
}

export interface RangeBookableOptions {
  startTime: string;
  endTime: string;
  openingTime: string;
  closingTime: string;
  busyIntervals: BusyInterval[];
  /** Minutes since midnight "now" is at, on the booking's date; omit for a date that isn't today. */
  nowMinutesIfToday?: number | null;
}

/**
 * The single source of truth for "can [startTime, endTime) be booked" --
 * used both to build the Time-step grid and to validate each Duration
 * option for an already-chosen start time, so the two steps can never
 * disagree with each other.
 */
export function isRangeBookable(options: RangeBookableOptions): boolean {
  const { startTime, endTime, openingTime, closingTime, busyIntervals, nowMinutesIfToday } = options;

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (endMinutes <= startMinutes) return false;
  if (startMinutes < timeToMinutes(openingTime)) return false;
  if (endMinutes > timeToMinutes(closingTime)) return false;
  if (nowMinutesIfToday != null && startMinutes < nowMinutesIfToday) return false;

  for (const busy of busyIntervals) {
    if (rangesOverlap(startMinutes, endMinutes, timeToMinutes(busy.startTime), timeToMinutes(busy.endTime))) {
      return false;
    }
  }

  return true;
}

export interface GridSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface ComputeGridOptions {
  openingTime: string;
  closingTime: string;
  slotIntervalMinutes: number;
  durationMinutes: number;
  busyIntervals: BusyInterval[];
  nowMinutesIfToday?: number | null;
}

/** Every grid start time between opening and closing, each checked against the same duration. */
export function computeGridAvailability(options: ComputeGridOptions): GridSlot[] {
  const { openingTime, closingTime, slotIntervalMinutes, durationMinutes, busyIntervals, nowMinutesIfToday } =
    options;

  return generateTimeSlots(openingTime, closingTime, slotIntervalMinutes).map((startTime) => {
    const endTime = addMinutesToTime(startTime, durationMinutes);
    return {
      startTime,
      endTime,
      available: isRangeBookable({
        startTime,
        endTime,
        openingTime,
        closingTime,
        busyIntervals,
        nowMinutesIfToday,
      }),
    };
  });
}
