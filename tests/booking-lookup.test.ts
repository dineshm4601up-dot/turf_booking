import { describe, expect, it } from "vitest";
import { sortBookingsForLookup } from "../src/lib/booking-lookup";

describe("sortBookingsForLookup", () => {
  const today = "2026-10-15";

  it("puts upcoming bookings before past ones", () => {
    const bookings = [
      { id: "past", booking_date: "2026-10-10", start_time: "10:00" },
      { id: "upcoming", booking_date: "2026-10-20", start_time: "10:00" },
    ];
    const sorted = sortBookingsForLookup(bookings, today);
    expect(sorted.map((b) => b.id)).toEqual(["upcoming", "past"]);
  });

  it("sorts upcoming bookings soonest-first", () => {
    const bookings = [
      { id: "later", booking_date: "2026-10-25", start_time: "08:00" },
      { id: "sooner", booking_date: "2026-10-16", start_time: "08:00" },
      { id: "today-late", booking_date: today, start_time: "18:00" },
      { id: "today-early", booking_date: today, start_time: "08:00" },
    ];
    const sorted = sortBookingsForLookup(bookings, today);
    expect(sorted.map((b) => b.id)).toEqual(["today-early", "today-late", "sooner", "later"]);
  });

  it("sorts past bookings most-recent-first", () => {
    const bookings = [
      { id: "oldest", booking_date: "2026-01-01", start_time: "08:00" },
      { id: "newest", booking_date: "2026-10-01", start_time: "08:00" },
      { id: "middle", booking_date: "2026-05-01", start_time: "08:00" },
    ];
    const sorted = sortBookingsForLookup(bookings, today);
    expect(sorted.map((b) => b.id)).toEqual(["newest", "middle", "oldest"]);
  });

  it("treats today's date as upcoming", () => {
    const bookings = [{ id: "today", booking_date: today, start_time: "08:00" }];
    const sorted = sortBookingsForLookup(bookings, today);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.id).toBe("today");
  });
});
