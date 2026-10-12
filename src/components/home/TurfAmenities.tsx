import { Bath, Car, Dumbbell, GlassWater, type LucideIcon, LayoutGrid, Shirt, Wifi } from "lucide-react";
import { AMENITY_OPTIONS, type AmenityKey } from "@/config/turf";

const AMENITY_ICONS: Record<AmenityKey, LucideIcon> = {
  parking: Car,
  restroom: Bath,
  sports_kits: Dumbbell,
  dressing_room: Shirt,
  drinking_water: GlassWater,
  wifi: Wifi,
};

interface TurfAmenitiesProps {
  amenities: string[];
}

/** Renders only the amenities this turf has actually configured -- never the full fixed list, never a fabricated one. Nothing is rendered at all if none are configured. */
export function TurfAmenities({ amenities }: TurfAmenitiesProps) {
  const configured = AMENITY_OPTIONS.filter((option) => amenities.includes(option.key));
  if (configured.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <LayoutGrid className="size-4 text-turf-600" aria-hidden="true" />
        Amenities
      </h2>

      <div className="mt-3 flex flex-col gap-2">
        {configured.map((option) => {
          const Icon = AMENITY_ICONS[option.key];
          return (
            <div
              key={option.key}
              className="flex items-center gap-2.5 rounded-lg bg-turf-50 px-3 py-2.5 text-sm font-medium text-turf-900"
            >
              <Icon className="size-4 text-turf-700 shrink-0" aria-hidden="true" />
              {option.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
