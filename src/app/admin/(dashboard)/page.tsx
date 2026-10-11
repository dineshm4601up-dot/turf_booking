import { CalendarDays, CheckCircle2, Clock3, IndianRupee, XCircle } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeDashboardSummary } from "@/lib/dashboard-summary";
import { getTodayDateString } from "@/lib/time";
import { CURRENCY_SYMBOL } from "@/config/turf";
import { BookingsTable } from "@/components/admin/BookingsTable";

export default async function AdminDashboardPage() {
  const admin = createSupabaseAdminClient();
  const today = getTodayDateString();

  const { data, error } = await admin.from("bookings").select("status, total_price").eq("booking_date", today);

  const summary = computeDashboardSummary(
    (data ?? []).map((b) => ({ status: b.status, totalPrice: Number(b.total_price) }))
  );

  const cards = [
    { label: "Today's bookings", value: summary.todaysBookingsCount, icon: CalendarDays },
    { label: "Pending", value: summary.pendingCount, icon: Clock3 },
    { label: "Confirmed", value: summary.confirmedCount, icon: CheckCircle2 },
    { label: "Cancelled", value: summary.cancelledCount, icon: XCircle },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview for {today}</p>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          Could not load today&apos;s summary. Please refresh.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <card.icon className="size-4 text-turf-700 mb-2" aria-hidden="true" />
            <p className="text-2xl font-bold text-slate-800">{card.value}</p>
            <p className="text-xs text-slate-500">{card.label}</p>
          </div>
        ))}
        <div className="rounded-xl border border-turf-200 bg-turf-50 p-4 col-span-2 sm:col-span-4">
          <IndianRupee className="size-4 text-turf-700 mb-2" aria-hidden="true" />
          <p className="text-2xl font-bold text-turf-800">
            {CURRENCY_SYMBOL}
            {summary.todaysExpectedRevenue}
          </p>
          <p className="text-xs text-turf-700">
            Today&apos;s expected revenue (pending + confirmed bookings; cancelled bookings are excluded). This is
            not a record of payment received &mdash; this app has no payment integration.
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Recent bookings</h2>
        <BookingsTable />
      </div>
    </div>
  );
}
