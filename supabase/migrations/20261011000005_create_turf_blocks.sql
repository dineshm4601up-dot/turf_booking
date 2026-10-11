-- Admin-defined periods when a turf is unavailable for booking (maintenance,
-- private events, etc). Phase 3's availability logic will need to check
-- this table in addition to public.bookings; it is not cross-validated
-- against bookings at the database level in this phase.
create table if not exists public.turf_blocks (
  id uuid primary key default gen_random_uuid(),
  turf_id uuid not null references public.turfs (id) on delete cascade,
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint turf_blocks_time_range_valid check (end_time > start_time)
);

create index if not exists idx_turf_blocks_turf_date on public.turf_blocks (turf_id, block_date);
