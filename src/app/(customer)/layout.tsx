import { BottomNav } from "@/components/customer/BottomNav";

/**
 * Shared chrome for every customer-facing page (/, /my-bookings, /profile).
 * Admin routes live outside this group and have their own layout, so they
 * never pick up the bottom nav. The bottom padding here clears the fixed
 * nav (see BottomNav's height) plus its safe-area inset, for every page in
 * the group -- a page that also has its own sticky bar (the home page's
 * "Book Now" bar) adds further clearance itself.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}>{children}</div>
      <BottomNav />
    </div>
  );
}
