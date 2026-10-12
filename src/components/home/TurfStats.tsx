import { LayoutGrid, Trophy, Users } from "lucide-react";

interface TurfStatsProps {
  sportType: string;
  maxPersons: number | null;
  turfCount: number;
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
}

function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Icon className="size-3.5 text-turf-600" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1.5 text-base font-bold text-slate-800">{value}</p>
    </div>
  );
}

/** Sport, max persons, and number of turfs -- max persons is omitted entirely when not configured, rather than showing a misleading 0 or dash. */
export function TurfStats({ sportType, maxPersons, turfCount }: TurfStatsProps) {
  const sportLabel = sportType
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      <StatCard icon={Trophy} label="Sport" value={sportLabel} />
      {maxPersons !== null && <StatCard icon={Users} label="Max persons" value={String(maxPersons)} />}
      <StatCard icon={LayoutGrid} label="Turfs" value={String(turfCount)} />
    </div>
  );
}
