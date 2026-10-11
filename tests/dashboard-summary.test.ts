import { describe, expect, it } from "vitest";
import { computeDashboardSummary } from "../src/lib/dashboard-summary";

describe("computeDashboardSummary", () => {
  it("counts bookings by status and sums revenue only for pending + confirmed", () => {
    const summary = computeDashboardSummary([
      { status: "pending", totalPrice: 800 },
      { status: "confirmed", totalPrice: 1200 },
      { status: "cancelled", totalPrice: 500 },
    ]);

    expect(summary.todaysBookingsCount).toBe(3);
    expect(summary.pendingCount).toBe(1);
    expect(summary.confirmedCount).toBe(1);
    expect(summary.cancelledCount).toBe(1);
    // 800 + 1200, NOT +500 from the cancelled booking.
    expect(summary.todaysExpectedRevenue).toBe(2000);
  });

  it("returns all zeros for an empty day", () => {
    const summary = computeDashboardSummary([]);
    expect(summary).toEqual({
      todaysBookingsCount: 0,
      pendingCount: 0,
      confirmedCount: 0,
      cancelledCount: 0,
      todaysExpectedRevenue: 0,
    });
  });

  it("never lets a cancelled-only day show nonzero revenue", () => {
    const summary = computeDashboardSummary([
      { status: "cancelled", totalPrice: 1000 },
      { status: "cancelled", totalPrice: 2000 },
    ]);
    expect(summary.todaysExpectedRevenue).toBe(0);
  });
});
