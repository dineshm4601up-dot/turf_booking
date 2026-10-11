-- Row Level Security for turfs, turf_pricing, turf_blocks and bookings.
-- admin_users RLS is handled in 20261011000006_admin_users.sql.

-- ---------------------------------------------------------------------------
-- turfs: non-sensitive config. Public can read active turfs (needed to show
-- turf info/hours to customers in Phase 3); only admins can read inactive
-- turfs or write anything.
-- ---------------------------------------------------------------------------
alter table public.turfs enable row level security;

create policy "Public can view active turfs"
  on public.turfs for select
  to anon, authenticated
  using (is_active = true);

create policy "Admins can view all turfs"
  on public.turfs for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert turfs"
  on public.turfs for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update turfs"
  on public.turfs for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete turfs"
  on public.turfs for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- turf_pricing: non-sensitive. Public can read (needed to compute prices in
-- the booking UI); only admins can write.
-- ---------------------------------------------------------------------------
alter table public.turf_pricing enable row level security;

create policy "Public can view turf pricing"
  on public.turf_pricing for select
  to anon, authenticated
  using (true);

create policy "Admins can manage turf pricing"
  on public.turf_pricing for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- turf_blocks: non-sensitive (no customer data). Public can read (needed to
-- show blocked periods as unavailable); only admins can write.
-- ---------------------------------------------------------------------------
alter table public.turf_blocks enable row level security;

create policy "Public can view turf blocks"
  on public.turf_blocks for select
  to anon, authenticated
  using (true);

create policy "Admins can manage turf blocks"
  on public.turf_blocks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- bookings: contains customer PII (name, phone). No SELECT policy is given
-- to anon/authenticated at all, so public clients can never read any
-- booking row, their own or anyone else's. No INSERT policy is given either
-- -- booking creation is deliberately left to a Phase 3 server-side API
-- using the service-role key (which bypasses RLS), after the API validates
-- input itself. Only admins can read or manage bookings directly.
-- ---------------------------------------------------------------------------
alter table public.bookings enable row level security;

create policy "Admins can view all bookings"
  on public.bookings for select
  to authenticated
  using (public.is_admin());

create policy "Admins can update bookings"
  on public.bookings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete bookings"
  on public.bookings for delete
  to authenticated
  using (public.is_admin());
