"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { TurfInfoCard } from "@/components/booking/TurfInfoCard";
import { TurfStats } from "@/components/home/TurfStats";
import { TurfOpeningHours } from "@/components/home/TurfOpeningHours";
import { TurfAmenities } from "@/components/home/TurfAmenities";
import { BookNowBar, BookNowInline } from "@/components/home/BookNowBar";
import { SportsLineArtBackground } from "@/components/decor/SportsLineArtBackground";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { mapTurfRow, TURF_VIEW_SELECT_COLUMNS, type TurfView, type TurfViewRow } from "@/lib/turf-query";

type TurfState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; turf: TurfView };

export default function Home() {
  const [turfState, setTurfState] = useState<TurfState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadTurf() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("turfs")
          .select(TURF_VIEW_SELECT_COLUMNS)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle<TurfViewRow>();

        if (cancelled) return;

        if (error) {
          setTurfState({ status: "error", message: "Could not load turf details. Please refresh the page." });
          return;
        }
        if (!data) {
          setTurfState({ status: "empty" });
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
  }, []);

  if (turfState.status === "loading") {
    return (
      <>
        <SportsLineArtBackground />
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            Loading turf details&hellip;
          </div>
        </main>
      </>
    );
  }

  if (turfState.status === "error") {
    return (
      <>
        <SportsLineArtBackground />
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-4">
          <div
            className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-6 justify-center text-center"
            role="alert"
          >
            <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
            {turfState.message}
          </div>
        </main>
      </>
    );
  }

  if (turfState.status === "empty") {
    return (
      <>
        <SportsLineArtBackground />
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-4">
          <div className="text-center text-sm text-slate-500 py-10">
            No turf is currently open for booking. Please check back later.
          </div>
        </main>
      </>
    );
  }

  const { turf } = turfState;
  const bookHref = `/book/${turf.id}`;

  return (
    <>
      <SportsLineArtBackground />
      <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8 flex flex-col gap-4 pb-20 sm:pb-8">
        <TurfInfoCard
          name={turf.name}
          location={turf.location}
          isVerified={turf.isVerified}
          coverImageUrl={turf.coverImageUrl}
          contactPhone={turf.contactPhone}
        />

        <TurfStats sportType={turf.sportType} maxPersons={turf.maxPersons} turfCount={turf.turfCount} />

        <BookNowInline href={bookHref} />

        <TurfOpeningHours openingTime={turf.openingTime} closingTime={turf.closingTime} />

        <TurfAmenities amenities={turf.amenities} />
      </main>

      <BookNowBar href={bookHref} />
    </>
  );
}
