export interface DashboardBooking {
  status: "pending" | "confirmed" | "cancelled";
  totalPrice: number;
}

export interface DashboardSummary {
  todaysBookingsCount: number;
  pendingCount: number;
  confirmedCount: number;
  cancelledCount: number;
  todaysExpectedRevenue: number;
}

/**
 * Revenue rule (documented per the Phase 4 spec): "today's expected
 * revenue" sums total_price for today's bookings that are 'pending' or
 * 'confirmed' -- i.e. still active. Cancelled bookings never contribute.
 * This is an estimate of money the turf expects to collect, not a record
 * of money actually received -- there is no payment integration in this
 * app, so nothing here should be read as "collected" revenue.
 */
export function computeDashboardSummary(todaysBookings: DashboardBooking[]): DashboardSummary {
  let pendingCount = 0;
  let confirmedCount = 0;
  let cancelledCount = 0;
  let todaysExpectedRevenue = 0;

  for (const booking of todaysBookings) {
    if (booking.status === "pending") {
      pendingCount += 1;
      todaysExpectedRevenue += booking.totalPrice;
    } else if (booking.status === "confirmed") {
      confirmedCount += 1;
      todaysExpectedRevenue += booking.totalPrice;
    } else {
      cancelledCount += 1;
    }
  }

  return {
    todaysBookingsCount: todaysBookings.length,
    pendingCount,
    confirmedCount,
    cancelledCount,
    todaysExpectedRevenue: Math.round(todaysExpectedRevenue * 100) / 100,
  };
}
