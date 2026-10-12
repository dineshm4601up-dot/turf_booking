/**
 * Shared turf-display query shape used by every page that loads a turf's
 * public info (home page, Book Slot page). Keeping the select-columns list,
 * raw row type, and the row->view mapper in one place means both pages
 * read the same fields the same way -- neither page hardcodes the turf's
 * name/location/phone separately, and a field added here is available to
 * both without duplicating the mapping logic.
 */
export const TURF_VIEW_SELECT_COLUMNS =
  "id, name, location, sport_type, opening_time, closing_time, contact_phone, upi_vpa, payee_name, is_verified, max_persons, turf_count, amenities, cover_image_url";

export interface TurfViewRow {
  id: string;
  name: string;
  location: string;
  sport_type: string;
  opening_time: string;
  closing_time: string;
  contact_phone: string | null;
  upi_vpa: string | null;
  payee_name: string | null;
  is_verified: boolean;
  max_persons: number | null;
  turf_count: number;
  amenities: string[];
  cover_image_url: string | null;
}

export interface TurfView {
  id: string;
  name: string;
  location: string;
  sportType: string;
  openingTime: string;
  closingTime: string;
  contactPhone: string | null;
  upiAvailable: boolean;
  isVerified: boolean;
  maxPersons: number | null;
  turfCount: number;
  amenities: string[];
  coverImageUrl: string | null;
}

export function mapTurfRow(row: TurfViewRow): TurfView {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    sportType: row.sport_type,
    openingTime: row.opening_time,
    closingTime: row.closing_time,
    contactPhone: row.contact_phone,
    upiAvailable: Boolean(row.upi_vpa && row.payee_name),
    isVerified: row.is_verified,
    maxPersons: row.max_persons,
    turfCount: row.turf_count,
    amenities: row.amenities,
    coverImageUrl: row.cover_image_url,
  };
}
