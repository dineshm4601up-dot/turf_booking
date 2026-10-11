-- Phase 3 addition (additive, does not change Phase 2 tables/policies).
--
-- Lets the booking API safely replay a retried request (e.g. after a client
-- timeout) instead of creating a duplicate booking: the API looks up an
-- existing row by this key before inserting, and a partial unique index
-- guarantees at most one booking per key even under a concurrent retry.
alter table public.bookings
  add column if not exists idempotency_key text;

create unique index if not exists idx_bookings_idempotency_key
  on public.bookings (idempotency_key)
  where idempotency_key is not null;
