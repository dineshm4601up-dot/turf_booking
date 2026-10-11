-- Per-turf payment and contact details, replacing the Phase 5 global
-- UPI_PAYEE_* env vars (each turf now configures its own UPI acceptance
-- details). Additive only -- no existing column is touched, and every new
-- column is either nullable or has a sensible default, so no existing turf
-- row's data is overwritten.

alter table public.turfs
  add column if not exists upi_vpa text,
  add column if not exists upi_phone text,
  add column if not exists payee_name text,
  add column if not exists qr_image_url text,
  -- NOT NULL with a default: Postgres backfills this default into every
  -- existing row when the column is added, so current turfs get a usable
  -- value immediately while still being fully editable afterward.
  add column if not exists whatsapp_number text not null default '9344689836',
  add column if not exists contact_phone text;

-- Public Storage bucket for QR code images: the QR is meant to be shown to
-- customers (same trust level as the VPA/payee name already shown to
-- them), so public read is appropriate. Uploads only ever happen via the
-- admin API route using the service-role key, which bypasses RLS/storage
-- policies entirely -- no anon/authenticated write policy is needed or
-- added, so writes stay admin-only by the absence of any such policy.
insert into storage.buckets (id, name, public)
values ('turf-qr-codes', 'turf-qr-codes', true)
on conflict (id) do nothing;
