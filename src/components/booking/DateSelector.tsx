"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { BOOKING_DAYS_AHEAD } from "@/config/turf";
import { getTodayDateString } from "@/lib/time";

interface DateSelectorProps {
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  disabled?: boolean;
}

function buildUpcomingDates(count: number): { value: string; weekday: string; day: string; month: string }[] {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    dates.push({
      value: `${year}-${month}-${day}`,
      weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
      day: String(date.getDate()),
      month: date.toLocaleDateString(undefined, { month: "short" }),
    });
  }
  return dates;
}

export function DateSelector({ selectedDate, onSelectDate, disabled = false }: DateSelectorProps) {
  const dates = useMemo(() => buildUpcomingDates(BOOKING_DAYS_AHEAD), []);
  const todayStr = getTodayDateString();

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="size-4 text-turf-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-700">Select a date</h2>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
        role="radiogroup"
        aria-label="Available booking dates"
      >
        {dates.map((d) => {
          const isSelected = d.value === selectedDate;
          const isToday = d.value === todayStr;
          return (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onSelectDate(d.value)}
              className={`flex min-w-[64px] flex-col items-center justify-center rounded-xl border px-3 py-2.5 text-center transition-colors min-h-11 disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "border-turf-600 bg-turf-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-turf-400"
              }`}
            >
              <span className={`text-[11px] font-medium ${isSelected ? "text-turf-50" : "text-slate-500"}`}>
                {isToday ? "Today" : d.weekday}
              </span>
              <span className="text-base font-semibold leading-tight">{d.day}</span>
              <span className={`text-[11px] ${isSelected ? "text-turf-50" : "text-slate-500"}`}>
                {d.month}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
