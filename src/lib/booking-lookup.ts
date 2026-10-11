/**
 * Upcoming bookings first (soonest first), then past bookings (most recent
 * first) -- so a customer checking "what do I have coming up" sees it
 * immediately, while older history is still reachable below it.
 */
export function sortBookingsForLookup<T extends { booking_date: string; start_time: string }>(
  bookings: T[],
  todayStr: string
): T[] {
  const sortKey = (b: T) => `${b.booking_date}${b.start_time}`;

  const upcoming = bookings
    .filter((b) => b.booking_date >= todayStr)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const past = bookings
    .filter((b) => b.booking_date < todayStr)
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  return [...upcoming, ...past];
}
