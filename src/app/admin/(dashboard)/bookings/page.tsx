import { BookingsTable } from "@/components/admin/BookingsTable";

export default function AdminBookingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Bookings</h1>
        <p className="text-sm text-slate-500">
          Confirm pending bookings, cancel bookings to free their slot, and review booking history.
        </p>
      </div>
      <BookingsTable showTurfFilter showActions pageSize={20} />
    </div>
  );
}
