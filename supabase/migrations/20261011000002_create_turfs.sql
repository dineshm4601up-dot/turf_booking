create table if not exists public.turfs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  sport_type text not null,
  opening_time time not null,
  closing_time time not null,
  slot_interval_minutes integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint turfs_name_not_blank check (btrim(name) <> ''),
  constraint turfs_location_not_blank check (btrim(location) <> ''),
  constraint turfs_sport_type_not_blank check (btrim(sport_type) <> ''),
  constraint turfs_opening_before_closing check (opening_time < closing_time),
  constraint turfs_slot_interval_positive check (slot_interval_minutes > 0)
);

create trigger turfs_set_updated_at
  before update on public.turfs
  for each row execute function public.set_updated_at();

create index if not exists idx_turfs_is_active on public.turfs (is_active);
