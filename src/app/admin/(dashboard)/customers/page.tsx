import { CustomersTable } from "@/components/admin/CustomersTable";

export default function AdminCustomersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Customers</h1>
        <p className="text-sm text-slate-500">
          One record per mobile number. Edit a saved name here if a customer&apos;s name was recorded incorrectly, or if
          it needs updating &mdash; the change is reflected in future bookings, booking lookup, and admin booking
          details.
        </p>
      </div>
      <CustomersTable />
    </div>
  );
}
