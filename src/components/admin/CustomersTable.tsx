"use client";

import { Fragment, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Loader2, Pencil, Search, X } from "lucide-react";
import { formatDateLong, formatTime12Hour } from "@/lib/time";
import { getCustomerStatusLabel, type BookingStatus } from "@/lib/booking-status";

interface Customer {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  bookingCount: number;
  mostRecentBookingDate: string | null;
}

interface HistoryBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  turfs: { name: string } | { name: string }[] | null;
}

function getTurfName(turfs: HistoryBooking["turfs"]): string {
  const turf = Array.isArray(turfs) ? turfs[0] : turfs;
  return turf?.name ?? "—";
}

const PAGE_SIZE = 20;

export function CustomersTable() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editSuccessId, setEditSuccessId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryBooking[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function loadCustomers() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/customers?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load customers.");
      setCustomers(body.customers);
      setTotal(body.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);

    fetch(`/api/admin/customers?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load customers.");
        if (!cancelled) {
          setCustomers(body.customers);
          setTotal(body.total);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load customers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, page]);

  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    setEditName(customer.name);
    setEditPhone(customer.phone);
    setEditError(null);
    setEditSuccessId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(customerId: string) {
    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, phone: editPhone }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save changes.");
      setEditingId(null);
      setEditSuccessId(customerId);
      await loadCustomers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function toggleHistory(customerId: string) {
    if (expandedId === customerId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(customerId);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/admin/bookings?customerId=${customerId}&pageSize=50`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load booking history.");
      setHistory(body.bookings);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to load booking history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search by name or mobile number"
          aria-label="Search customers"
          className="w-full min-h-11 rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-turf-600"
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading customers&hellip;
        </div>
      )}

      {!loading && error && (
        <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {!loading && !error && customers.length === 0 && (
        <p className="text-sm text-slate-500 bg-slate-100 rounded-lg px-3 py-6 text-center">No customers found.</p>
      )}

      {!loading && !error && customers.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Mobile number</th>
                <th className="px-3 py-2 font-medium">Bookings</th>
                <th className="px-3 py-2 font-medium">Most recent booking</th>
                <th className="px-3 py-2 font-medium">Customer since</th>
                <th className="px-3 py-2 font-medium">Actions</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <Fragment key={customer.id}>
                  {editingId === customer.id ? (
                    <tr className="border-b border-slate-100 last:border-0 bg-slate-50">
                      <td className="px-3 py-2" colSpan={7}>
                        <div className="flex flex-wrap items-start gap-2">
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            Name
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            Mobile number
                            <input
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                              maxLength={10}
                              inputMode="numeric"
                              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
                            />
                          </label>
                          <div className="flex items-end gap-1.5 h-11">
                            <button
                              type="button"
                              disabled={editSubmitting}
                              onClick={() => saveEdit(customer.id)}
                              className="min-h-11 rounded-lg bg-turf-600 px-3 text-xs font-semibold text-white hover:bg-turf-700 disabled:opacity-60"
                            >
                              {editSubmitting ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              aria-label="Cancel edit"
                              className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-white"
                            >
                              <X className="size-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        {editError && (
                          <p className="mt-2 text-xs text-red-700" role="alert">
                            {editError}
                          </p>
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-medium text-slate-800">{customer.name}</td>
                      <td className="px-3 py-2 text-slate-600">{customer.phone}</td>
                      <td className="px-3 py-2 text-slate-600">{customer.bookingCount}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {customer.mostRecentBookingDate ? formatDateLong(customer.mostRecentBookingDate) : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{new Date(customer.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(customer)}
                            aria-label={`Edit ${customer.name}`}
                            className="min-h-8 min-w-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </button>
                          {editSuccessId === customer.id && (
                            <span className="flex items-center gap-1 text-xs text-turf-700">
                              <CheckCircle2 className="size-3.5" aria-hidden="true" />
                              Saved
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleHistory(customer.id)}
                          aria-label={expandedId === customer.id ? "Hide booking history" : "View booking history"}
                          className="min-h-8 min-w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                        >
                          {expandedId === customer.id ? (
                            <ChevronUp className="size-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    </tr>
                  )}

                  {expandedId === customer.id && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={7} className="px-3 py-3">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2">
                          <CalendarDays className="size-3.5" aria-hidden="true" />
                          Booking history
                        </h3>
                        {historyLoading && (
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                            Loading&hellip;
                          </p>
                        )}
                        {!historyLoading && historyError && (
                          <p className="text-xs text-red-700" role="alert">
                            {historyError}
                          </p>
                        )}
                        {!historyLoading && !historyError && history.length === 0 && (
                          <p className="text-xs text-slate-500">No bookings yet.</p>
                        )}
                        {!historyLoading && !historyError && history.length > 0 && (
                          <ul className="flex flex-col gap-1.5">
                            {history.map((booking) => (
                              <li key={booking.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-700">
                                <span className="font-medium">{getTurfName(booking.turfs)}</span>
                                <span>{formatDateLong(booking.booking_date)}</span>
                                <span>
                                  {formatTime12Hour(booking.start_time)} &ndash; {formatTime12Hour(booking.end_time)}
                                </span>
                                <span className="text-slate-500">{getCustomerStatusLabel(booking.status)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="min-h-9 rounded-md border border-slate-300 px-3 text-xs font-medium disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="min-h-9 rounded-md border border-slate-300 px-3 text-xs font-medium disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
