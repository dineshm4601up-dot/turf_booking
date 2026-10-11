-- Phase 5 additions: payment method/status on bookings, a payment-status
-- audit trail, and an index supporting the "look up my bookings by phone"
-- feature. Additive only -- no existing column, constraint, or RLS policy
-- from earlier phases is changed.

-- ---------------------------------------------------------------------------
-- payment_method / payment_status are deliberately nullable at the column
-- level so existing historical bookings (created before this migration)
-- are left alone rather than backfilled with a guessed value. The booking
-- API enforces payment_method as required for every NEW booking going
-- forward; this is an application-layer rule, not a DB NOT NULL, precisely
-- so old rows are preserved as-is.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists payment_method text,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_updated_at timestamptz;

alter table public.bookings
  add constraint bookings_payment_method_valid
    check (payment_method is null or payment_method in ('cash', 'upi')),
  add constraint bookings_payment_status_valid
    check (payment_status in ('unpaid', 'pending_verification', 'paid', 'failed'));

-- Supports "find all bookings for this phone number" (the booking lookup
-- feature) without a full table scan.
create index if not exists idx_bookings_customer_phone on public.bookings (customer_phone);

-- ---------------------------------------------------------------------------
-- Payment status audit trail: every admin-driven payment_status change is
-- recorded here (who, from what, to what, when), independent of
-- bookings.payment_updated_at which only holds the latest change. Written
-- by the admin API (service role) alongside the bookings UPDATE; never
-- written by anon/authenticated clients directly.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_events_booking_id on public.payment_events (booking_id);

alter table public.payment_events enable row level security;

create policy "Admins can view payment events"
  on public.payment_events for select
  to authenticated
  using (public.is_admin());

-- No insert/update/delete policies: writes only ever happen through the
-- admin API using the service-role key (bypassing RLS), the same pattern
-- as every other privileged write in this schema.
