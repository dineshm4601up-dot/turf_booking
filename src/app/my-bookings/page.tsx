"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, CalendarSearch, Loader2, RefreshCw, Search } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/config/turf";
import { getPaymentMethodLabel, getPaymentStatusLabel, type PaymentMethod, type PaymentStatus } from "@/config/payment";
import { formatDateLong, formatDurationLabel, formatTime12Hour } from "@/lib/time";
import { getCustomerStatusLabel, type BookingStatus } from "@/lib/booking-status";
import { restrictToDigits, validateCustomerPhone } from "@/lib/validation";
import { UpiPaymentPanel, type UpiPanelData } from "@/components/booking/UpiPaymentPanel";

interface LookupBooking {
  reference: string;
  turfName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalPrice: number;
  status: BookingStatus;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  upi: UpiPanelData | null;
}

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "results"; bookings: LookupBooking[] };

export default function MyBookingsPage() {
  return (
    <Suspense fallback={null}>
      <MyBookingsContent />
    </Suspense>
  );
}

function MyBookingsContent() {
  const searchParams = useSearchParams();
  const initialPhone = restrictToDigits(searchParams.get("phone") ?? "", 10);
  const initialReference = restrictToDigits(searchParams.get("ref") ?? "", 5);
  const hasAutoLookupParams =
    validateCustomerPhone(initialPhone).ok && /^\d{5}$/.test(initialReference);

  const [phone, setPhone] = useState(initialPhone);
  const [reference, setReference] = useState(initialReference);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [state, setState] = useState<LookupState>(() => (hasAutoLookupParams ? { status: "loading" } : { status: "idle" }));

  async function runLookup(event?: React.FormEvent, overridePhone?: string, overrideReference?: string) {
    event?.preventDefault();
    const phoneValue = overridePhone ?? phone;
    const referenceValue = overrideReference ?? reference;

    // Client-side validation is a convenience, not the real guard: the
    // server re-validates everything and never trusts this.
    const phoneResult = validateCustomerPhone(phoneValue);
    if (!phoneResult.ok) {
      setFieldError(phoneResult.error);
      return;
    }
    if (!/^\d{5}$/.test(referenceValue)) {
      setFieldError("Enter the 5-digit booking reference from your confirmation.");
      return;
    }
    setFieldError(null);
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/bookings/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneValue, reference: referenceValue }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to look up bookings.");
      setState({ status: "results", bookings: body.bookings });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Failed to look up bookings." });
    }
  }

  // Convenience auto-fill (not a security mechanism): the confirmation
  // screen's "View My Bookings" link carries ?phone=&ref= so a customer who
  // just booked doesn't have to retype anything. Anyone else following the
  // same link still needs to actually know both values -- this doesn't
  // bypass the lookup API's own checks. Fetch logic is inlined (rather than
  // calling the shared runLookup) so this effect never calls setState
  // synchronously -- the initial `state` above already accounts for this
  // case via its lazy initializer.
  useEffect(() => {
    if (!hasAutoLookupParams) return;
    let cancelled = false;

    fetch("/api/bookings/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: initialPhone, reference: initialReference }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to look up bookings.");
        if (!cancelled) setState({ status: "results", bookings: body.bookings });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : "Failed to look up bookings." });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          aria-label="Back to booking"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarSearch className="size-5 text-turf-700" aria-hidden="true" />
          View My Bookings
        </h1>
      </div>

      <form onSubmit={runLookup} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col gap-3">
        <div>
          <label htmlFor="lookupPhone" className="block text-xs font-medium text-slate-600 mb-1">
            Mobile number
          </label>
          <input
            id="lookupPhone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(restrictToDigits(e.target.value, 10))}
            placeholder="e.g. 9876543210"
            className="w-full min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
          />
        </div>
        <div>
          <label htmlFor="lookupReference" className="block text-xs font-medium text-slate-600 mb-1">
            Booking reference (5 digits)
          </label>
          <input
            id="lookupReference"
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={reference}
            onChange={(e) => setReference(restrictToDigits(e.target.value, 5))}
            placeholder="e.g. 48217"
            className="w-full min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono tracking-widest focus:border-turf-600"
          />
          <p className="mt-1 text-xs text-slate-400">
            For your security, we need both your mobile number and the 5-digit reference from one of your
            confirmations &mdash; a mobile number alone isn&apos;t enough to look up your bookings.
          </p>
        </div>

        {fieldError && (
          <p
            className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            role="alert"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {fieldError}
          </p>
        )}

        <button
          type="submit"
          disabled={state.status === "loading"}
          className="min-h-11 rounded-lg bg-turf-600 text-white text-sm font-semibold hover:bg-turf-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {state.status === "loading" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          {state.status === "loading" ? "Searching…" : "Find my bookings"}
        </button>
      </form>

      {state.status === "error" && (
        <p
          className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      )}

      {state.status === "results" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              {state.bookings.length} booking{state.bookings.length === 1 ? "" : "s"} found
            </h2>
            <button
              type="button"
              onClick={() => runLookup()}
              className="flex items-center gap-1.5 text-xs font-medium text-turf-700 hover:text-turf-800"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Refresh
            </button>
          </div>

          {state.bookings.length === 0 && (
            <p className="text-sm text-slate-500 bg-slate-100 rounded-lg px-3 py-6 text-center">
              No bookings found for this mobile number.
            </p>
          )}

          {state.bookings.map((booking) => (
            <BookingLookupCard key={booking.reference} booking={booking} />
          ))}
        </div>
      )}
    </main>
  );
}

function BookingLookupCard({ booking }: { booking: LookupBooking }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">{booking.turfName}</p>
          <p className="text-sm text-slate-500">{formatDateLong(booking.bookingDate)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            booking.status === "cancelled"
              ? "bg-slate-200 text-slate-600"
              : booking.status === "confirmed"
                ? "bg-turf-100 text-turf-800"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          {getCustomerStatusLabel(booking.status)}
        </span>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        Reference <span className="font-mono text-base font-bold text-slate-800">{booking.reference}</span>
      </p>

      <dl className="grid grid-cols-2 gap-y-1 text-sm mt-3">
        <dt className="text-slate-500">Time</dt>
        <dd className="text-right font-medium text-slate-800">
          {formatTime12Hour(booking.startTime)} &ndash; {formatTime12Hour(booking.endTime)}
        </dd>
        <dt className="text-slate-500">Duration</dt>
        <dd className="text-right font-medium text-slate-800">{formatDurationLabel(booking.durationMinutes)}</dd>
        <dt className="text-slate-500">Payment method</dt>
        <dd className="text-right font-medium text-slate-800">
          {booking.paymentMethod ? getPaymentMethodLabel(booking.paymentMethod) : "—"}
        </dd>
        <dt className="text-slate-500">Payment status</dt>
        <dd className="text-right font-medium text-slate-800">{getPaymentStatusLabel(booking.paymentStatus)}</dd>
        <dt className="text-slate-500 font-semibold pt-1 border-t border-slate-100 mt-1">Total</dt>
        <dd className="text-right font-bold text-turf-700 pt-1 border-t border-slate-100 mt-1">
          {CURRENCY_SYMBOL}
          {booking.totalPrice}
        </dd>
      </dl>

      {booking.upi && booking.paymentStatus === "pending_verification" && <UpiPaymentPanel upi={booking.upi} />}
    </div>
  );
}
