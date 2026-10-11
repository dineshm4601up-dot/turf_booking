/**
 * Row shapes mirroring the Supabase schema (see supabase/migrations).
 * Reference documentation -- individual API routes still declare their own
 * narrower row interfaces for the exact columns they select.
 */

export type BookingStatus = "pending" | "confirmed" | "cancelled";

export interface TurfRow {
  id: string;
  name: string;
  location: string;
  sport_type: string;
  opening_time: string;
  closing_time: string;
  slot_interval_minutes: number;
  is_active: boolean;
  upi_vpa: string | null;
  upi_phone: string | null;
  payee_name: string | null;
  qr_image_url: string | null;
  whatsapp_number: string;
  contact_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface TurfPricingRow {
  id: string;
  turf_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  price_per_hour: number;
  created_at: string;
}

export interface BookingRow {
  id: string;
  turf_id: string;
  customer_name: string;
  customer_phone: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_price: number;
  status: BookingStatus;
  payment_method: "cash" | "upi" | null;
  payment_status: "unpaid" | "pending_verification" | "paid" | "failed";
  payment_updated_at: string | null;
  idempotency_key: string | null;
  short_reference: string;
  created_at: string;
  updated_at: string;
}

export interface TurfBlockRow {
  id: string;
  turf_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_at: string;
}
