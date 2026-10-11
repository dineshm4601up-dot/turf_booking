-- Identifies authorized administrators. Deliberately separate from
-- auth.users metadata/JWT claims: a user-editable field (user_metadata,
-- a client-supplied role string, etc.) is not proof of admin access, since
-- a signed-in user can often change their own metadata. Membership in this
-- table is the single source of truth for "is this person an admin".
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
-- No policies are defined here on purpose. With RLS enabled and zero
-- policies, every role except the service role (which bypasses RLS
-- entirely) is denied all access -- anon and authenticated clients can
-- never read or write this table, even their own row. Admins are bootstrapped
-- by the project owner via the Supabase SQL Editor / Dashboard, using the
-- service role connection, as documented in README.md.

-- SECURITY DEFINER so RLS policies elsewhere (which run as the calling
-- anon/authenticated role) can still check admin_users without that role
-- needing direct table access. search_path is pinned to prevent search-path
-- hijacking of a SECURITY DEFINER function.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;
