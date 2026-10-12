"use client";

import { Fragment, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Search } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/config/turf";
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  type PaymentMethod,
  type PaymentStatus,
} from "@/config/payment";
import { formatDurationLabel, formatTime12Hour } from "@/lib/time";
import type { BookingStatus } from "@/lib/booking-status";

interface AdminBookingRow {
  id: string;
  turf_id: string;
  customer_name: string;
  customer_phone: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_price: number;
  status: BookingStatus;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  payment_updated_at: string | null;
  created_at: string;
  turfs: { name: string } | null;
}

interface TurfOption {
  id: string;
  name: string;
}

interface BookingsTableProps {
  showTurfFilter?: boolean;
  showActions?: boolean;
  pageSize?: number;
}

const STATUS_STYLES: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-turf-100 text-turf-800",
  cancelled: "bg-slate-200 text-slate-600",
};

export function BookingsTable({ showTurfFilter = false, showActions = false, pageSize = 20 }: BookingsTableProps) {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [turfId, setTurfId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [turfs, setTurfs] = useState<TurfOption[]>([]);
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionState, setActionState] = useState<{ id: string; error: string } | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!showTurfFilter) return;
    fetch("/api/admin/turfs")
      .then((res) => res.json())
      .then((body) => setTurfs((body.turfs ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))))
      .catch(() => {
        /* turf filter is a nice-to-have; silently skip if it fails */
      });
  }, [showTurfFilter]);

  async function loadBookings() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (date) params.set("date", date);
      if (status) params.set("status", status);
      if (turfId) params.set("turfId", turfId);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/bookings?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load bookings.");
      setBookings(body.bookings);
      setTotal(body.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (date) params.set("date", date);
    if (status) params.set("status", status);
    if (turfId) params.set("turfId", turfId);
    if (search) params.set("search", search);

    fetch(`/api/admin/bookings?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load bookings.");
        if (!cancelled) {
          setBookings(body.bookings);
          setTotal(body.total);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load bookings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, status, turfId, search, page, pageSize]);

  async function handleStatusChange(booking: AdminBookingRow, nextStatus: BookingStatus) {
    if (nextStatus === "cancelled") {
      const confirmed = window.confirm(
        `Cancel the booking for ${booking.customer_name} on ${booking.booking_date} at ${formatTime12Hour(booking.start_time)}? This will free the slot for new bookings and cannot be undone.`
      );
      if (!confirmed) return;
    }

    setPendingActionId(booking.id);
    setActionState(null);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update booking.");
      await loadBookings();
    } catch (err) {
      setActionState({ id: booking.id, error: err instanceof Error ? err.message : "Failed to update booking." });
    } finally {
      setPendingActionId(null);
    }
  }

  async function handlePaymentStatusChange(booking: AdminBookingRow, nextStatus: PaymentStatus) {
    setPendingActionId(booking.id);
    setActionState(null);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: nextStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update payment status.");
      await loadBookings();
    } catch (err) {
      setActionState({ id: booking.id, error: err instanceof Error ? err.message : "Failed to update payment status." });
    } finally {
      setPendingActionId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search by name or phone"
            aria-label="Search bookings"
            className="w-full min-h-11 rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-turf-600"
          />
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setPage(1);
            setDate(e.target.value);
          }}
          aria-label="Filter by date"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          aria-label="Filter by status"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {showTurfFilter && (
          <select
            value={turfId}
            onChange={(e) => {
              setPage(1);
              setTurfId(e.target.value);
            }}
            aria-label="Filter by turf"
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
          >
            <option value="">All turfs</option>
            {turfs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading bookings&hellip;
        </div>
      )}

      {!loading && error && (
        <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {!loading && !error && bookings.length === 0 && (
        <p className="text-sm text-slate-500 bg-slate-100 rounded-lg px-3 py-6 text-center">No bookings found.</p>
      )}

      {!loading && !error && bookings.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[940px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Turf</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                {showActions && <th className="px-3 py-2 font-medium">Actions</th>}
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <Fragment key={booking.id}>
                  <tr className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{booking.customer_name}</div>
                      <div className="text-xs text-slate-500">{booking.customer_phone}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{booking.turfs?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{booking.booking_date}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatTime12Hour(booking.start_time)} &ndash; {formatTime12Hour(booking.end_time)}
                    </td>
                    <td className="px-3 py-2 text-slate-800 font-medium">
                      {CURRENCY_SYMBOL}
                      {booking.total_price}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[booking.status]}`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <div>{booking.payment_method ? getPaymentMethodLabel(booking.payment_method) : "—"}</div>
                      <div className="text-xs text-slate-500">{getPaymentStatusLabel(booking.payment_status)}</div>
                    </td>
                    {showActions && (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {booking.status === "pending" && (
                            <button
                              type="button"
                              disabled={pendingActionId === booking.id}
                              onClick={() => handleStatusChange(booking, "confirmed")}
                              className="min-h-8 rounded-md border border-turf-300 bg-turf-50 px-2 text-xs font-medium text-turf-700 hover:bg-turf-100 disabled:opacity-50"
                            >
                              Confirm
                            </button>
                          )}
                          {booking.status !== "cancelled" && (
                            <button
                              type="button"
                              disabled={pendingActionId === booking.id}
                              onClick={() => handleStatusChange(booking, "cancelled")}
                              className="min-h-8 rounded-md border border-red-300 bg-red-50 px-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          )}
                          {booking.payment_method === "cash" && booking.payment_status === "unpaid" && (
                            <button
                              type="button"
                              disabled={pendingActionId === booking.id}
                              onClick={() => handlePaymentStatusChange(booking, "paid")}
                              className="min-h-8 rounded-md border border-turf-300 bg-turf-50 px-2 text-xs font-medium text-turf-700 hover:bg-turf-100 disabled:opacity-50"
                            >
                              Mark cash paid
                            </button>
                          )}
                          {booking.payment_method === "upi" && booking.payment_status === "pending_verification" && (
                            <>
                              <button
                                type="button"
                                disabled={pendingActionId === booking.id}
                                onClick={() => handlePaymentStatusChange(booking, "paid")}
                                className="min-h-8 rounded-md border border-turf-300 bg-turf-50 px-2 text-xs font-medium text-turf-700 hover:bg-turf-100 disabled:opacity-50"
                              >
                                Verify paid
                              </button>
                              <button
                                type="button"
                                disabled={pendingActionId === booking.id}
                                onClick={() => handlePaymentStatusChange(booking, "failed")}
                                className="min-h-8 rounded-md border border-red-300 bg-red-50 px-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                Mark failed
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === booking.id ? null : booking.id)}
                        aria-label={expandedId === booking.id ? "Hide details" : "Show details"}
                        className="min-h-8 min-w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                      >
                        {expandedId === booking.id ? (
                          <ChevronUp className="size-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden="true" />
                        )}
                      </button>
                    </td>
                  </tr>
                  {expandedId === booking.id && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={showActions ? 9 : 8} className="px-3 py-3">
                        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <dt className="text-slate-500">Internal ID</dt>
                          <dd className="col-span-3 font-mono text-slate-700 break-all">{booking.id}</dd>
                          <dt className="text-slate-500">Duration</dt>
                          <dd className="col-span-3 text-slate-700">{formatDurationLabel(booking.duration_minutes)}</dd>
                          <dt className="text-slate-500">Created</dt>
                          <dd className="col-span-3 text-slate-700">{new Date(booking.created_at).toLocaleString()}</dd>
                          {booking.payment_updated_at && (
                            <>
                              <dt className="text-slate-500">Payment updated</dt>
                              <dd className="col-span-3 text-slate-700">
                                {new Date(booking.payment_updated_at).toLocaleString()}
                              </dd>
                            </>
                          )}
                        </dl>
                        {actionState?.id === booking.id && (
                          <p className="mt-2 text-xs text-red-700" role="alert">
                            {actionState.error}
                          </p>
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

      {!loading && !error && total > pageSize && (
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
