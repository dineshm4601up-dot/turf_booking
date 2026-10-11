"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, Loader2 } from "lucide-react";
import { formatTime12Hour } from "@/lib/time";

interface Slot {
  startTime: string;
  available: boolean;
}

interface TimeSlotPickerProps {
  turfId: string;
  selectedDate: string;
  selectedStartTime: string | null;
  onSelectStartTime: (time: string) => void;
}

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; slots: Slot[] };

export function TimeSlotPicker({
  turfId,
  selectedDate,
  selectedStartTime,
  onSelectStartTime,
}: TimeSlotPickerProps) {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/availability?turfId=${encodeURIComponent(turfId)}&date=${encodeURIComponent(selectedDate)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load availability.");
        return body as { slots: Slot[] };
      })
      .then((body) => {
        if (!cancelled) setState({ status: "ready", slots: body.slots });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [turfId, selectedDate]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="size-4 text-turf-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-700">Select a start time</h2>
      </div>

      {state.status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading availability&hellip;
        </div>
      )}

      {state.status === "error" && (
        <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      )}

      {state.status === "ready" && state.slots.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No time slots are configured for this turf.
        </p>
      )}

      {state.status === "ready" && state.slots.length > 0 && !state.slots.some((s) => s.available) && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          No slots are available for this date. Try another date.
        </p>
      )}

      {state.status === "ready" && state.slots.length > 0 && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Available start times">
            {state.slots.map((slot) => {
              const isSelected = slot.startTime === selectedStartTime;
              const isDisabled = !slot.available;
              return (
                <button
                  key={slot.startTime}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isDisabled}
                  onClick={() => onSelectStartTime(slot.startTime)}
                  className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-turf-600 bg-turf-600 text-white shadow-sm"
                      : isDisabled
                        ? "border-slate-200 bg-slate-100 text-slate-400 line-through cursor-not-allowed"
                        : "border-slate-200 bg-white text-slate-700 hover:border-turf-400"
                  }`}
                >
                  {formatTime12Hour(slot.startTime)}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border border-slate-300 bg-white" /> Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-slate-300" /> Unavailable
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-turf-600" /> Selected
            </span>
          </div>
        </>
      )}
    </div>
  );
}
