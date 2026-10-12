import { Clock } from "lucide-react";
import { formatTime12Hour, getOperatingHoursLabel } from "@/lib/time";

interface TurfOpeningHoursProps {
  openingTime: string;
  closingTime: string;
}

export function TurfOpeningHours({ openingTime, closingTime }: TurfOpeningHoursProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <Clock className="size-4 text-turf-600" aria-hidden="true" />
        Opening Hours
      </h2>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Opening time</dt>
          <dd className="mt-0.5 font-bold text-slate-800">{formatTime12Hour(openingTime)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Closing time</dt>
          <dd className="mt-0.5 font-bold text-slate-800">{formatTime12Hour(closingTime)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Hours</dt>
          <dd className="mt-0.5 font-bold text-turf-700">{getOperatingHoursLabel(openingTime, closingTime)}</dd>
        </div>
      </dl>
    </div>
  );
}
