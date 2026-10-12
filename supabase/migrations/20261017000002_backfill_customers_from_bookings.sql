-- Backfills public.customers from existing public.bookings rows, and links
-- each booking to its canonical customer via customer_id.
--
-- Non-destructive by design, so no separate backup step is required before
-- running it: every statement below either INSERTs a brand-new row into the
-- (empty, just-created) customers table, or UPDATEs bookings.customer_id
-- from null to a value -- no existing column value on any bookings row is
-- ever overwritten or deleted. customer_name/customer_phone on historical
-- bookings rows are left exactly as originally recorded.
--
-- Rerun-safe: `insert ... on conflict (phone) do nothing` means a second
-- run never creates a duplicate customer, and the final UPDATE only ever
-- touches bookings where customer_id is still null, so already-linked rows
-- (whether linked by an earlier run of this script, or by a live booking
-- made through the API since) are left untouched.
--
-- Canonical name per distinct valid phone number: the most frequently
-- occurring non-blank customer_name recorded for that phone; ties are
-- broken alphabetically (name asc) for a fully deterministic result that
-- doesn't depend on row order or timing.
--
-- A booking is skipped (left unlinked, customer_id stays null) if its
-- customer_phone doesn't normalize to a valid 10-digit Indian mobile number
-- (^[6-9][0-9]{9}$ after trimming), or if every booking under an otherwise
-- valid phone number has a blank customer_name -- this script never
-- invents a phone number or a name. Both cases are reported via RAISE
-- NOTICE below for manual review; nothing is silently discarded.

do $$
declare
  v_invalid_phone_count integer;
  v_customers_created integer;
  v_bookings_linked integer;
  v_blank_name_only_count integer;
begin
  select count(*) into v_invalid_phone_count
  from public.bookings
  where customer_id is null
    and not (btrim(customer_phone) ~ '^[6-9][0-9]{9}$');

  if v_invalid_phone_count > 0 then
    raise notice 'Customer Master backfill: % booking(s) have a customer_phone that does not normalize to a valid 10-digit Indian mobile number and were left unlinked. Review with: select id, customer_name, customer_phone from public.bookings where customer_id is null and not (btrim(customer_phone) ~ ''^[6-9][0-9]{9}$'');', v_invalid_phone_count;
  end if;

  with valid_bookings as (
    select
      btrim(customer_phone) as phone,
      btrim(customer_name) as name
    from public.bookings
    where btrim(customer_phone) ~ '^[6-9][0-9]{9}$'
      and btrim(customer_name) <> ''
  ),
  name_counts as (
    select phone, name, count(*) as occurrences
    from valid_bookings
    group by phone, name
  ),
  ranked_names as (
    select
      phone,
      name,
      occurrences,
      row_number() over (
        partition by phone
        order by occurrences desc, name asc
      ) as rn
    from name_counts
  ),
  canonical as (
    select phone, name from ranked_names where rn = 1
  )
  insert into public.customers (phone, name)
  select phone, name from canonical
  on conflict (phone) do nothing;

  get diagnostics v_customers_created = row_count;
  raise notice 'Customer Master backfill: % customer record(s) created.', v_customers_created;

  update public.bookings b
  set customer_id = c.id
  from public.customers c
  where b.customer_id is null
    and btrim(b.customer_phone) = c.phone;

  get diagnostics v_bookings_linked = row_count;
  raise notice 'Customer Master backfill: % booking(s) linked to a customer record.', v_bookings_linked;

  select count(distinct btrim(customer_phone)) into v_blank_name_only_count
  from public.bookings
  where customer_id is null
    and btrim(customer_phone) ~ '^[6-9][0-9]{9}$'
    and btrim(customer_name) = '';

  if v_blank_name_only_count > 0 then
    raise notice 'Customer Master backfill: % phone number(s) have a valid format but no non-blank customer_name on any booking, so no customer record was created and those bookings remain unlinked. Review with: select distinct customer_phone from public.bookings where customer_id is null and btrim(customer_phone) ~ ''^[6-9][0-9]{9}$'' and length(btrim(customer_name)) = 0;', v_blank_name_only_count;
  end if;
end $$;
