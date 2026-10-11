"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarSearch, Loader2 } from "lucide-react";
import { TurfInfoCard } from "@/components/booking/TurfInfoCard";
import { StepIndicator } from "@/components/booking/StepIndicator";
import { DateSelector } from "@/components/booking/DateSelector";
import { TimeSlotPicker } from "@/components/booking/TimeSlotPicker";
import { DurationPicker, type DurationOption } from "@/components/booking/DurationPicker";
import { BookingSummary } from "@/components/booking/BookingSummary";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

interface ActiveTurf {
  id: string;
  name: string;
  location: string;
  sportType: string;
  openingTime: string;
  closingTime: string;
  contactPhone: string | null;
  upiAvailable: boolean;
}

interface TurfSelectRow {
  id: string;
  name: string;
  location: string;
  sport_type: string;
  opening_time: string;
  closing_time: string;
  contact_phone: string | null;
  upi_vpa: string | null;
  payee_name: string | null;
}

type TurfState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; turf: ActiveTurf };

function ViewMyBookingsBar() {
  return (
    <div className="flex justify-end">
      <Link
        href="/my-bookings"
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-turf-300 bg-white px-3 text-sm font-medium text-turf-700 hover:bg-turf-50"
      >
        <CalendarSearch className="size-4" aria-hidden="true" />
        View My Bookings
      </Link>
    </div>
  );
}

export default function Home() {
  const [turfState, setTurfState] = useState<TurfState>({ status: "loading" });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<DurationOption | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTurf() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("turfs")
          .select("id, name, location, sport_type, opening_time, closing_time, contact_phone, upi_vpa, payee_name")
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle<TurfSelectRow>();

        if (cancelled) return;

        if (error) {
          setTurfState({ status: "error", message: "Could not load turf details. Please refresh the page." });
          return;
        }
        if (!data) {
          setTurfState({ status: "empty" });
          return;
        }
        setTurfState({
          status: "ready",
          turf: {
            id: data.id,
            name: data.name,
            location: data.location,
            sportType: data.sport_type,
            openingTime: data.opening_time,
            closingTime: data.closing_time,
            contactPhone: data.contact_phone,
            upiAvailable: Boolean(data.upi_vpa && data.payee_name),
          },
        });
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
  }, []);

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
        <ViewMyBookingsBar />
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
        <ViewMyBookingsBar />
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

  if (turfState.status === "empty") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-4">
        <ViewMyBookingsBar />
        <div className="text-center text-sm text-slate-500 py-10">
          No turf is currently open for booking. Please check back later.
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
    <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-6">
      <ViewMyBookingsBar />
      <TurfInfoCard
        name={turf.name}
        location={turf.location}
        sportType={turf.sportType}
        openingTime={turf.openingTime}
        closingTime={turf.closingTime}
        contactPhone={turf.contactPhone}
      />

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
