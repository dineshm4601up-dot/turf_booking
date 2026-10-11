create table if not exists public.turf_pricing (
  id uuid primary key default gen_random_uuid(),
  turf_id uuid not null references public.turfs (id) on delete cascade,
  -- 0 = Sunday .. 6 = Saturday, matching PostgreSQL's extract(dow ...).
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  price_per_hour numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  constraint turf_pricing_day_of_week_range check (day_of_week between 0 and 6),
  constraint turf_pricing_time_range_valid check (start_time < end_time),
  constraint turf_pricing_price_positive check (price_per_hour > 0)
);

create index if not exists idx_turf_pricing_turf_id on public.turf_pricing (turf_id);
create index if not exists idx_turf_pricing_turf_day on public.turf_pricing (turf_id, day_of_week);
