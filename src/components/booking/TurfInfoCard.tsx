import { Clock, MapPin, Phone, Trophy } from "lucide-react";
import { formatTime12Hour } from "@/lib/time";

interface TurfInfoCardProps {
  name: string;
  location: string;
  sportType: string;
  openingTime: string;
  closingTime: string;
  /** Public contact number for the call icon -- distinct from the UPI phone and WhatsApp number. Icon is hidden if not configured. */
  contactPhone?: string | null;
}

export function TurfInfoCard({ name, location, sportType, openingTime, closingTime, contactPhone }: TurfInfoCardProps) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-turf-700 to-turf-900 text-white p-5 sm:p-6 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{name}</h1>
        {contactPhone && (
          <a
            href={`tel:${contactPhone}`}
            aria-label="Call turf"
            title="Call turf"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors"
          >
            <Phone className="size-5" aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2.5 text-sm text-turf-50">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          <span>{location}</span>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className="size-4 shrink-0" aria-hidden="true" />
          <span>{sportType}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Open {formatTime12Hour(openingTime)} &ndash; {formatTime12Hour(closingTime)}
          </span>
        </div>
      </div>
    </div>
  );
}
