"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info, Loader2, Lock, MessageCircle, Phone, User } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/config/turf";
import { getPaymentMethodLabel, getPaymentStatusLabel, type PaymentMethod, type PaymentStatus } from "@/config/payment";
import { formatDateLong, formatDurationLabel, formatTime12Hour } from "@/lib/time";
import { getCustomerStatusLabel, type BookingStatus } from "@/lib/booking-status";
import { restrictToDigits, validateCustomerName, validateCustomerPhone } from "@/lib/validation";
import { buildBookingWhatsAppMessage, buildWhatsappClickToChatUrl } from "@/lib/whatsapp";
import type { CustomerDetails, FormErrors } from "@/types/booking";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { UpiPaymentPanel, type UpiPanelData } from "./UpiPaymentPanel";

interface BookingSummaryProps {
  turfId: string;
  turfName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  previewPrice: number;
  upiAvailable: boolean;
  onBookingComplete: () => void;
}

interface ConfirmedBooking {
  turfName: string;
  turfWhatsappNumber: string;
  customerName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalPrice: number;
  status: BookingStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  upi: UpiPanelData | null;
}

type NameLookupState = "idle" | "loading" | "found" | "not_found" | "error";

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BookingSummary({
  turfId,
  turfName,
  date,
  startTime,
  endTime,
  durationMinutes,
  previewPrice,
  upiAvailable,
  onBookingComplete,
}: BookingSummaryProps) {
  const [customer, setCustomer] = useState<CustomerDetails>({ name: "", phone: "" });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const [nameLookupState, setNameLookupState] = useState<NameLookupState>("idle");
  const [nameLocked, setNameLocked] = useState(false);
  const idempotencyKeyRef = useRef(generateIdempotencyKey());

  const phoneLookupResult = validateCustomerPhone(customer.phone);
  const normalizedPhone = phoneLookupResult.ok ? phoneLookupResult.value : null;

  // Looks up the Customer Master once the phone field holds a complete,
  // valid 10-digit number: an existing customer's saved name is fetched
  // and the name field is locked (read-only) so a returning customer can't
  // accidentally -- or the browser can't be made to -- submit a different
  // name for a number that already has one; a new number leaves the name
  // field open for the customer to fill in themselves. Debounced so this
  // doesn't fire on every keystroke before the 10th digit is typed. Only
  // ever touches `customer.name`/nameLookupState/nameLocked -- the
  // selected turf/date/time/duration (owned by the parent page) and
  // paymentMethod (this component's own state) are never reset by it.
  useEffect(() => {
    let cancelled = false;

    if (!normalizedPhone) {
      // Deferred rather than called synchronously here, so this effect
      // never setStates as its first, unconditional action (that pattern
      // causes cascading renders -- see react-hooks/set-state-in-effect).
      const resetTimer = setTimeout(() => {
        if (cancelled) return;
        setNameLookupState("idle");
        setNameLocked(false);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(resetTimer);
      };
    }

    const timer = setTimeout(() => {
      setNameLookupState("loading");
      fetch("/api/customers/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone }),
      })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "Lookup failed.");
          if (cancelled) return;
          if (body.name) {
            setCustomer((c) => ({ ...c, name: body.name }));
            setNameLocked(true);
            setNameLookupState("found");
          } else {
            setNameLocked(false);
            setNameLookupState("not_found");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNameLocked(false);
            setNameLookupState("error");
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedPhone]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const nameResult = validateCustomerName(customer.name);
    const phoneResult = validateCustomerPhone(customer.phone);
    const validationErrors: FormErrors = {};
    if (!nameResult.ok) validationErrors.name = nameResult.error;
    if (!phoneResult.ok) validationErrors.phone = phoneResult.error;
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    if (nameLookupState === "loading") {
      // Still checking whether this number already has a saved name --
      // submitting now could race that lookup. The server would still
      // resolve the correct canonical customer either way (it does its
      // own independent lookup and never trusts this field for an
      // existing number), but waiting avoids a confusing moment where the
      // name field visibly changes out from under a submit in flight.
      setSubmitError("Just a moment, checking this mobile number…");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKeyRef.current },
        body: JSON.stringify({
          turfId,
          bookingDate: date,
          startTime,
          durationMinutes,
          customerName: customer.name,
          customerPhone: customer.phone,
          paymentMethod,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Something went wrong. Please try again.");
      }
      setConfirmed({
        turfName: body.turfName,
        turfWhatsappNumber: body.turfWhatsappNumber,
        customerName: body.customerName,
        bookingDate: body.bookingDate,
        startTime: body.startTime,
        endTime: body.endTime,
        durationMinutes: body.durationMinutes,
        totalPrice: body.totalPrice,
        status: body.status,
        paymentMethod: body.paymentMethod,
        paymentStatus: body.paymentStatus,
        upi: body.upi,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBookAnother() {
    idempotencyKeyRef.current = generateIdempotencyKey();
    setConfirmed(null);
    setCustomer({ name: "", phone: "" });
    setPaymentMethod("cash");
    setErrors({});
    setSubmitError(null);
    setNameLookupState("idle");
    setNameLocked(false);
    onBookingComplete();
  }

  if (confirmed) {
    return (
      <div className="rounded-xl border border-turf-200 bg-turf-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="size-5 text-turf-700 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-turf-800">Booking {getCustomerStatusLabel(confirmed.status).toLowerCase()}</p>
            <p className="text-sm text-turf-700 mt-1">
              {confirmed.status === "pending" &&
                "Your booking is awaiting approval from the turf. We'll keep the slot reserved for you in the meantime."}
              {confirmed.status === "confirmed" && "Your booking has been approved."}
            </p>

            <dl className="grid grid-cols-2 gap-y-1 text-sm mt-3">
              <dt className="text-turf-700">Turf</dt>
              <dd className="text-right font-medium text-turf-900">{confirmed.turfName}</dd>
              <dt className="text-turf-700">Date</dt>
              <dd className="text-right font-medium text-turf-900">{formatDateLong(confirmed.bookingDate)}</dd>
              <dt className="text-turf-700">Time</dt>
              <dd className="text-right font-medium text-turf-900">
                {formatTime12Hour(confirmed.startTime)} &ndash; {formatTime12Hour(confirmed.endTime)}
              </dd>
              <dt className="text-turf-700">Duration</dt>
              <dd className="text-right font-medium text-turf-900">
                {formatDurationLabel(confirmed.durationMinutes)}
              </dd>
              <dt className="text-turf-700">Booking status</dt>
              <dd className="text-right font-medium text-turf-900">{getCustomerStatusLabel(confirmed.status)}</dd>
              <dt className="text-turf-700">Payment method</dt>
              <dd className="text-right font-medium text-turf-900">{getPaymentMethodLabel(confirmed.paymentMethod)}</dd>
              <dt className="text-turf-700">Payment status</dt>
              <dd className="text-right font-medium text-turf-900">{getPaymentStatusLabel(confirmed.paymentStatus)}</dd>
              <dt className="text-turf-700 font-semibold pt-1 border-t border-turf-200 mt-1">Total</dt>
              <dd className="text-right font-bold text-turf-900 pt-1 border-t border-turf-200 mt-1">
                {CURRENCY_SYMBOL}
                {confirmed.totalPrice}
              </dd>
            </dl>

            {confirmed.paymentMethod === "cash" && (
              <p className="mt-3 text-xs text-turf-700">
                Payment is due in cash at the turf. No payment has been collected yet.
              </p>
            )}
            {confirmed.upi && <UpiPaymentPanel upi={confirmed.upi} />}

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={buildWhatsappClickToChatUrl(
                  confirmed.turfWhatsappNumber,
                  buildBookingWhatsAppMessage({
                    turfName: confirmed.turfName,
                    customerName: confirmed.customerName,
                    customerPhone: customer.phone,
                    bookingDateLabel: formatDateLong(confirmed.bookingDate),
                    startTimeLabel: formatTime12Hour(confirmed.startTime),
                    endTimeLabel: formatTime12Hour(confirmed.endTime),
                    durationLabel: formatDurationLabel(confirmed.durationMinutes),
                    totalAmount: confirmed.totalPrice,
                    currencySymbol: CURRENCY_SYMBOL,
                    paymentMethodLabel: getPaymentMethodLabel(confirmed.paymentMethod),
                    paymentStatusLabel: getPaymentStatusLabel(confirmed.paymentStatus),
                    bookingStatusLabel: getCustomerStatusLabel(confirmed.status),
                  })
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-white hover:bg-[#1fb855]"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                Notify Turf on WhatsApp
              </a>
              <button
                type="button"
                onClick={handleBookAnother}
                className="min-h-11 rounded-lg border border-turf-300 bg-white px-4 text-sm font-medium text-turf-700 hover:bg-turf-50"
              >
                Book another slot
              </button>
              <Link
                href={`/my-bookings?phone=${encodeURIComponent(customer.phone)}`}
                className="flex min-h-11 items-center rounded-lg border border-turf-300 bg-white px-4 text-sm font-medium text-turf-700 hover:bg-turf-50"
              >
                View My Bookings
              </Link>
            </div>
            <p className="mt-2 text-xs text-turf-700">
              This opens WhatsApp with the booking details prefilled &mdash; you still need to press Send. Nothing
              is sent automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">Booking summary</h2>

      <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
        <dt className="text-slate-500">Turf</dt>
        <dd className="text-right font-medium text-slate-800">{turfName}</dd>

        <dt className="text-slate-500">Date</dt>
        <dd className="text-right font-medium text-slate-800">{formatDateLong(date)}</dd>

        <dt className="text-slate-500">Start time</dt>
        <dd className="text-right font-medium text-slate-800">{formatTime12Hour(startTime)}</dd>

        <dt className="text-slate-500">End time</dt>
        <dd className="text-right font-medium text-slate-800">{formatTime12Hour(endTime)}</dd>

        <dt className="text-slate-500">Duration</dt>
        <dd className="text-right font-medium text-slate-800">{formatDurationLabel(durationMinutes)}</dd>

        <dt className="text-slate-500 font-semibold pt-2 border-t border-slate-100 mt-1">Estimated total</dt>
        <dd className="text-right font-bold text-turf-700 pt-2 border-t border-slate-100 mt-1">
          {CURRENCY_SYMBOL}
          {previewPrice}
        </dd>
      </dl>

      <div className="space-y-3">
        <div>
          <label htmlFor="customerPhone" className="block text-xs font-medium text-slate-600 mb-1">
            Mobile number
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" aria-hidden="true" />
            <input
              id="customerPhone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={10}
              value={customer.phone}
              onChange={(e) => setCustomer((c) => ({ ...c, phone: restrictToDigits(e.target.value, 10) }))}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "customerPhone-error" : "customerPhone-hint"}
              className="w-full min-h-11 rounded-lg border border-slate-300 pl-9 pr-9 text-sm focus:border-turf-600"
              placeholder="e.g. 9876543210"
            />
            {nameLookupState === "loading" && (
              <Loader2
                className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 animate-spin"
                aria-hidden="true"
              />
            )}
          </div>
          {errors.phone ? (
            <p id="customerPhone-error" className="mt-1 text-xs text-red-600">
              {errors.phone}
            </p>
          ) : (
            <p id="customerPhone-hint" className="mt-1 text-xs text-slate-400">
              10-digit Indian mobile number. You&apos;ll use this to look up your booking later.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="customerName" className="block text-xs font-medium text-slate-600 mb-1">
            Full name
          </label>
          <div className="relative">
            {nameLocked ? (
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" aria-hidden="true" />
            ) : (
              <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" aria-hidden="true" />
            )}
            <input
              id="customerName"
              type="text"
              autoComplete="name"
              readOnly={nameLocked}
              value={customer.name}
              onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "customerName-error" : "customerName-hint"}
              className={`w-full min-h-11 rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-turf-600 ${
                nameLocked ? "bg-slate-50 text-slate-600" : ""
              }`}
              placeholder="e.g. Priya Sharma"
            />
          </div>
          {errors.name && (
            <p id="customerName-error" className="mt-1 text-xs text-red-600">
              {errors.name}
            </p>
          )}
          {!errors.name && nameLocked && (
            <p id="customerName-hint" className="mt-1 text-xs text-slate-400">
              This is the saved name for this mobile number.
            </p>
          )}
          {!errors.name && !nameLocked && nameLookupState === "not_found" && (
            <p id="customerName-hint" className="mt-1 text-xs text-slate-400">
              We don&apos;t have a saved name for this number yet &mdash; enter it below.
            </p>
          )}
        </div>

        <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} upiAvailable={upiAvailable} />
      </div>

      {submitError && (
        <p
          className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          role="alert"
        >
          <AlertCircle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || nameLookupState === "loading"}
        className="mt-4 w-full min-h-11 rounded-lg bg-turf-600 text-white text-sm font-semibold hover:bg-turf-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitting ? "Booking…" : "Confirm booking"}
      </button>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
        <Info className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        The final price is confirmed by the server once you submit.
      </p>
    </form>
  );
}
