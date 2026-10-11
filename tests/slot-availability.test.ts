import { describe, expect, it } from "vitest";
import { computeGridAvailability, isRangeBookable } from "../src/lib/slot-availability";

const openingTime = "06:00";
const closingTime = "23:00";

describe("isRangeBookable", () => {
  it("accepts a booking that ends exactly at closing time", () => {
    expect(
      isRangeBookable({ startTime: "21:00", endTime: "23:00", openingTime, closingTime, busyIntervals: [] })
    ).toBe(true);
  });

  it("rejects a booking that extends past closing time", () => {
    expect(
      isRangeBookable({ startTime: "21:30", endTime: "23:30", openingTime, closingTime, busyIntervals: [] })
    ).toBe(false);
  });

  it("rejects a start time before opening", () => {
    expect(
      isRangeBookable({ startTime: "05:30", endTime: "06:30", openingTime, closingTime, busyIntervals: [] })
    ).toBe(false);
  });

  it("rejects a time in the past (today)", () => {
    const nowMinutesIfToday = 18 * 60; // 6:00 PM
    expect(
      isRangeBookable({
        startTime: "17:00",
        endTime: "18:00",
        openingTime,
        closingTime,
        busyIntervals: [],
        nowMinutesIfToday,
      })
    ).toBe(false);
  });

  it("rejects a booking that overlaps an existing busy interval", () => {
    // 17:00-18:30 booked; 18:00-19:00 must conflict.
    expect(
      isRangeBookable({
        startTime: "18:00",
        endTime: "19:00",
        openingTime,
        closingTime,
        busyIntervals: [{ startTime: "17:00", endTime: "18:30" }],
      })
    ).toBe(false);
  });

  it("allows a booking that is back-to-back (adjacent) with an existing one", () => {
    // 17:00-18:30 booked; 18:30-19:30 must be allowed (half-open ranges).
    expect(
      isRangeBookable({
        startTime: "18:30",
        endTime: "19:30",
        openingTime,
        closingTime,
        busyIntervals: [{ startTime: "17:00", endTime: "18:30" }],
      })
    ).toBe(true);
  });

  it("is blocked by a turf_blocks-style busy interval the same way as a booking", () => {
    expect(
      isRangeBookable({
        startTime: "10:00",
        endTime: "11:00",
        openingTime,
        closingTime,
        busyIntervals: [{ startTime: "09:00", endTime: "12:00" }],
      })
    ).toBe(false);
  });
});

describe("computeGridAvailability", () => {
  it("marks a cancelled booking's old slot as free (caller must exclude cancelled rows)", () => {
    // Cancelled bookings must not appear in busyIntervals at all -- the API
    // route filters status in ('pending','confirmed') before building this
    // list, so passing an empty list here simulates "booking was cancelled".
    const grid = computeGridAvailability({
      openingTime,
      closingTime,
      slotIntervalMinutes: 30,
      durationMinutes: 30,
      busyIntervals: [],
    });
    const tenAm = grid.find((slot) => slot.startTime === "10:00");
    expect(tenAm?.available).toBe(true);
  });

  it("excludes a slot that overlaps a confirmed booking", () => {
    const grid = computeGridAvailability({
      openingTime,
      closingTime,
      slotIntervalMinutes: 30,
      durationMinutes: 30,
      busyIntervals: [{ startTime: "10:00", endTime: "11:00" }],
    });
    expect(grid.find((slot) => slot.startTime === "10:00")?.available).toBe(false);
    expect(grid.find((slot) => slot.startTime === "10:30")?.available).toBe(false);
    expect(grid.find((slot) => slot.startTime === "11:00")?.available).toBe(true);
  });
});
