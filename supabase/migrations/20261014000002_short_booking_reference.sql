-- SUPERSEDED: a later business decision removed the short-reference
-- feature entirely (customers now look up bookings by mobile number alone,
-- with no reference/OTP). See 20261015000001_remove_short_booking_reference
-- for the rollback. That migration is written with IF EXISTS checks
-- throughout, so it's safe to run whether or not this one was ever applied.
-- Kept here, unedited below this notice, as the historical record of what
-- was built and why -- do not run this file on a fresh environment; skip
-- straight from 20261014000001 to 20261015000001 instead.
--
-- Replaces the long uuid shown to customers with a short, unique 5-digit
-- reference (e.g. "48217"). The uuid `id` column remains the real primary
-- key / foreign key everywhere internally; `short_reference` is purely a
-- customer-facing display/lookup value layered on top.

alter table public.bookings add column if not exists short_reference text;

-- One-time backfill for any bookings that predate this migration: assigns
-- each a distinct value from a randomly-shuffled permutation of every
-- possible 5-digit code (10000-99999), so existing bookings get real,
-- guaranteed-unique references without ever touching their other data.
do $$
begin
  if exists (select 1 from public.bookings where short_reference is null) then
    with existing as (
      select id, row_number() over (order by created_at) as rn
      from public.bookings
      where short_reference is null
    ),
    pool as (
      select lpad(gs::text, 5, '0') as ref, row_number() over (order by random()) as rn
      from generate_series(10000, 99999) as gs
    )
    update public.bookings b
    set short_reference = p.ref
    from existing e
    join pool p on p.rn = e.rn
    where b.id = e.id;
  end if;
end $$;

-- Generator for new bookings: picks a random 5-digit candidate and retries
-- until one isn't already taken. This is a best-effort reduction in
-- collision likelihood, NOT the real safety net -- the UNIQUE constraint
-- below is: under true concurrency, two simultaneous inserts can still
-- both pick the same still-free-looking candidate before either commits,
-- so the API route must catch the resulting 23505 and retry the whole
-- INSERT (which calls this default function again, for a fresh candidate).
-- Fails loudly rather than ever assigning a duplicate if the ~90,000-value
-- space is ever exhausted (or nearly so).
create or replace function public.generate_unique_short_reference()
returns text
language plpgsql
as $$
declare
  v_ref text;
  v_attempts integer := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    v_ref := lpad((floor(random() * 90000) + 10000)::int::text, 5, '0');
    if not exists (select 1 from public.bookings where short_reference = v_ref) then
      return v_ref;
    end if;
    if v_attempts >= 200 then
      raise exception 'SHORT_REFERENCE_EXHAUSTED';
    end if;
  end loop;
end;
$$;

alter table public.bookings
  alter column short_reference set default public.generate_unique_short_reference();

-- Safe now: every existing row was backfilled above.
alter table public.bookings
  alter column short_reference set not null;

alter table public.bookings
  add constraint bookings_short_reference_unique unique (short_reference);

alter table public.bookings
  add constraint bookings_short_reference_format check (short_reference ~ '^[0-9]{5}$');
