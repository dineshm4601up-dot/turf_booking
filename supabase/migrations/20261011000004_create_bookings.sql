create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  turf_id uuid not null references public.turfs (id) on delete restrict,
  -- Stored as text per spec: phone numbers are identifiers, not quantities
  -- (leading zeros, "+" prefixes, and formatting must survive round-trips).
  customer_name text not null,
  customer_phone text not null,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes integer not null,
  total_price numeric(10, 2) not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Half-open [start, end) timestamp range for the overlap exclusion
  -- constraint below. Generated so callers never have to keep it in sync.
  time_range tsrange generated always as (
    tsrange(booking_date + start_time, booking_date + end_time, '[)')
  ) stored,

  constraint bookings_status_valid
    check (status in ('pending', 'confirmed', 'cancelled')),
  constraint bookings_customer_name_not_blank
    check (btrim(customer_name) <> ''),
  constraint bookings_customer_phone_not_blank
    check (btrim(customer_phone) <> ''),
  constraint bookings_time_range_valid
    check (end_time > start_time),
  constraint bookings_duration_positive
    check (duration_minutes > 0),
  -- Keeps duration_minutes honest relative to start_time/end_time so the two
  -- can never silently drift apart.
  constraint bookings_duration_matches_range
    check (duration_minutes = (extract(epoch from (end_time - start_time)) / 60)::integer),
  constraint bookings_price_non_negative
    check (total_price >= 0)
);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create index if not exists idx_bookings_turf_date on public.bookings (turf_id, booking_date);
create index if not exists idx_bookings_status on public.bookings (status);

-- Prevents two active (non-cancelled) bookings for the same turf from
-- occupying overlapping time ranges on the same date, enforced atomically
-- by Postgres at INSERT/UPDATE time -- safe under concurrent attempts,
-- the same way a unique constraint is. Cancelled bookings are excluded via
-- the WHERE clause, so cancelling one frees its slot for reuse.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    turf_id with =,
    time_range with &&
  ) where (status <> 'cancelled');
