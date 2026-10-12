-- Customer home page redesign: adds the turf-display fields the new UI
-- needs (verified badge, max persons, number of turfs/courts, amenities,
-- cover image) so they're real admin-configurable data, not hardcoded UI.
-- Additive only -- no existing column is changed or removed, and every new
-- column has a safe default so existing rows remain valid immediately.

alter table public.turfs
  add column if not exists is_verified boolean not null default false,
  add column if not exists max_persons integer,
  add column if not exists turf_count integer not null default 1,
  add column if not exists amenities text[] not null default '{}'::text[],
  add column if not exists cover_image_url text;

alter table public.turfs
  add constraint turfs_max_persons_positive check (max_persons is null or max_persons > 0);

alter table public.turfs
  add constraint turfs_turf_count_positive check (turf_count > 0);

-- Amenities are a fixed, known set (kept in sync with
-- src/config/turf.ts's AMENITY_OPTIONS) rather than free text, so the
-- customer UI always knows which icon/label to render for each value.
alter table public.turfs
  add constraint turfs_amenities_known_values check (
    amenities <@ array['parking', 'restroom', 'sports_kits', 'dressing_room', 'drinking_water', 'wifi']::text[]
  );

-- Same pattern as the Phase 6 turf-qr-codes bucket: public (the cover image
-- is meant to be shown to every visitor, same trust level as the turf name
-- itself), written only by the service-role key from the admin upload route
-- -- no anon/authenticated Storage policy is added.
insert into storage.buckets (id, name, public)
values ('turf-cover-images', 'turf-cover-images', true)
on conflict (id) do nothing;
