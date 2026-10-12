"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CalendarCheck, Loader2 } from "lucide-react";
import { TurfInfoCard } from "@/components/booking/TurfInfoCard";
import { StepIndicator } from "@/components/booking/StepIndicator";
import { DateSelector } from "@/components/booking/DateSelector";
import { TimeSlotPicker } from "@/components/booking/TimeSlotPicker";
import { DurationPicker, type DurationOption } from "@/components/booking/DurationPicker";
import { BookingSummary } from "@/components/booking/BookingSummary";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { mapTurfRow, TURF_VIEW_SELECT_COLUMNS, type TurfView, type TurfViewRow } from "@/lib/turf-query";
import { isValidUuid } from "@/lib/validation";

type TurfState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not_found" }
  | { status: "ready"; turf: TurfView };

/**
 * The turf a customer books is whichever one Home's "Book Now" linked to
 * (/book/[turfId]) -- loaded here by id, independently of Home's own "first
 * active turf" query, so the selected turf is never lost or swapped for a
 * different one in transit.
 */
export default function BookSlotPage({ params }: { params: Promise<{ turfId: string }> }) {
  const { turfId } = use(params);
  const [turfState, setTurfState] = useState<TurfState>({ status: "loading" });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<DurationOption | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTurf() {
      if (!isValidUuid(turfId)) {
        setTurfState({ status: "not_found" });
        return;
      }
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("turfs")
          .select(TURF_VIEW_SELECT_COLUMNS)
          .eq("id", turfId)
          .eq("is_active", true)
          .maybeSingle<TurfViewRow>();

        if (cancelled) return;

        if (error) {
          setTurfState({ status: "error", message: "Could not load turf details. Please refresh the page." });
          return;
        }
        if (!data) {
          setTurfState({ status: "not_found" });
          return;
        }
        setTurfState({ status: "ready", turf: mapTurfRow(data) });
      } catch {
        if (!cancelled) {
          setTurfState({ status: "error", message: "Could not load turf details. Please refresh the page." });
        }
      }
    }

    loadTurf();
    return () => {
      cancelled = true;
    };
  }, [turfId]);

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setSelectedStartTime(null);
    setSelectedDuration(null);
  }

  function handleSelectStartTime(time: string) {
    setSelectedStartTime(time);
    setSelectedDuration(null);
  }

  function handleBookingComplete() {
    setSelectedDate(null);
    setSelectedStartTime(null);
    setSelectedDuration(null);
  }

  if (turfState.status === "loading") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center" role="status">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          Loading turf details&hellip;
        </div>
      </main>
    );
  }

  if (turfState.status === "error") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-4">
        <div
          className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-6 justify-center text-center"
          role="alert"
        >
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          {turfState.message}
        </div>
      </main>
    );
  }

  if (turfState.status === "not_found") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-4">
        <div className="text-center text-sm text-slate-500 py-10 flex flex-col items-center gap-3">
          <p>This turf isn&apos;t available for booking right now.</p>
          <Link href="/" className="flex min-h-11 items-center gap-1.5 rounded-lg bg-turf-600 px-4 text-sm font-semibold text-white hover:bg-turf-700">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  const { turf } = turfState;

  const steps = [
    { label: "Date", complete: Boolean(selectedDate) },
    { label: "Time", complete: Boolean(selectedStartTime) },
    { label: "Duration", complete: Boolean(selectedDuration) },
    { label: "Confirm", complete: false },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-4">
      <TurfInfoCard
        name={turf.name}
        location={turf.location}
        isVerified={turf.isVerified}
        coverImageUrl={turf.coverImageUrl}
        contactPhone={turf.contactPhone}
      />

      <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800">
        <CalendarCheck className="size-5 text-turf-700" aria-hidden="true" />
        Book Your Slot
      </h1>

      <StepIndicator steps={steps} />

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <DateSelector selectedDate={selectedDate} onSelectDate={handleSelectDate} />
      </section>

      {selectedDate && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <TimeSlotPicker
            key={`${turf.id}-${selectedDate}`}
            turfId={turf.id}
            selectedDate={selectedDate}
            selectedStartTime={selectedStartTime}
            onSelectStartTime={handleSelectStartTime}
          />
        </section>
      )}

      {selectedDate && selectedStartTime && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <DurationPicker
            key={`${turf.id}-${selectedDate}-${selectedStartTime}`}
            turfId={turf.id}
            date={selectedDate}
            startTime={selectedStartTime}
            selectedDuration={selectedDuration?.durationMinutes ?? null}
            onSelectDuration={setSelectedDuration}
          />
        </section>
      )}

      {selectedDate && selectedStartTime && selectedDuration && selectedDuration.price !== null && (
        <BookingSummary
          turfId={turf.id}
          turfName={turf.name}
          date={selectedDate}
          startTime={selectedStartTime}
          endTime={selectedDuration.endTime}
          durationMinutes={selectedDuration.durationMinutes}
          previewPrice={selectedDuration.price}
          upiAvailable={turf.upiAvailable}
          onBookingComplete={handleBookingComplete}
        />
      )}
    </main>
  );
}
