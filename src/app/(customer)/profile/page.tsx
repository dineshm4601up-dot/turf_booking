import Link from "next/link";
import { CalendarSearch, User } from "lucide-react";

/**
 * A minimal placeholder so the bottom nav's Profile tab has a real route to
 * land on. No account system exists for customers (bookings are looked up
 * by phone number, not login -- see /my-bookings), so there is no profile
 * data to show yet; this just points the customer at what already exists.
 */
export default function ProfilePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
        <User className="size-5 text-turf-700" aria-hidden="true" />
        Profile
      </h1>

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-slate-500">
          There&apos;s no account to sign in to &mdash; bookings are looked up by mobile number instead.
        </p>
        <Link
          href="/my-bookings"
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-turf-600 px-4 text-sm font-semibold text-white hover:bg-turf-700"
        >
          <CalendarSearch className="size-4" aria-hidden="true" />
          View My Bookings
        </Link>
      </div>
    </main>
  );
}
