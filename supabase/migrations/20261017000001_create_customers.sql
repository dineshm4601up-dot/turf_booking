-- Customer Master: one canonical record per distinct normalized 10-digit
-- mobile number. `bookings.customer_name`/`customer_phone` are preserved
-- unchanged (existing features read them directly) -- this adds a new
-- `customer_id` link alongside them rather than replacing anything.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  -- Stored as text, not numeric, per spec: a phone number is an
  -- identifier, not a quantity (leading digits, formatting must survive
  -- round-trips, and it's never meant to be arithmetic on).
  phone text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customers_phone_format check (phone ~ '^[6-9][0-9]{9}$'),
  constraint customers_name_not_blank check (btrim(name) <> '')
);

-- The uniqueness requirement, enforced by the database itself (not just
-- application code): exactly one customer per normalized phone number.
-- `id` remains the primary key -- phone is a unique attribute, not the PK,
-- per spec.
create unique index if not exists idx_customers_phone_unique on public.customers (phone);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- Links a booking to its canonical customer. Nullable: a booking whose
-- customer_phone never normalized to a valid number (shouldn't happen for
-- new bookings -- the API validates before insert -- but can for
-- historical rows predating this feature) simply has no link rather than
-- being forced into an arbitrary/fabricated customer record.
alter table public.bookings
  add column if not exists customer_id uuid references public.customers (id) on delete set null;

create index if not exists idx_bookings_customer_id on public.bookings (customer_id);

-- ---------------------------------------------------------------------------
-- RLS: same posture as bookings (Phase 2) -- this table holds customer PII
-- (name, phone), so no anon/authenticated SELECT or INSERT policy is given
-- at all. The booking API and the backfill migration both write via the
-- service-role key, which bypasses RLS entirely. Only authenticated admins
-- can read or edit customers directly, and only through policies gated by
-- is_admin() -- never an unrestricted public query.
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;

create policy "Admins can view all customers"
  on public.customers for select
  to authenticated
  using (public.is_admin());

create policy "Admins can update customers"
  on public.customers for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
