-- Phase 4 additions: admin dashboard support. Additive only -- no Phase 2/3
-- tables, columns, or RLS policies are changed.

-- ---------------------------------------------------------------------------
-- 1. Prevent ambiguous/overlapping turf_pricing rows at the database level,
-- the same pattern used for bookings in Phase 2. calculateBookingPrice()
-- already detects overlap at booking time and errors out rather than
-- guessing a price, but it's better to refuse to create the bad data in
-- the first place. `time` has no built-in Postgres range type, so this
-- derives an int4range of minutes-since-midnight to exclude on.
-- ---------------------------------------------------------------------------
alter table public.turf_pricing
  add column if not exists minute_range int4range generated always as (
    int4range(
      (extract(epoch from start_time) / 60)::int,
      (extract(epoch from end_time) / 60)::int,
      '[)'
    )
  ) stored;

alter table public.turf_pricing
  add constraint turf_pricing_no_overlap
  exclude using gist (
    turf_id with =,
    day_of_week with =,
    minute_range with &&
  );

-- ---------------------------------------------------------------------------
-- 2. Indexes for admin dashboard filtering (today's bookings, recent
-- bookings list, status filter already covered by idx_bookings_status).
-- ---------------------------------------------------------------------------
create index if not exists idx_bookings_booking_date on public.bookings (booking_date);
create index if not exists idx_bookings_created_at on public.bookings (created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Atomic "create a block, but refuse if it would silently overlap an
-- existing active booking" -- a read (check conflicts) then a write (insert
-- the block) across two tables, which needs to happen as one transaction
-- so a booking can't sneak into the gap between the check and the insert.
-- A single SQL/plpgsql function body is implicitly one transaction.
--
-- SECURITY: this bypasses RLS (SECURITY DEFINER) to read bookings and write
-- turf_blocks, so it must NOT be callable by anon/authenticated directly --
-- only the server-side admin API (via the service-role key) may call it.
-- The REVOKE/GRANT below enforce that; the API route also re-checks
-- is_admin() via admin_users before ever calling this function.
-- ---------------------------------------------------------------------------
create or replace function public.create_turf_block(
  p_turf_id uuid,
  p_block_date date,
  p_start_time time,
  p_end_time time,
  p_reason text
)
returns public.turf_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict_count integer;
  v_block public.turf_blocks;
begin
  if p_end_time <= p_start_time then
    raise exception 'end_time must be after start_time';
  end if;

  select count(*) into v_conflict_count
  from public.bookings b
  where b.turf_id = p_turf_id
    and b.booking_date = p_block_date
    and b.status <> 'cancelled'
    and b.start_time < p_end_time
    and p_start_time < b.end_time;

  if v_conflict_count > 0 then
    raise exception 'BLOCK_OVERLAPS_BOOKINGS:%', v_conflict_count;
  end if;

  insert into public.turf_blocks (turf_id, block_date, start_time, end_time, reason)
  values (p_turf_id, p_block_date, p_start_time, p_end_time, p_reason)
  returning * into v_block;

  return v_block;
end;
$$;

revoke all on function public.create_turf_block(uuid, date, time, time, text) from public;
grant execute on function public.create_turf_block(uuid, date, time, time, text) to service_role;
