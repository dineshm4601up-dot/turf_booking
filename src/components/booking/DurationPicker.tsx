"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Hourglass, Loader2 } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/config/turf";
import { formatDurationLabel, formatTime12Hour } from "@/lib/time";

export interface DurationOption {
  durationMinutes: number;
  endTime: string;
  available: boolean;
  price: number | null;
}

interface DurationPickerProps {
  turfId: string;
  date: string;
  startTime: string;
  selectedDuration: number | null;
  onSelectDuration: (option: DurationOption) => void;
}

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; options: DurationOption[] };

export function DurationPicker({
  turfId,
  date,
  startTime,
  selectedDuration,
  onSelectDuration,
}: DurationPickerProps) {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({ turfId, date, startTime });
    fetch(`/api/availability?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load durations.");
        return body as { durationOptions: DurationOption[] };
      })
      .then((body) => {
        if (!cancelled) setState({ status: "ready", options: body.durationOptions });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [turfId, date, startTime]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Hourglass className="size-4 text-turf-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-700">Select duration</h2>
      </div>

      {state.status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Checking durations&hellip;
        </div>
      )}

      {state.status === "error" && (
        <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      )}

      {state.status === "ready" && (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Booking duration">
          {state.options.map((option) => {
            const isSelected = option.durationMinutes === selectedDuration;

            return (
              <button
                key={option.durationMinutes}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!option.available}
                onClick={() => onSelectDuration(option)}
                title={
                  option.available
                    ? `Ends at ${formatTime12Hour(option.endTime)}`
                    : "Not available for this start time"
                }
                className={`flex min-h-11 flex-col items-center justify-center rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                  isSelected
                    ? "border-turf-600 bg-turf-600 text-white shadow-sm"
                    : !option.available
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-slate-200 bg-white text-slate-700 hover:border-turf-400"
                }`}
              >
                <span>{formatDurationLabel(option.durationMinutes)}</span>
                {option.available && option.price !== null ? (
                  <span className="text-[10px] mt-0.5 opacity-90">
                    {CURRENCY_SYMBOL}
                    {option.price}
                  </span>
                ) : (
                  <span className="text-[10px] mt-0.5">Unavailable</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
