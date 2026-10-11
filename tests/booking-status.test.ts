import { describe, expect, it } from "vitest";
import { isBookingStatus, isValidStatusTransition } from "../src/lib/booking-status";

describe("isValidStatusTransition", () => {
  it("allows pending -> confirmed", () => {
    expect(isValidStatusTransition("pending", "confirmed")).toBe(true);
  });
  it("allows pending -> cancelled", () => {
    expect(isValidStatusTransition("pending", "cancelled")).toBe(true);
  });
  it("allows confirmed -> cancelled", () => {
    expect(isValidStatusTransition("confirmed", "cancelled")).toBe(true);
  });
  it("rejects confirmed -> pending", () => {
    expect(isValidStatusTransition("confirmed", "pending")).toBe(false);
  });
  it("rejects any transition out of cancelled (terminal state)", () => {
    expect(isValidStatusTransition("cancelled", "pending")).toBe(false);
    expect(isValidStatusTransition("cancelled", "confirmed")).toBe(false);
  });
  it("rejects a same-status no-op transition", () => {
    expect(isValidStatusTransition("pending", "pending")).toBe(false);
    expect(isValidStatusTransition("confirmed", "confirmed")).toBe(false);
  });
});

describe("isBookingStatus", () => {
  it("accepts the three known statuses", () => {
    expect(isBookingStatus("pending")).toBe(true);
    expect(isBookingStatus("confirmed")).toBe(true);
    expect(isBookingStatus("cancelled")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isBookingStatus("done")).toBe(false);
    expect(isBookingStatus(42)).toBe(false);
    expect(isBookingStatus(null)).toBe(false);
  });
});
