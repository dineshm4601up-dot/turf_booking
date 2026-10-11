-- Demo turf + pricing data so the live customer UI has something real to
-- show. Safe to run more than once: the turf uses a fixed id with
-- ON CONFLICT DO NOTHING, and each pricing insert guards itself with a
-- correlated NOT EXISTS so re-running this file never creates duplicates.
-- Run this in the Supabase SQL Editor AFTER all files in
-- supabase/migrations/ have been applied.

insert into public.turfs (
  id, name, location, sport_type,
  opening_time, closing_time, slot_interval_minutes, is_active
)
values (
  '11111111-1111-4111-8111-111111111111',
  'GreenTurf Arena',
  'Sector 21, Gachibowli, Hyderabad',
  'Football (5-a-side), Cricket Box, Pickleball',
  '06:00', '23:00', 30, true
)
on conflict (id) do nothing;

-- Weekdays (Monday=1 .. Friday=5): a day rate and a pricier evening rate.
insert into public.turf_pricing (turf_id, day_of_week, start_time, end_time, price_per_hour)
select '11111111-1111-4111-8111-111111111111', d, '06:00', '17:00', 700
from unnest(array[1, 2, 3, 4, 5]) as d
where not exists (
  select 1 from public.turf_pricing
  where turf_id = '11111111-1111-4111-8111-111111111111'
    and day_of_week = d and start_time = '06:00'
);

insert into public.turf_pricing (turf_id, day_of_week, start_time, end_time, price_per_hour)
select '11111111-1111-4111-8111-111111111111', d, '17:00', '23:00', 900
from unnest(array[1, 2, 3, 4, 5]) as d
where not exists (
  select 1 from public.turf_pricing
  where turf_id = '11111111-1111-4111-8111-111111111111'
    and day_of_week = d and start_time = '17:00'
);

-- Weekend (Sunday=0, Saturday=6): a single flat rate for the whole day.
insert into public.turf_pricing (turf_id, day_of_week, start_time, end_time, price_per_hour)
select '11111111-1111-4111-8111-111111111111', d, '06:00', '23:00', 1000
from unnest(array[0, 6]) as d
where not exists (
  select 1 from public.turf_pricing
  where turf_id = '11111111-1111-4111-8111-111111111111'
    and day_of_week = d and start_time = '06:00'
);
