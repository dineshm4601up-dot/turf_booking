import { BadgeCheck, MapPin, Phone } from "lucide-react";

interface TurfInfoCardProps {
  name: string;
  location: string;
  isVerified: boolean;
  coverImageUrl: string | null;
  /** Public contact number for the call icon -- distinct from the UPI phone and WhatsApp number. Icon is hidden if not configured. */
  contactPhone?: string | null;
}

/**
 * Hero section: cover image (or a plain gradient fallback if the turf
 * hasn't uploaded one -- never a broken <img>), name, the Verified badge
 * (only when the turf's own is_verified flag is true -- never shown by
 * default), the call icon, and location. Sport/capacity/hours/amenities
 * live in their own cards below (TurfStats, TurfOpeningHours,
 * TurfAmenities) rather than crammed into this one.
 */
export function TurfInfoCard({ name, location, isVerified, coverImageUrl, contactPhone }: TurfInfoCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative h-36 sm:h-48 w-full bg-gradient-to-br from-turf-600 to-turf-900">
        {coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
          <img src={coverImageUrl} alt={`${name} cover`} className="absolute inset-0 size-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0" aria-hidden="true" />
        {contactPhone && (
          <a
            href={`tel:${contactPhone}`}
            aria-label="Call turf"
            title="Call turf"
            className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-white/90 text-turf-800 shadow hover:bg-white transition-colors"
          >
            <Phone className="size-5" aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">{name}</h1>
          {isVerified && (
            <span className="flex items-center gap-1 rounded-full bg-turf-50 px-2 py-0.5 text-xs font-medium text-turf-700">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              Verified
            </span>
          )}
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-sm text-slate-500">
          <MapPin className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{location}</span>
        </div>
      </div>
    </div>
  );
}
