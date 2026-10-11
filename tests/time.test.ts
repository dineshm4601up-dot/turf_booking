import { describe, expect, it } from "vitest";
import {
  addMinutesToTime,
  fitsBeforeClosing,
  formatDurationLabel,
  formatTime12Hour,
  getBookingEndTime,
  getDayOfWeek,
  timeToMinutes,
} from "../src/lib/time";

describe("time utilities", () => {
  it("5:00 PM + 2.5 hours = 7:30 PM", () => {
    expect(formatTime12Hour(getBookingEndTime("17:00", 150))).toBe("7:30 PM");
  });

  it("wraps midnight correctly", () => {
    expect(formatTime12Hour(getBookingEndTime("23:30", 30))).toBe("12:00 AM");
  });

  it("crosses noon correctly", () => {
    expect(formatTime12Hour(getBookingEndTime("11:30", 60))).toBe("12:30 PM");
  });

  it("formats duration labels", () => {
    expect(formatDurationLabel(30)).toBe("30 min");
    expect(formatDurationLabel(90)).toBe("1.5 hr");
    expect(formatDurationLabel(180)).toBe("3 hr");
  });

  it("accepts a booking that ends exactly at closing time", () => {
    expect(fitsBeforeClosing("21:00", 120, "23:00")).toBe(true);
  });

  it("rejects a booking that extends past closing time", () => {
    expect(fitsBeforeClosing("21:30", 120, "23:00")).toBe(false);
  });

  it("computes day of week independent of server timezone", () => {
    // 2026-10-11 is a Sunday.
    expect(getDayOfWeek("2026-10-11")).toBe(0);
    // 2026-10-12 is a Monday.
    expect(getDayOfWeek("2026-10-12")).toBe(1);
  });

  it("converts time strings to minutes and back", () => {
    expect(timeToMinutes("17:00")).toBe(1020);
    expect(addMinutesToTime("17:00", 150)).toBe("19:30");
  });
});
