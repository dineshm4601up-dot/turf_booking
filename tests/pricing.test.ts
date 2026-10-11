import { describe, expect, it } from "vitest";
import { calculateBookingPrice } from "../src/lib/pricing";

describe("calculateBookingPrice", () => {
  it("prices a booking fully inside one pricing period", () => {
    const result = calculateBookingPrice(
      [{ startTime: "06:00", endTime: "17:00", pricePerHour: 700 }],
      "10:00",
      "11:00"
    );
    expect(result).toEqual({ ok: true, totalPrice: 700 });
  });

  it("splits price proportionally across two pricing periods", () => {
    // 16:30-18:00 spans the 700/hr day rate (16:30-17:00, 30 min) and the
    // 900/hr evening rate (17:00-18:00, 60 min): 350 + 900 = 1250.
    const periods = [
      { startTime: "06:00", endTime: "17:00", pricePerHour: 700 },
      { startTime: "17:00", endTime: "23:00", pricePerHour: 900 },
    ];
    const result = calculateBookingPrice(periods, "16:30", "18:00");
    expect(result).toEqual({ ok: true, totalPrice: 1250 });
  });

  it("returns a configuration error when part of the range has no pricing", () => {
    const result = calculateBookingPrice(
      [{ startTime: "06:00", endTime: "17:00", pricePerHour: 700 }],
      "16:00",
      "18:00"
    );
    expect(result.ok).toBe(false);
  });

  it("returns a configuration error when no pricing exists at all", () => {
    const result = calculateBookingPrice([], "10:00", "11:00");
    expect(result.ok).toBe(false);
  });

  it("returns a configuration error when pricing periods ambiguously overlap", () => {
    const periods = [
      { startTime: "06:00", endTime: "18:00", pricePerHour: 700 },
      { startTime: "17:00", endTime: "23:00", pricePerHour: 900 },
    ];
    const result = calculateBookingPrice(periods, "17:00", "18:00");
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid (non-positive) time range", () => {
    const result = calculateBookingPrice(
      [{ startTime: "06:00", endTime: "23:00", pricePerHour: 700 }],
      "12:00",
      "11:00"
    );
    expect(result.ok).toBe(false);
  });
});
