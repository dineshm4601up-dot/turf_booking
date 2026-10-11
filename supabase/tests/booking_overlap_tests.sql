-- Manual validation for the Phase 2 schema. Run this in the Supabase SQL
-- Editor (or psql) AFTER applying all files in supabase/migrations/, against
-- a dev/staging project you don't mind writing test rows to temporarily.
--
-- Everything runs inside one transaction that is rolled back at the end, so
-- no test data is left behind even though the script performs real inserts.
-- Read the RAISE NOTICE output: every line should say PASS. A FAIL raises an
-- exception and aborts the script.

begin;

do $$
declare
  v_turf_id uuid;
begin
  insert into public.turfs (name, location, sport_type, opening_time, closing_time)
  values ('Test Turf', 'Test Location', 'Football', '06:00', '23:00')
  returning id into v_turf_id;

  -- Baseline booking: 17:00-18:30.
  insert into public.bookings (
    turf_id, customer_name, customer_phone, booking_date,
    start_time, end_time, duration_minutes, total_price, status
  ) values (
    v_turf_id, 'Alice', '9000000001', current_date + 7,
    '17:00', '18:30', 90, 1200, 'confirmed'
  );
  raise notice 'PASS: baseline booking 17:00-18:30 inserted';

  -- Overlapping booking 18:00-19:00 must be rejected (overlaps 17:00-18:30).
  begin
    insert into public.bookings (
      turf_id, customer_name, customer_phone, booking_date,
      start_time, end_time, duration_minutes, total_price, status
    ) values (
      v_turf_id, 'Bob', '9000000002', current_date + 7,
      '18:00', '19:00', 60, 800, 'confirmed'
    );
    raise exception 'FAIL: overlapping booking 18:00-19:00 was allowed';
  exception
    when exclusion_violation then
      raise notice 'PASS: overlapping booking 18:00-19:00 correctly rejected';
  end;

  -- Adjacent booking 18:30-19:30 must be allowed (half-open range: the
  -- baseline booking ends exactly when this one starts).
  insert into public.bookings (
    turf_id, customer_name, customer_phone, booking_date,
    start_time, end_time, duration_minutes, total_price, status
  ) values (
    v_turf_id, 'Carol', '9000000003', current_date + 7,
    '18:30', '19:30', 60, 800, 'confirmed'
  );
  raise notice 'PASS: adjacent booking 18:30-19:30 correctly allowed';

  -- A cancelled booking must not block a new booking in the same slot.
  insert into public.bookings (
    turf_id, customer_name, customer_phone, booking_date,
    start_time, end_time, duration_minutes, total_price, status
  ) values (
    v_turf_id, 'Dave', '9000000004', current_date + 8,
    '10:00', '11:00', 60, 800, 'cancelled'
  );

  insert into public.bookings (
    turf_id, customer_name, customer_phone, booking_date,
    start_time, end_time, duration_minutes, total_price, status
  ) values (
    v_turf_id, 'Erin', '9000000005', current_date + 8,
    '10:00', '11:00', 60, 800, 'confirmed'
  );
  raise notice 'PASS: cancelled booking did not block a new booking in the same slot';

  -- end_time before start_time must be rejected.
  begin
    insert into public.bookings (
      turf_id, customer_name, customer_phone, booking_date,
      start_time, end_time, duration_minutes, total_price, status
    ) values (
      v_turf_id, 'Frank', '9000000006', current_date + 9,
      '12:00', '11:00', 60, 800, 'confirmed'
    );
    raise exception 'FAIL: booking with end_time before start_time was allowed';
  exception
    when check_violation then
      raise notice 'PASS: end_time before start_time correctly rejected';
  end;

  -- duration_minutes inconsistent with start_time/end_time must be rejected.
  begin
    insert into public.bookings (
      turf_id, customer_name, customer_phone, booking_date,
      start_time, end_time, duration_minutes, total_price, status
    ) values (
      v_turf_id, 'Grace', '9000000007', current_date + 10,
      '12:00', '13:00', 90, 800, 'confirmed'
    );
    raise exception 'FAIL: mismatched duration_minutes was allowed';
  exception
    when check_violation then
      raise notice 'PASS: mismatched duration_minutes correctly rejected';
  end;

  -- Invalid status value must be rejected.
  begin
    insert into public.bookings (
      turf_id, customer_name, customer_phone, booking_date,
      start_time, end_time, duration_minutes, total_price, status
    ) values (
      v_turf_id, 'Heidi', '9000000008', current_date + 11,
      '12:00', '13:00', 60, 800, 'in_progress'
    );
    raise exception 'FAIL: invalid status value was allowed';
  exception
    when check_violation then
      raise notice 'PASS: invalid status value correctly rejected';
  end;
end $$;

rollback;

-- ---------------------------------------------------------------------------
-- Concurrency: a single script can't truly fire two simultaneous
-- transactions, so prove it manually with two separate sessions (two psql
-- connections, or two Supabase SQL Editor tabs) if you want to see it:
--
-- Session A:
--   begin;
--   insert into public.turfs (name, location, sport_type, opening_time, closing_time)
--     values ('Concurrency Test', 'x', 'Football', '06:00', '23:00') returning id;
--   -- (copy the returned id, use it below as :turf_id in both sessions)
--   insert into public.bookings (turf_id, customer_name, customer_phone,
--     booking_date, start_time, end_time, duration_minutes, total_price, status)
--     values (:turf_id, 'A', '9000000009', current_date + 30, '17:00', '18:00', 60, 800, 'confirmed');
--   -- do NOT commit yet
--
-- Session B (while A is still open):
--   begin;
--   insert into public.bookings (turf_id, customer_name, customer_phone,
--     booking_date, start_time, end_time, duration_minutes, total_price, status)
--     values (:turf_id, 'B', '9000000010', current_date + 30, '17:30', '18:30', 60, 800, 'confirmed');
--   -- this blocks until Session A commits or rolls back
--
-- Session A: commit;
-- Session B: the blocked statement now returns, and fails with an
--   exclusion_violation -- the GiST index serializes the two concurrent
--   attempts the same way a unique index would, so only one slot wins.
