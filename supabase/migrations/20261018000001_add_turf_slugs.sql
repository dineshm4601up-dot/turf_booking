-- Adds a persistent, unique, URL-safe slug per turf (e.g.
-- "the-4th-zone-turf") so /book/<slug> is a readable URL instead of
-- exposing the turf's internal uuid. The uuid `id` column is completely
-- unaffected: it remains the real primary key and the only thing used for
-- foreign-key relationships, availability checks, booking creation,
-- pricing, and payment configuration. `slug` is purely a customer-facing
-- routing value layered on top -- the same pattern this project already
-- used for the (now-removed) short booking reference.

alter table public.turfs add column if not exists slug text;

-- One-time backfill for any turf that predates this migration: derive a
-- slug from its name using the same algorithm src/lib/slug.ts uses in
-- application code (lowercase, runs of non [a-z0-9] collapsed to a single
-- hyphen, no leading/trailing hyphen; a name with nothing slug-able at all
-- falls back to "turf-<first 8 chars of its id>"), then deduplicate
-- deterministically by creation order so two turfs sharing a name never
-- collide -- the second gets "-2", the third "-3", matching the same
-- numbering findAvailableSlug() (src/lib/admin/turf-slug.ts) uses for a
-- newly created turf.
with base as (
  select
    id,
    coalesce(
      nullif(regexp_replace(regexp_replace(lower(btrim(name)), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'), ''),
      'turf-' || substr(id::text, 1, 8)
    ) as base_slug,
    created_at
  from public.turfs
  where slug is null
),
deduped as (
  select
    id,
    base_slug,
    row_number() over (partition by base_slug order by created_at, id) as dup_rank
  from base
)
update public.turfs t
set slug = case when d.dup_rank = 1 then d.base_slug else d.base_slug || '-' || d.dup_rank::text end
from deduped d
where t.id = d.id;

-- Safe now: every existing row was backfilled above.
alter table public.turfs alter column slug set not null;

alter table public.turfs add constraint turfs_slug_unique unique (slug);
alter table public.turfs add constraint turfs_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
