/**
 * Time utilities operate on 24-hour "HH:mm" strings and minute offsets.
 * Keeping arithmetic in minutes-since-midnight avoids Date/timezone drift.
 */

export function timeToMinutes(time: string): number {
  const [hoursPart, minutesPart] = time.split(":");
  return Number(hoursPart ?? 0) * 60 + Number(minutesPart ?? 0);
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addMinutesToTime(time: string, minutesToAdd: number): string {
  return minutesToTime(timeToMinutes(time) + minutesToAdd);
}

export function formatTime12Hour(time: string): string {
  const [hoursPart, minutesPart] = time.split(":");
  const hours = Number(hoursPart ?? 0);
  const minutes = Number(minutesPart ?? 0);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function formatDurationLabel(durationMinutes: number): string {
  if (durationMinutes < 60) return `${durationMinutes} min`;
  const hours = durationMinutes / 60;
  return `${hours} hr`;
}

export function generateTimeSlots(
  openingTime: string,
  closingTime: string,
  intervalMinutes: number
): string[] {
  const slots: string[] = [];
  const closingMinutes = timeToMinutes(closingTime);
  for (
    let current = timeToMinutes(openingTime);
    current < closingMinutes;
    current += intervalMinutes
  ) {
    slots.push(minutesToTime(current));
  }
  return slots;
}

export function getBookingEndTime(startTime: string, durationMinutes: number): string {
  return addMinutesToTime(startTime, durationMinutes);
}

export function fitsBeforeClosing(
  startTime: string,
  durationMinutes: number,
  closingTime: string
): boolean {
  return timeToMinutes(startTime) + durationMinutes <= timeToMinutes(closingTime);
}

export function calculatePrice(durationMinutes: number, pricePerHour: number): number {
  return Math.round((durationMinutes / 60) * pricePerHour);
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDateInPast(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return target.getTime() < today.getTime();
}

export function isSlotInPast(dateStr: string, timeStr: string): boolean {
  const slotDateTime = new Date(`${dateStr}T${timeStr}:00`);
  return slotDateTime.getTime() < Date.now();
}

/**
 * 0 = Sunday .. 6 = Saturday, matching PostgreSQL's extract(dow from ...)
 * used by turf_pricing.day_of_week. Parsed as UTC so the result doesn't
 * depend on the server process's local timezone.
 */
export function getDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/**
 * Total operating hours between opening and closing time, formatted for
 * display. Equal opening/closing times (e.g. "06:00"-"06:00") mean the turf
 * never closes -- a full 24-hour day, not a 0-hour one -- since the turf
 * schema has no separate "24 hours" flag; this is the one place that
 * special case needs to be handled explicitly rather than naively
 * subtracting the two times.
 */
export function getOperatingHoursLabel(openingTime: string, closingTime: string): string {
  const openMinutes = timeToMinutes(openingTime);
  const closeMinutes = timeToMinutes(closingTime);
  const spanMinutes = closeMinutes === openMinutes ? 1440 : ((closeMinutes - openMinutes + 1440) % 1440);
  const hours = spanMinutes / 60;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${label} hours`;
}

export function formatDateLong(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
