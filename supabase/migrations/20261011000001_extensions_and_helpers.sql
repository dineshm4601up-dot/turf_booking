-- Extensions and shared helpers used by later migrations.

-- gen_random_uuid() for primary keys.
create extension if not exists pgcrypto;

-- GiST support for equality on scalar types (uuid), needed by the
-- exclusion constraint on public.bookings that prevents overlapping slots.
create extension if not exists btree_gist;

-- Shared trigger function: keeps `updated_at` current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
