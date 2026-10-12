-- Business decision: remove the 5-digit booking reference feature
-- entirely. Customers now look up their bookings using only their mobile
-- number (see src/app/api/bookings/lookup/route.ts) -- no reference, no
-- OTP. This migration undoes 20261014000002_short_booking_reference.sql.
--
-- Written with IF EXISTS / safe-drop semantics throughout so it runs
-- cleanly regardless of whether that migration was ever applied in a given
-- environment (it was not applied to this project's live database). The
-- uuid `id` primary key and all foreign-key relationships are untouched;
-- no existing booking rows are deleted.

alter table public.bookings drop constraint if exists bookings_short_reference_format;
alter table public.bookings drop constraint if exists bookings_short_reference_unique;
alter table public.bookings alter column short_reference drop default;
alter table public.bookings alter column short_reference drop not null;
alter table public.bookings drop column if exists short_reference;
drop function if exists public.generate_unique_short_reference();
