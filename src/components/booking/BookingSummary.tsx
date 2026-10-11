"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info, Loader2, MessageCircle, Phone, User } from "lucide-react";
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
  reference: string;
  turfName: string;
  turfWhatsappNumber: string;
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
  const idempotencyKeyRef = useRef(generateIdempotencyKey());

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
        reference: body.reference,
        turfName: body.turfName,
        turfWhatsappNumber: body.turfWhatsappNumber,
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
              Reference <span className="font-mono text-base font-bold">{confirmed.reference}</span>
            </p>
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
                    shortReference: confirmed.reference,
                    turfName: confirmed.turfName,
                    customerName: customer.name,
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
                href={`/my-bookings?phone=${encodeURIComponent(customer.phone)}&ref=${encodeURIComponent(confirmed.reference)}`}
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
          <label htmlFor="customerName" className="block text-xs font-medium text-slate-600 mb-1">
            Full name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" aria-hidden="true" />
            <input
              id="customerName"
              type="text"
              autoComplete="name"
              value={customer.name}
              onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "customerName-error" : undefined}
              className="w-full min-h-11 rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-turf-600"
              placeholder="e.g. Priya Sharma"
            />
          </div>
          {errors.name && (
            <p id="customerName-error" className="mt-1 text-xs text-red-600">
              {errors.name}
            </p>
          )}
        </div>

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
              className="w-full min-h-11 rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-turf-600"
              placeholder="e.g. 9876543210"
            />
          </div>
          {errors.phone ? (
            <p id="customerPhone-error" className="mt-1 text-xs text-red-600">
              {errors.phone}
            </p>
          ) : (
            <p id="customerPhone-hint" className="mt-1 text-xs text-slate-400">
              10-digit Indian mobile number. You&apos;ll use this (with your booking reference) to look up your
              booking later.
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
        disabled={submitting}
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
