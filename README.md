# Turf Booking Platform

A mobile-first turf booking app. Next.js App Router + TypeScript + Tailwind CSS on the frontend, Supabase (PostgreSQL) on the backend.

## Phase status

- **Phase 1 (done):** Customer booking UI — date/time/duration selection, booking summary.
- **Phase 2 (done):** Supabase schema, migrations, and Row Level Security.
- **Phase 3 (done):** Live availability, the real booking API, and the UI wired to real data. The demo availability generator and fake "demo booking" flow from Phase 1 are gone — every booking shown is a real row in `bookings`.
- **Phase 4 (done):** Secure admin dashboard — Supabase Auth login, turf/pricing/booking/block management, all gated by real server-side authorization.
- **Phase 5 (done):** Strict Indian mobile validation, a secure "View My Bookings" lookup, cash/UPI payment method selection with admin-verified payment status.
- **Phase 6 (done):** Per-turf UPI config with admin-uploaded QR images, a 5-digit booking reference replacing the uuid everywhere customer-facing, a WhatsApp booking-reminder button, and a call icon on the customer header.
- **Phase 7 (done):** Removed the Phase 6 5-digit booking reference entirely, per a business decision — see [Booking lookup: phone number only](#booking-lookup-phone-number-only-phase-7). `/my-bookings` now looks up bookings by mobile number alone, with no reference, OTP, or login of any kind. All other Phase 6 features (per-turf UPI/QR, WhatsApp reminder, call icon, 10-digit phone restriction) are unchanged.
- **Phase 8 (done):** Redesigned the customer home page to a modern, mobile-first layout (hero with cover image, Verified badge, stats row, opening hours, amenities, fixed bottom nav, sticky Book Now bar) — see [Home page redesign](#home-page-redesign-phase-8). Booking/payment/lookup logic is unchanged; this phase only touched display and added the new turf fields the design needed.
- **Phase 9 (done):** Split the booking flow out of the home page onto its own `/book/[turfId]` page, with "Book Now" navigating there instead of scrolling; both pages now share one `TurfInfoCard` header component and one turf-loading helper. Removed the Profile tab from the bottom nav (the route itself still exists). See [Book Slot page and shared header](#book-slot-page-and-shared-header-phase-9).
- **Phase 10 (done):** A centralized Customer Master — one canonical `customers` record per normalized mobile number, linked to bookings via `customer_id`. The booking form now looks up a returning customer's saved name and locks it (read-only) rather than trusting a resubmitted name; a new admin Customers tab lists/searches customers, shows booking history, and lets an admin correct a saved name. See [Customer Master](#customer-master-phase-10).
- **Not started:** A real paid payment gateway, SMS/WhatsApp *automated* notifications (the WhatsApp button only prefills a message for the customer to send themselves), subscriptions.

## Project setup

```bash
npm install
npm run dev
```

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (or use an existing one).
2. Wait for provisioning to finish.

## 2. Find your API credentials

In the Supabase dashboard: **Project Settings → API**.

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Public / anon key** (Supabase is migrating from "anon key" naming to "publishable key" — use whichever your project shows) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** (new naming: "secret key") → `SUPABASE_SERVICE_ROLE_KEY`. **Never** put this in a `NEXT_PUBLIC_*` variable or in any code that runs in the browser — it bypasses Row Level Security entirely. It's used by the server-side API routes (`src/app/api/*/route.ts`, via `src/lib/supabase/admin.ts`), never by browser code.

## 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the three Supabase values from step 2. `.env.local` is already in `.gitignore` — never commit real credentials. The three `UPI_PAYEE_*` variables are optional (the app runs fine with UPI disabled, cash-only) — see [UPI payments](#upi-payments) if you want to enable it.

## 4. Run the database migrations

The project doesn't use the Supabase CLI yet, so run the migrations by hand, **in order**, via the SQL Editor:

1. Open your project in the Supabase dashboard → **SQL Editor**.
2. Open each file in [supabase/migrations/](supabase/migrations/) in filename order (the numeric timestamp prefix is the order) and run its contents:
   - `20261011000001_extensions_and_helpers.sql`
   - `20261011000002_create_turfs.sql`
   - `20261011000003_create_turf_pricing.sql`
   - `20261011000004_create_bookings.sql`
   - `20261011000005_create_turf_blocks.sql`
   - `20261011000006_admin_users.sql`
   - `20261011000007_row_level_security.sql`
   - `20261012000001_add_booking_idempotency_key.sql` (Phase 3: adds the column the booking API uses to safely replay a retried request — see [Idempotency](#idempotency-safe-retries) below)
   - `20261012010000_phase4_admin_schema.sql` (Phase 4: an exclusion constraint preventing overlapping `turf_pricing` rules, two indexes for the admin dashboard's filters, and the `create_turf_block()` function the blocks API calls — see [Admin dashboard](#admin-dashboard-phase-4) below)
   - `20261013000001_payments_and_phone_lookup.sql` (Phase 5: `payment_method`/`payment_status`/`payment_updated_at` on `bookings`, the `payment_events` audit table, and an index on `customer_phone` — see [Payments and booking lookup](#payments-and-booking-lookup-phase-5) below)
   - `20261014000001_turf_payment_contact_fields.sql` (Phase 6: `upi_vpa`/`upi_phone`/`payee_name`/`qr_image_url`/`whatsapp_number`/`contact_phone` on `turfs`, and the public `turf-qr-codes` Storage bucket)
   - ~~`20261014000002_short_booking_reference.sql`~~ — **skip this one.** It added the 5-digit reference that Phase 7 then removed. Kept in the repo only as a historical record (see the notice at its top); do not run it on a fresh environment.
   - `20261015000001_remove_short_booking_reference.sql` (Phase 7: drops `bookings.short_reference` and its generator function/constraints, if they exist. Written with `IF EXISTS` throughout, so it's a safe no-op on an environment that never ran the migration above — see [Booking lookup: phone number only](#booking-lookup-phone-number-only-phase-7) below)
   - `20261016000001_turf_display_fields.sql` (Phase 8: `is_verified`/`max_persons`/`turf_count`/`amenities`/`cover_image_url` on `turfs`, and the public `turf-cover-images` Storage bucket — see [Home page redesign](#home-page-redesign-phase-8) below)
   - `20261017000001_create_customers.sql` (Phase 10: the `customers` table, its unique phone index and RLS policies, and `bookings.customer_id` — see [Customer Master](#customer-master-phase-10) below)
   - `20261017000002_backfill_customers_from_bookings.sql` (Phase 10: one-time, rerun-safe data migration consolidating existing `bookings` rows into `customers` records and linking them — **read its own header comment and the RAISE NOTICE output when you run it**; see [Customer Master](#customer-master-phase-10) below)
3. Run each one and confirm it succeeds before moving to the next — later files depend on tables/functions created earlier.
4. Optionally, run [supabase/seed.sql](supabase/seed.sql) to insert one demo turf with weekday/weekend pricing, so the live UI has something to show immediately. It's safe to run more than once (it no-ops if the data already exists).

If you later adopt the Supabase CLI, these same files are already named in the CLI's expected `<timestamp>_<description>.sql` format and will work with `supabase db push` / `supabase migration up` as-is.

### Validating the schema

[supabase/tests/booking_overlap_tests.sql](supabase/tests/booking_overlap_tests.sql) is a manual validation script — run it in the SQL Editor after the migrations above. It inserts test rows inside a transaction it rolls back at the end (no data is left behind) and prints `PASS`/`FAIL` via `RAISE NOTICE` for:

- a baseline booking
- an overlapping booking being rejected
- an adjacent (back-to-back) booking being allowed
- a cancelled booking not blocking a new booking in the same slot
- `end_time` before `start_time` being rejected
- a `duration_minutes` that doesn't match `start_time`/`end_time` being rejected
- an invalid `status` value being rejected

The file also documents, in a comment block, how to manually verify concurrent-safety using two SQL Editor tabs / `psql` sessions.

Read-only checks against this project's live database (via the service-role key), repeated across phases, found:

- **Applied:** all 7 Phase 2 migrations, the Phase 3 idempotency-key migration, the Phase 4 migration (`turf_pricing.minute_range` exists), and the Phase 5 migration (`bookings.payment_method` exists). An administrator has been bootstrapped (`admin_users` has 1 row), and the demo turf has since been renamed/edited via the admin dashboard (its live name is no longer the original seed value).
- **Applied since the Phase 7 writeup above:** the Phase 6 turf-fields migration is now live (`turfs.upi_vpa`/`whatsapp_number`/`contact_phone` all exist, and the `turf-qr-codes` Storage bucket exists). `bookings.short_reference` is confirmed absent, which is the correct end state per Phase 7 regardless of whether `20261014000002` was ever run.
- **Not yet applied:** the Phase 8 turf-display-fields migration (`20261016000001`) — `turfs.is_verified`/`max_persons`/`turf_count`/`amenities`/`cover_image_url` don't exist live yet, and the `turf-cover-images` Storage bucket doesn't exist yet.

`booking_overlap_tests.sql` itself still hasn't actually been executed against this project; run it yourself to see the real PASS/FAIL output. See the checklist at the end of this document for exactly what's left to run.

## 5. Configure the first administrator

Admin status is **not** derived from anything the client sends — not a JWT claim, not `user_metadata`, not a request header, not a role picked in the UI. Every admin page and every admin API route calls `checkAdminAuth()` (`src/lib/admin-auth.ts`), which does two separate things:

1. Verifies *who* is asking, via `supabase.auth.getUser()` on a cookie-bound client using the public anon key — this validates the session's JWT with the Auth server rather than trusting an unverified cookie claim.
2. Checks whether that verified user is *authorized*, by looking them up in `public.admin_users` using the **service-role** client — this table has Row Level Security enabled with **zero policies**, so no anon/authenticated client, even the user's own session, can read or write it directly. Only the service-role key (server-side only) can, and in this phase that's only ever used from `checkAdminAuth()` and from the Supabase dashboard/SQL Editor to bootstrap the first admin.

Being signed in is necessary but never sufficient — a signed-in user who isn't in `admin_users` gets a clear "Access denied" page (if they visit `/admin`) or a `403` (if they call an admin API route directly), never admin access.

There is no self-signup for admins (by design — nothing should let a random signup become an administrator). To create the first one:

1. In the Supabase dashboard, go to **Authentication → Users → Add user**, and create an account with an email and password for your administrator. (Email/password sign-in must be enabled for the project, which it is by default.)
2. Copy that user's UUID from the same Users list.
3. In the **SQL Editor**, run:
   ```sql
   insert into public.admin_users (user_id) values ('paste-the-uuid-here');
   ```
4. Sign in at `/admin/login` with that email and password. You'll land on `/admin`, the dashboard.
5. To add another admin later, repeat steps 1–3 with their account. To revoke access: `delete from public.admin_users where user_id = 'that-uuid';` (their next request will be denied; an already-open browser session only loses access once its token is next re-verified, i.e. on their next request to an admin route).

**As of this writing, `admin_users` is empty on the live project** — nobody can access `/admin` yet until you complete the steps above.

## Database schema overview

| Table | Purpose | Notable constraints |
|---|---|---|
| `turfs` | Turf config: name, location, sport, hours, slot interval, active flag, per-turf UPI/WhatsApp/contact details | `opening_time < closing_time`; positive slot interval |
| `turf_pricing` | Per-day-of-week, per-time-range hourly rate | `day_of_week` 0–6; `start_time < end_time`; positive price |
| `bookings` | Customer bookings | `end_time > start_time`; `duration_minutes` must match the actual time span; `status` in `pending`/`confirmed`/`cancelled`; `customer_id` links to its canonical `customers` row (nullable, for historical rows that couldn't be linked); **no two active bookings for the same turf may have overlapping times** (see below) |
| `customers` | Customer Master: one record per normalized mobile number (Phase 10) | `phone` unique, exactly 10 digits starting 6–9; `name` not blank |
| `turf_blocks` | Admin-defined unavailable periods (maintenance, private events) | `end_time > start_time` |
| `admin_users` | Authorization source of truth | RLS enabled, no policies — service-role only |

`turf_pricing` additionally has a Phase 4 exclusion constraint (`turf_pricing_no_overlap`) preventing two rules for the same turf and day of week from covering any of the same minutes — see [Admin dashboard](#admin-dashboard-phase-4).

### Preventing overlapping bookings

`bookings` has a generated `time_range` column (`tsrange(booking_date + start_time, booking_date + end_time, '[)')`) and a PostgreSQL **exclusion constraint**:

```sql
exclude using gist (turf_id with =, time_range with &&) where (status <> 'cancelled')
```

This is enforced by the database itself at `INSERT`/`UPDATE` time, the same way a unique index is — two concurrent transactions attempting overlapping slots will have exactly one succeed; the other gets a Postgres `exclusion_violation` (SQLSTATE `23P01`) error. The half-open `[start, end)` range means a booking ending at 18:00 and one starting at 18:00 do **not** overlap (back-to-back bookings are allowed), while a 17:00–18:30 booking does conflict with an 18:00–19:00 one. Cancelled bookings are excluded from the constraint via the `WHERE` clause, so cancelling a booking immediately frees its slot.

### Row Level Security summary

| Table | Public (anon/authenticated) | Admin (`is_admin()` true) |
|---|---|---|
| `turfs` | Read **active** turfs only | Full read/write |
| `turf_pricing` | Read all | Full read/write |
| `turf_blocks` | Read all | Full read/write |
| `bookings` | **No access at all** (no SELECT or INSERT policy) | Full read/write |
| `admin_users` | No access | No access either — service role only |

Public clients cannot read any booking (protects customer name/phone) and cannot create bookings directly. Booking creation goes through the server-side `POST /api/bookings` route below, which uses `SUPABASE_SERVICE_ROLE_KEY` (bypassing RLS) only after validating input itself, and catches the `23P01` exclusion-violation error to tell a customer their chosen slot is already taken.

## API routes (Phase 3)

Both routes live under `src/app/api/` and use the service-role client (`src/lib/supabase/admin.ts`) server-side only; the browser never sees that key. Each route's exported `GET`/`POST` is a thin wrapper around an injectable `handle*Request(request, deps)` function, so tests can supply a fake Supabase client instead of a real one (see [Testing](#testing)).

### `GET /api/availability`

Query params: `turfId` (uuid, required), `date` (`YYYY-MM-DD`, required), `startTime` (`HH:mm`, optional).

- Without `startTime`: returns `slots`, one entry per grid point between the turf's opening and closing time (at the turf's `slot_interval_minutes`), each `{ startTime, available }`. A slot is unavailable if it overlaps a `pending`/`confirmed` booking or a `turf_blocks` row, falls outside opening hours, or is in the past. `cancelled` bookings never affect this.
- With `startTime`: additionally returns `durationOptions`, one entry per allowed duration (30/60/.../180 min) for that exact start time: `{ durationMinutes, endTime, available, price }`. `price` is the server-computed total for that specific start+duration; it's `null` whenever `available` is `false`, including when pricing itself isn't configured for that slot (see [Pricing](#pricing) below) — the UI is told "not available" rather than shown a guessed number.
- Never returns booking rows, customer names, or phone numbers — only booleans/prices derived from them. The route reads `bookings` with the service-role key (anon/authenticated can't — see RLS above), but strips everything except `start_time`/`end_time` before any computation, and the response never includes raw booking data.
- Returns `404` for a turf that doesn't exist or isn't `is_active`; `400` for a malformed `turfId`/`date`/`startTime`.

### `POST /api/bookings`

Body (JSON): `turfId`, `bookingDate`, `startTime`, `durationMinutes`, `customerName`, `customerPhone`. Optional header `Idempotency-Key` (see below).

Server-side, in order: rate limit check → parse/validate every field (uuid/date/time format, `durationMinutes` must be one of the allowed set, name/phone shape) → idempotency replay check → load the turf (404 if missing/inactive) → compute `endTime` and check it aligns to the turf's slot grid and fits within opening hours (`400` if not) → check the date/time isn't in the past (`400`) → re-check against `turf_blocks` (`409` if blocked) → compute the price from `turf_pricing` (`422` if pricing is missing/ambiguous for that exact time) → insert the booking with `status: 'pending'`.

The client-submitted body is **never** trusted for price or status: those two fields aren't even read from the request, let alone written from it. `durationMinutes` is restricted to the fixed allow-list in `src/config/turf.ts`, which both the client and server import — a client can't submit `durationMinutes: 47` and have the server honor it.

The final `INSERT` is where the database's exclusion constraint (Phase 2) is the authoritative word on double-booking, not any of the checks above: if a concurrent request already took the slot, Postgres rejects the insert with `23P01` and the route returns:

```json
409 { "error": "Sorry, this slot was just booked. Please select another time." }
```

A successful booking returns `201` with `{ id, turfId, turfName, customerName, bookingDate, startTime, endTime, durationMinutes, totalPrice, status, createdAt }` — `status` is always `"pending"` for a new booking (nothing in this phase auto-confirms or charges anything; see [Assumptions and limitations](#assumptions-and-limitations)).

### Pricing

`calculateBookingPrice` (`src/lib/pricing.ts`) looks up `turf_pricing` rows for the booking's turf and day-of-week, then walks the booking's `[startTime, endTime)` range summing `(overlap minutes / 60) * price_per_hour` across however many pricing periods it spans — so a booking that crosses, say, a 17:00 day/evening-rate boundary is billed proportionally for each side. If any part of the range has no matching pricing period (a gap) or two periods both claim the same minute (an overlap — a data problem), it returns an error instead of a number, and the API responds `422` rather than ever charging a guessed price.

### Idempotency (safe retries)

Each booking submission carries a client-generated `Idempotency-Key` header (a `crypto.randomUUID()`, created once per form instance in `BookingSummary.tsx` and reused across retries of the *same* attempt — a fresh key is only generated after a successful booking, when the user explicitly starts another one). The server:

1. On every request, first checks whether a booking with that key already exists — if so, returns it as-is (`200`) instead of inserting again.
2. On insert, if a race means two requests with the same key both pass that check, the database's partial unique index on `idempotency_key` (Phase 3 migration) rejects the second `INSERT` with `23505`; the route catches that and returns the winning row the same way.

This means a client retry after a timeout — or a user double-tapping "Confirm booking" (also prevented client-side by disabling the button while submitting) — can never create two bookings.

### Rate limiting

`src/lib/rate-limit.ts` is a small in-memory fixed-window limiter (5 requests/minute per IP on `POST /api/bookings`), returning `429` with a `Retry-After` header once exceeded. **Known limitation:** the counter lives in a plain `Map` in one server process. On a platform that runs multiple instances of the app (e.g. several Vercel lambdas), each instance tracks its own count, so the effective limit is "N per instance" rather than a hard global cap. For a real multi-instance deployment, swap it for a shared store (Upstash Redis, Vercel KV, or even a Postgres table with one atomic `UPDATE`) behind the same two-field `{ allowed, retryAfterSeconds }` return shape — the call site in `src/app/api/bookings/route.ts` doesn't need to change.

## Admin dashboard (Phase 4)

`/admin/login` is the only public page under `/admin`; everything else lives in the `src/app/admin/(dashboard)/` route group, whose `layout.tsx` calls `checkAdminAuth()` before rendering anything — unauthenticated visitors are redirected to `/admin/login`, and authenticated non-admins see an "Access denied" page instead of the dashboard. `middleware.ts` (scoped to `/admin/:path*` only — it never touches the customer-facing site) keeps the Supabase session cookie refreshed across navigation.

Every admin API route under `src/app/api/admin/` repeats the same `checkAdminAuth()` check itself, independent of the page-level guard — calling one of these routes directly (not through the UI) without a valid admin session gets a `401` (no session) or `403` (signed in, not an admin) before any data is touched. Each route follows the same injectable-deps pattern as the Phase 3 routes (`handle*Request(request, deps)` wrapped by a thin `GET`/`POST`/`PATCH`/`DELETE`), so tests can supply a fake admin/non-admin/unauthenticated session without touching real auth.

| Route | Methods | Purpose |
|---|---|---|
| `/api/admin/turfs` | `GET`, `POST` | List turfs (active + inactive); create a turf |
| `/api/admin/turfs/[id]` | `PATCH` | Edit a turf's details, hours, or slot interval; activate/deactivate (merges with existing row, so a request can send just `{ isActive }`) |
| `/api/admin/pricing` | `GET`, `POST` | List pricing rules (optionally `?turfId=`); add a rule |
| `/api/admin/pricing/[id]` | `DELETE` | Remove a pricing rule |
| `/api/admin/bookings` | `GET` | List bookings with `date`/`status`/`turfId` filters, `search` (exact match on a pasted full reference UUID, or partial match on customer name/phone), and `page`/`pageSize` pagination |
| `/api/admin/bookings/[id]` | `PATCH` | Change a booking's status (`{ status }`) |
| `/api/admin/blocks` | `GET`, `POST` | List blocked periods (optionally `?turfId=`); create a block |
| `/api/admin/blocks/[id]` | `DELETE` | Remove a block |

The UI itself is one page per resource (`turfs`, `pricing`, `bookings`, `blocks`) under the sidebar, each with an inline add/edit form rather than separate `/new` and `/[id]/edit` routes — a deliberate simplification to keep the route count down; the functionality (create, edit, delete) is the same either way. `BookingsTable` (`src/components/admin/BookingsTable.tsx`) is shared between the dashboard's "recent bookings" preview and the full `/admin/bookings` page, parameterized by whether it shows the turf filter and the confirm/cancel actions.

### Booking status transitions

The only allowed transitions (`src/lib/booking-status.ts`) are `pending → confirmed`, `pending → cancelled`, and `confirmed → cancelled`; `cancelled` is terminal, and there's no path back to `pending`. `PATCH /api/admin/bookings/[id]` re-fetches the booking, validates the requested transition against its *current* status, then performs a guarded update (`.eq("status", currentStatus)` alongside `.eq("id", bookingId)`): if the row's status changed between the read and the write (another admin acted on it in the meantime), zero rows match and the route returns a `409` ("already updated by someone else") instead of silently overwriting. Confirming never needs a fresh overlap check — a `pending` booking already occupies its slot under the Phase 2 exclusion constraint (whose `WHERE` clause excludes only `cancelled`), so moving it to `confirmed` can't newly conflict with anything. Cancelling removes it from that constraint's domain, which is what "frees the slot" means in practice — the very next availability check or booking attempt sees it as open.

### Pricing overlap protection

Creating a pricing rule now goes through the same two-layer defense as bookings: the API route itself has no proactive check (deliberately — the database is the single source of truth here, same as the booking overlap constraint), and the new `turf_pricing_no_overlap` exclusion constraint (Phase 4 migration) rejects a conflicting `INSERT` with `23P01`, which the route maps to a `409` ("overlaps an existing rule for the same turf and day"). Back-to-back rules (one ending exactly when the next starts) are allowed, same half-open-range logic as bookings. Deleting or editing a rule never touches existing bookings — `total_price` is stored on the booking row at creation time, not recalculated, so historical totals are permanently unaffected by later pricing changes.

### Blocking time safely

`POST /api/admin/blocks` doesn't insert directly — it calls the `create_turf_block()` Postgres function (Phase 4 migration) via `admin.rpc(...)`. That function, in one atomic transaction, checks for overlapping `pending`/`confirmed` bookings and raises an error (which the route turns into a `409` naming how many bookings conflict) if any exist, otherwise inserts the block. Doing the check-then-insert inside a single function body — rather than two separate round trips from the API route — closes the race window where a booking could be created in the gap between the check and the insert. The function is `SECURITY DEFINER` (so it can read `bookings` and write `turf_blocks` despite RLS) but `REVOKE`d from `PUBLIC` and only `GRANT`ed to `service_role`, so it's unreachable by anon/authenticated clients even if they somehow learned its name. Removing a block (`DELETE /api/admin/blocks/[id]`) takes effect immediately in `GET /api/availability`, since that route always queries `turf_blocks` live.

### Dashboard revenue rule

"Today's expected revenue" (`computeDashboardSummary`, `src/lib/dashboard-summary.ts`) sums `total_price` for today's bookings that are `pending` or `confirmed`; `cancelled` bookings never contribute, regardless of what their `total_price` was. It's explicitly labeled "expected" in the UI and never called "collected" or "received" — there's no payment integration anywhere in this app, so this number is an estimate of money the turf expects to collect, not a financial record.

## Payments and booking lookup (Phase 5)

### Mobile number validation

`normalizeIndianMobileNumber` / `validateCustomerPhone` (`src/lib/validation.ts`) is the single source of truth for what counts as a valid phone number, imported by both the browser form (`BookingSummary.tsx`, `/my-bookings`) and every server route that accepts a phone number (`POST /api/bookings`, `POST /api/bookings/lookup`) — the client-side check is a convenience that saves a round trip; the server never trusts it and re-validates the raw input itself. It strips only unambiguous formatting (spaces, hyphens, a leading `+91`/`91`/`0`) and then requires **exactly 10 digits starting with 6–9** — any letter, symbol, or wrong length is rejected outright rather than silently stripped and miscounted (e.g. `"98765432ab"` fails; it is never quietly read as a 10-digit number). The normalized bare-10-digit form is what's stored in `customer_phone` (as `text`, never a numeric type) and is what every comparison in the app uses, so the same number always matches itself regardless of how a customer typed it in.

Every mobile-number `<input>` (`BookingSummary.tsx`, `/my-bookings`) additionally uses `restrictToDigits` (`src/lib/validation.ts`) in its `onChange` handler, not just its `maxLength={10}` attribute: non-digit characters are stripped and the value is truncated to 10 characters on every keystroke, so an 11th digit (or a pasted letter) never visibly appears in the field at all — it's rejected at input time, not just on submit.

### Payment method selection

At checkout, `PaymentMethodSelector` lets the customer choose **Cash at turf** or **UPI** (disabled if the active turf hasn't configured UPI yet — see below); `POST /api/bookings` requires `paymentMethod` to be one of exactly `"cash"`/`"upi"` and rejects anything else, including a missing value. The server sets the *initial* `payment_status` itself based on the method — `unpaid` for cash, `pending_verification` for UPI — and **never reads a client-submitted payment status at all**, so there is no field a browser can send to mark its own booking paid. `payment_status` is a column separate from the booking's approval `status`; nothing in this app ever conflates the two, and an admin changes them through two entirely separate API routes.

### Cash payments

A cash booking is created `unpaid`. The confirmation screen and `/my-bookings` both say payment is due at the turf and that nothing has been collected yet. Only an admin, from `/admin/bookings`, can mark it `paid` (`PATCH /api/admin/bookings/[id]/payment`) — there is no customer-facing way to change this.

### UPI payments (per-turf, Phase 6)

UPI acceptance details are configured **per turf**, not as global app settings — each turf has its own `upi_vpa`, `payee_name`, `upi_phone` (optional), and `qr_image_url`, all editable from `/admin/turfs`. `getTurfUpiConfig()` (`src/config/payment.ts`) treats UPI as "available" for a turf only once both `upi_vpa` and `payee_name` are set; until then, `PaymentMethodSelector` disables the UPI option (computed from the same public turf query the home page already makes) and `POST /api/bookings` refuses to create a `upi` booking for that turf (`400`) even if someone bypasses the UI and calls the API directly — the app never fabricates payment details for a turf that hasn't configured them.

When UPI is available and selected:

1. The booking is created with `payment_status: "pending_verification"` immediately (the server never claims a payment has been *made* — only that the customer has chosen to pay this way).
2. The response includes a `upi` object: `{ payeeVpa, payeeName, payeePhone, amount, note, uri }`, where `amount` is the server-calculated total (never client-supplied) and `note` is a short descriptive payment note (`"<turf name> <date> <start time>"`) — not a reference code, not the uuid. (Phase 6 used the 5-digit short reference here; Phase 7 removed that feature entirely, so the note is now built from booking details that already exist.)
3. `UpiPaymentPanel.tsx` renders the configured payee name/VPA/phone, the amount and note, **the admin-uploaded QR image if one exists** (shown above the generated QR code as the turf's actual payment QR, scannable directly), a QR code (`react-qr-code`, pure SVG, no external network call) encoding `uri`, and a "Pay with UPI" link using the same `uri`.
4. `uri` is a standard deep link built by `buildUpiPaymentUri` (`src/lib/upi.ts`): `upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>`, with every parameter percent-encoded (spaces become `%20`, not `+`, for broader UPI-app compatibility). On a phone with a UPI app installed, tapping it opens that app's payment-method chooser with the amount and payee pre-filled; if no compatible app is installed, nothing happens (the link silently fails to resolve), which is exactly why the QR code stays visible alongside it as the fallback, and why the panel also shows the VPA as copyable text.
5. **Opening the UPI app, or returning to the page afterward, never changes `payment_status`.** It stays `pending_verification` until an admin independently verifies the payment (by checking their own UPI app/bank for a matching transaction, identified by the turf/date/time in the transaction note) and marks it `paid` or `failed` from `/admin/bookings`. No payment gateway, webhook, or automatic confirmation of any kind is implemented — this app cannot know a UPI payment happened on its own, and nothing in the UI claims otherwise.

#### QR code image upload

`/admin/turfs` (edit mode only — a turf must be saved once before it has an id to attach a file to) has a file input for the QR image, posting to `POST /api/admin/turfs/[id]/qr` as `multipart/form-data`. The route validates the file is PNG/JPEG/WEBP and ≤2MB before ever touching Storage, uploads it to the `turf-qr-codes` Supabase Storage bucket (created by the Phase 6 migration, `public: true` — the QR is meant to be shown to customers, the same trust level as the VPA already shown to them) at a per-turf path (`<turfId>/qr.<ext>`) with `upsert: true` (replacing, not accumulating, on every re-upload), then saves the resulting public URL onto `turfs.qr_image_url`. The admin UI shows uploading/success/error states and the currently-saved image when editing. Only the service-role key ever writes to this bucket — no anon/authenticated Storage policy is added, so the absence of one is what keeps writes admin-only.

### Admin payment verification

`/admin/bookings` shows each booking's payment method and status alongside its approval status, and — depending on the current state — a "Mark cash paid", "Verify paid", or "Mark failed" button. These call `PATCH /api/admin/bookings/[id]/payment`, a route completely separate from the booking-approval `PATCH /api/admin/bookings/[id]`, gated by the same `checkAdminAuth()` every other admin route uses. Every change is recorded in `payment_events` (`booking_id`, `previous_status`, `new_status`, `changed_by`, `created_at`) and stamps `bookings.payment_updated_at` — an audit trail of who verified what, and when. Setting a status to the value it already has is rejected (`400`), and the update itself is guarded the same optimistic-concurrency way as booking-status changes (`.eq("payment_status", currentStatus)`), so two admins acting on the same booking at once can't silently overwrite each other.

## WhatsApp reminder and call icon (Phase 6)

### WhatsApp booking reminder

After a successful booking, the confirmation screen shows a "Notify Turf on WhatsApp" button (`buildWhatsappClickToChatUrl` + `buildBookingWhatsAppMessage`, `src/lib/whatsapp.ts`) that opens `https://wa.me/<turf's WhatsApp number>?text=<prefilled message>` in a new tab. The destination number comes from `bookings` response's `turfWhatsappNumber` field, which the booking API reads from that specific turf's `whatsapp_number` column — **never hardcoded in frontend code**. New turfs default to `9344689836` (via the Phase 6 migration's column default, which also backfills existing turfs) but every turf can edit it from `/admin/turfs`; that default is a starting value, not a permanent destination. The message identifies the booking by turf name, customer name/mobile, date, times, duration, amount, payment method, payment status, and booking status — there is no reference code or internal id in it (see [Booking lookup: phone number only](#booking-lookup-phone-number-only-phase-7); Phase 6 originally put a 5-digit reference as the first line, Phase 7 removed it). Clicking the link **only opens WhatsApp with that text prefilled — it never sends anything automatically**; the person still has to press Send themselves. The button only appears after a booking has actually been saved (it's part of the post-submit confirmation view, not the form).

### Call icon

The customer home page header (`TurfInfoCard.tsx`) shows a phone icon next to the turf name when that turf has a `contact_phone` configured (`/admin/turfs`, a field distinct from the UPI phone and the WhatsApp number — mixing these up was explicitly avoided). Tapping it uses a plain `tel:` link (`aria-label="Call turf"`) to open the device's dialer. If no contact number is configured for the active turf, the icon is simply not rendered at all — a deliberate "sensible fallback" choice (a visible-but-non-functional button seemed worse than no button), documented here in case a different fallback is preferred later.

## Booking lookup: phone number only (Phase 7)

**Phase 7 is a deliberate business decision that reverses part of Phase 6.** Phase 6 had introduced a 5-digit `short_reference` on every booking and required customers to supply it, together with their phone number, to use `/my-bookings`. That feature has been **removed completely**: the column, its generator function, its unique/format constraints, the retry-on-collision insert logic, the admin "search by reference" branch, the reference line in the WhatsApp message, and the reference shown on the confirmation screen and in `/my-bookings` are all gone. `POST /api/bookings` and `POST /api/bookings/lookup` no longer return or accept a `reference` field at all.

In its place, `/my-bookings` and `POST /api/bookings/lookup` now require **only** the customer's 10-digit mobile number — the same `validateCustomerPhone`/`normalizeIndianMobileNumber` functions the booking form already used, so a phone number is validated and normalized identically everywhere in the app. No reference, no OTP, no login. Submitting a valid number returns every booking under that exact phone number (upcoming bookings first, then past ones, via `sortBookingsForLookup`), each showing turf name, date, start/end time, duration, total amount, booking status, payment method, and payment status; an unmatched number returns an empty list, rendered as:

> No bookings found for this mobile number. Please check the number and try again.

**This is a real, deliberate reduction in confidentiality versus both the Phase 5 design (uuid-based) and the Phase 6 design (phone + 5-digit reference), and it is documented here rather than hidden:** anyone who knows (or correctly guesses) a customer's 10-digit mobile number can see that customer's full booking history — turf, dates, times, amounts, and payment status. There is no second factor of any kind. This was an explicit, twice-stated business requirement ("customers must be able to check their bookings using only their mobile number. Do not add an OTP or booking-reference requirement"), not an oversight. What's still in place to bound the risk:

- The lookup route only ever reads `bookings` filtered by an **exact** normalized phone match — it can never return another customer's rows, and it has no write path at all (no way to change `status`, `payment_status`, or price), so even full knowledge of the response shape gives no way to mutate anything.
- Neither the internal uuid `id` nor the raw `customer_phone` is ever included in the lookup response — a booking is identified to the customer by its own turf/date/time/status, never by an id.
- Rate limiting (`src/lib/rate-limit.ts`, in-memory, no paid service) still applies: **15 requests per 5 minutes per IP**, bounding how many distinct phone numbers one client can probe in bulk. It does not and cannot stop someone who already has a specific victim's number from looking up that one number — that's the accepted trade-off of a single-factor, phone-only design.
- No real SMS/OTP provider is configured in this environment (same as Phase 5/6) — nothing in the UI claims one exists. If stronger protection becomes a requirement later, gating `/my-bookings` behind a real OTP provider is the natural next step; that would be a new feature addition, not part of this change.

The confirmation screen's "View My Bookings" link now carries only `?phone=` (no `ref=`) — a convenience auto-fill, not a security mechanism, since the lookup itself needs nothing but the phone number anyway.

The database migration `20261015000001_remove_short_booking_reference.sql` reverses `20261014000002_short_booking_reference.sql` (see [step 4](#4-run-the-database-migrations) above). It uses `IF EXISTS` on every statement, so it's safe to run whether or not the Phase 6 migration was ever applied in a given environment — on this project's live database, the Phase 6 migration was never applied, so the removal migration is a clean no-op there. No existing booking rows are deleted by either migration; only the `short_reference` column, its constraints, and its generator function are affected. The uuid `id` primary key and every foreign-key relationship are untouched.

## Home page redesign (Phase 8)

A visual redesign of the customer home page, inspired by a reference screenshot of popular turf-booking apps. **No booking, payment, or lookup logic changed** — this phase only touched display, plus the new turf fields the design needed that didn't exist before.

### New turf fields

The screenshot's Verified badge, max persons, number of turfs, and amenities list weren't representable by the existing schema, so `supabase/migrations/20261016000001_turf_display_fields.sql` adds, all admin-configurable from `/admin/turfs`:

- `is_verified boolean` (default `false`) — the customer page's "Verified" badge is shown **only** when this is true for the active turf; there is no way to fake it from the client.
- `max_persons integer` (nullable) — the "Max persons" stat card is omitted entirely (not shown as `0` or `—`) when this isn't set.
- `turf_count integer` (default `1`) — "number of available turfs," shown as the "Turfs" stat.
- `amenities text[]` (default `{}`) — a fixed, known set (`parking`, `restroom`, `sports_kits`, `dressing_room`, `drinking_water`, `wifi`; enforced by a check constraint, kept in sync with `AMENITY_OPTIONS` in `src/config/turf.ts`). The customer page renders only the amenities a turf has actually selected, each with its own icon — never the full list, never a fabricated one.
- `cover_image_url text` (nullable) — a hero photo, uploaded the same way the Phase 6 QR code is: `POST /api/admin/turfs/[id]/cover` (mirrors `.../qr/route.ts` exactly — same auth gating, same upsert-by-fixed-path replace semantics, same two-step upload-then-link pattern), into a new public Storage bucket `turf-cover-images` (5MB cap, vs. the QR upload's 2MB, since this is a full photo not an icon). If no cover image is uploaded, the hero section shows a plain turf-green gradient instead of a broken `<img>`.

`sport_type` (already existing, free text) is displayed as-is, split on commas and joined with " · " for the stats card — no schema change needed there.

### Opening hours edge case

`getOperatingHoursLabel()` (`src/lib/time.ts`) computes the "Hours" figure shown under Opening Hours. An equal opening/closing time (e.g. `06:00`–`06:00`, as in the reference screenshot) means the turf never closes — a full 24-hour day — and is reported as `"24 hours"`, not naively subtracted to `"0 hours"`. This is the one place that special case needed explicit handling.

### Bottom navigation and page structure

Three customer-facing routes — `/`, `/my-bookings`, `/profile` — now share a fixed bottom nav (Home / Bookings / Profile, `src/components/customer/BottomNav.tsx`), wired up via a Next.js route group: `src/app/(customer)/layout.tsx` wraps all three pages (the parenthesized folder name doesn't appear in the URL, so every route keeps its exact existing path — `/`, `/my-bookings` — this was a file move, not a route change). Admin routes have their own separate layout and never render this nav.

- **Home** → `/`. **Bookings** → `/my-bookings` (the existing lookup page — no new page needed). Originally a third **Profile** tab pointed at `/profile`; Phase 9 removed it from the nav (see below) while leaving the route itself in place.
- The nav is `position: fixed`, bounded to the app's existing `max-w-2xl` centered column (not full-bleed on wide screens), and accounts for `env(safe-area-inset-bottom)` so it isn't flush against a device's home-indicator area. Every page's content gets matching bottom padding (set once, in the shared layout) so nothing renders underneath it.
- The old top-of-page "View My Bookings" link (Phases 5–7) was removed from the home page — the bottom nav's Bookings tab is the same destination, and keeping both was redundant.

### Sticky "Book Now" bar

`BookNowBar`/`BookNowInline` (`src/components/home/BookNowBar.tsx`) sit on the home page only. On mobile, a fixed bar sits directly above the bottom nav (offset by the nav's exact height *plus* its safe-area inset, so it never overlaps on a notched device); on `sm:` and wider, that fixed bar is hidden in favor of an ordinary inline button in the page flow, since a full-width fixed bar stops making sense once the content column isn't the whole viewport. (Phase 8 originally had these scroll to an inline booking flow on the same page; Phase 9 moved that flow to its own page and changed these to navigate there instead — see below.)

### What didn't change

The booking API, availability logic, pricing, payment flow, admin bookings/pricing/blocks management, the WhatsApp reminder, the call icon's behavior, and the phone-only lookup from Phase 7 are all untouched — this phase only added new turf fields, their admin form controls, and new customer-facing display components around the existing inline booking flow.

## Book Slot page and shared header (Phase 9)

Phase 8 had put the booking flow (date → time → duration → summary) inline on the home page itself, with "Book Now" scrolling down to it. Phase 9 moves that same flow, unchanged, onto its own page, and "Book Now" now **navigates** there instead.

### The Book Slot page

`src/app/(customer)/book/[turfId]/page.tsx` is a new route carrying the turf's id in the URL (`/book/<uuid>`). Home's "Book Now" (`BookNowBar`/`BookNowInline`) links to `/book/${turf.id}` using the id of the turf Home already loaded, so the selected turf is never lost in the navigation — the Book Slot page then independently loads that *exact* turf by id (not "whichever turf is first active," which is what Home's own query does), so it always shows the correct one even if that ever diverges from Home's pick. An invalid or inactive turf id shows a "not available" state with a link back home, rather than a broken or blank page.

The page itself is the same `TurfInfoCard` header, a `Book Your Slot` heading, then the exact same `StepIndicator` → `DateSelector` → `TimeSlotPicker` → `DurationPicker` → `BookingSummary` component sequence Phase 8's home page used to render inline — moved, not rewritten, so booking/availability/pricing/payment logic is byte-for-byte unchanged. There is no second "Book Now" bar on this page (that action's job — getting here — is already done); the shared customer layout's existing bottom padding (sized for the bottom nav alone) is already enough to keep `BookingSummary`'s submit button clear of it, since nothing else fixed is added on this page.

### Shared header, not a duplicated one

Both Home and the Book Slot page render the literal same `TurfInfoCard` component with the same props (name, location, verified flag, cover image, contact phone) — not two components that happen to look similar. Both also source those props from one shared helper, `src/lib/turf-query.ts` (`TURF_VIEW_SELECT_COLUMNS`, `TurfViewRow`, `mapTurfRow`), so the exact same column list and field-mapping logic runs on both pages; neither page hardcodes the turf's name, location, or phone number separately, and a field added to one automatically works on the other. The two pages differ only in *which* turf they ask for: Home asks for "the first active turf," the Book Slot page asks for "the turf with this id" — everything after that (loading/error/empty states, the header itself) is identical by construction, not by convention.

### Bottom nav: Profile removed

The Profile tab is gone from `src/components/customer/BottomNav.tsx` — only Home and Bookings remain, each still `flex-1` so the two now split the row evenly rather than leaving a gap. **The `/profile` route itself was not deleted** (`src/app/(customer)/profile/page.tsx` still exists and still works if visited directly) — only its entry in the nav's link list was removed, per the explicit instruction not to delete unrelated routes. Nothing about admin authentication was touched by this change.

## Customer Master (Phase 10)

A centralized `customers` table: exactly one record per normalized 10-digit mobile number, which is now the source of truth for a customer's name across the booking form, booking lookup, and admin booking details. `bookings.customer_name`/`customer_phone` are **preserved unchanged** — every existing feature that reads them directly keeps working — with a new `customer_id` column added alongside them, not replacing them.

### Schema

```sql
customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null,              -- unique index, not the primary key
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_phone_format check (phone ~ '^[6-9][0-9]{9}$'),
  constraint customers_name_not_blank check (btrim(name) <> '')
)
```

`idx_customers_phone_unique` is a unique index on `phone` — the database itself rejects a second row for the same number, which is what the booking API's concurrent-insert handling (below) actually relies on, not just application-level checking. `bookings.customer_id` (nullable, `on delete set null`) links each booking to its customer; `idx_bookings_customer_id` indexes it for the admin Customers tab's per-customer booking-history and booking-count queries.

**RLS:** same posture as `bookings` — no anon/authenticated SELECT or INSERT policy at all (this table holds PII: name and phone). The booking API and the backfill migration both write through the service-role key, which bypasses RLS. Only authenticated admins can read or update `customers`, gated by `is_admin()` — there is no unrestricted public query of the customer list.

### Booking form: lookup, lock, and resolve

The booking form (`BookingSummary.tsx`, on the Book Slot page) now asks for the mobile number **before** the name. Once the phone field holds a complete, valid 10-digit number, it debounces (350ms) a call to `POST /api/customers/lookup` — a lightweight, rate-limited, public endpoint that takes a phone number and returns `{ name: string | null }`, nothing else (no customer id, no booking data). If a saved name comes back, the name field is pre-filled and made read-only (with a small lock icon and "This is the saved name for this mobile number" hint); for an unrecognized number, the name field stays open and the customer fills it in themselves. The submit button is disabled while a lookup is in flight, to avoid a customer submitting before the form knows whether this number already has a saved name.

**None of this is the real security boundary, though.** `POST /api/bookings` does its own, independent customer resolution server-side and never trusts whatever `customerName` the browser sends for a phone number that already has a `customers` row:

1. Normalize the submitted phone (same `validateCustomerPhone`/`normalizeIndianMobileNumber` used everywhere else in the app).
2. `SELECT` `customers` by that exact phone.
3. **Found** → use that row's `id` and `name` as the canonical values for this booking, full stop. The submitted `customerName` is never read in this branch — a customer can't overwrite their own saved name just by entering the same phone number again (see [Admin Customers tab](#admin-customers-tab) for the only way a saved name changes).
4. **Not found** → validate the submitted name (`validateCustomerName`, the same 2–100-character/letters-only check the booking form has always used) and `INSERT` a new `customers` row.
5. If that `INSERT` fails with Postgres `23505` (the unique index on `phone`) — a genuinely concurrent second request for the same brand-new number having just won the race — re-`SELECT` and use *that* row instead of erroring or creating a duplicate. This is tested directly (`tests/api/bookings.test.ts`, "handles a concurrent duplicate-phone insert race safely") by simulating the 23505 and confirming exactly one `customers` row ends up existing and the booking links to it.

Every new booking's `customer_name` and `customer_phone` columns are then set from these **canonical** resolved values, not the raw request body — so for new bookings going forward, the two legacy columns and the Customer Master are always in agreement by construction. The booking API's JSON response never includes the customer's internal `id` (`body.customerId` is `toBeUndefined()` in tests) — nothing customer-facing needs it, consistent with the project's existing "don't expose internal uuids unnecessarily" posture (Phase 7).

The WhatsApp reminder button uses the **server's** echoed-back canonical name (`body.customerName`, stored in the confirmation screen's state) rather than the raw form field, so even in the edge case of a customer submitting while a lookup is still mid-flight, the message always reflects whichever name the server actually used for that booking.

### Admin booking details: canonical name, not just the historical one

`GET /api/admin/bookings` now embeds each booking's linked `customers(name, phone)` and prefers those values over the booking's own stored `customer_name`/`customer_phone` when a link exists (`withCanonicalCustomer` in the route) — falling back to the booking's own stored values only for a row with no `customer_id` (an unlinked historical row; see the backfill migration below for which ones those are). This means an admin name correction (see below) is reflected immediately in `/admin/bookings`, without rewriting any historical row. The route also gained an optional `customerId` filter, used by the Customers tab's "view booking history" action.

`GET /api/bookings/lookup` (the customer-facing "View My Bookings," phone-number-only since Phase 7) needed **no changes** — it already matches on `customer_phone`, and new bookings already store the normalized, canonical phone there, so a 10-digit number continues to retrieve every matching booking exactly as before.

### Admin Customers tab

A new **Customers** item in the admin sidebar (`/admin/customers`, `CustomersTable.tsx`), gated by the same `checkAdminAuth()` every other admin route uses. Shows a searchable (name or mobile number), paginated table: name, mobile number, number of bookings, most recent booking date (or `—` if none), and customer-since date. "Bookings" and "most recent date" are computed in the route (`GET /api/admin/customers`) by a second query against `bookings` filtered to just that page's customer ids, grouped in application code — not a SQL view — specifically so the route stays exercisable by the same fake-Supabase-client test pattern every other admin route uses (the fake client doesn't simulate `GROUP BY`).

- **Edit a name (and, if needed, phone):** inline edit row, `PATCH /api/admin/customers/[id]`, server-validated the same way the booking form is (`validateCustomerName`/`validateCustomerPhone`). Saving shows a inline "Saved" confirmation; a validation failure shows the server's error message without losing the in-progress edit.
- **Changing the phone number to one another customer already has** is rejected with a clear `409` (`"That phone number already belongs to another customer."`) rather than a generic `500` or a silently-accepted duplicate — the route catches the unique index's `23505` specifically. (`tests/helpers/fake-supabase.ts` gained an `onUpdate` hook, parallel to the existing `onInsert`, so this is tested the same honest way the booking-insert race is: by simulating the real constraint violation, not just asserting the route "should" handle it.)
- **View booking history:** expands inline per customer, calling `GET /api/admin/bookings?customerId=<id>` (the same route every other booking list goes through — no separate, parallel query path to keep in sync).
- Editing a name never touches any historical booking row — only the `customers` record changes; `GET /api/admin/bookings` (above) is what makes that edit visible everywhere else.
- No bulk messaging, WhatsApp greeting, or promotional feature is implemented here — out of scope for this phase, per the brief. The customer list is, however, already a flat `{ id, phone, name }` structure that a future consent-aware messaging feature could build on without a schema change.

### Migrating existing bookings: the backfill script

`supabase/migrations/20261017000002_backfill_customers_from_bookings.sql` is a one-time, **non-destructive and rerun-safe** script: it only ever inserts brand-new `customers` rows and sets a previously-`null` `bookings.customer_id` — it never overwrites or deletes an existing column value on any `bookings` row, so there is nothing to back up beforehand. For each distinct, validly-formatted phone number across existing bookings, it picks the **most frequently occurring non-blank `customer_name`** recorded for that number as the canonical name (ties broken alphabetically, for a fully deterministic result), creates one `customers` row, and links every booking with that phone to it. `insert ... on conflict (phone) do nothing` and an `update ... where customer_id is null` guard make a second run of the script a no-op for anything already processed — by this script, or by a live booking made through the API since.

It never invents a phone number or a name. Two situations are left unlinked and reported via `RAISE NOTICE` (visible in the SQL Editor's output when you run it) rather than silently guessed:

- A booking whose `customer_phone` doesn't normalize to a valid 10-digit Indian mobile number.
- A phone number where every booking under it has a blank `customer_name` (so there's no name to use at all).

**This migration has not been run against the live project** (consistent with every migration in this repo — they're written for you to run via the SQL Editor, never executed against your live database by the assistant). The live project currently has 25 existing `bookings` rows (confirmed via a read-only check) that this script would process; run it and read its `RAISE NOTICE` output for the actual count of customers created, bookings linked, and anything flagged for manual review in your specific data.

## Assumptions and limitations

- Turf hours are assumed to fit within a single calendar day (`opening_time < closing_time`); turfs open past midnight (e.g. 22:00–02:00) aren't supported by the current schema.
- Times are assumed to be specified to whole-minute precision (no seconds); the `bookings_duration_matches_range` check compares `duration_minutes` against the exact span between `start_time` and `end_time`.
- No explicit timezone handling anywhere: "is this in the past" is computed by comparing plain `Date` objects, which uses whichever timezone the Node process itself runs in. This works as long as the deployment's server timezone matches the turf's local timezone; it will misbehave otherwise (e.g. a UTC server with an IST turf). A future phase should store an explicit timezone per turf and use it consistently instead of the server's local clock.
- The app assumes a single active turf (the UI fetches "the first active turf" with no turf-picker) even though the schema supports many. Multi-turf support would mostly be a UI change — the API already takes `turfId` as a parameter.
- `turfs.sport_type` is one text field, not a list — the seed data combines multiple sports into one comma-separated string (`"Football (5-a-side), Cricket Box, Pickleball"`) because the schema has no sport-type-per-turf many-to-many table yet.
- A new booking is always created with `status: 'pending'`; nothing automatically transitions it to `'confirmed'`. That transition is now an admin action (`/admin/bookings`, Phase 4) — see [Booking status transitions](#booking-status-transitions).
- No real payment gateway of any kind. Cash and UPI are both "intent to pay" flows that an admin verifies manually; nothing in the UI or the admin dashboard's revenue figures claims a payment gateway, webhook, or automatic verification exists.
- No real phone OTP verification — no SMS/OTP provider is configured, and the app doesn't pretend one is. `/my-bookings` requires only the customer's phone number (see [Booking lookup: phone number only](#booking-lookup-phone-number-only-phase-7)), a deliberate business decision. **Anyone who knows a customer's phone number can see that customer's full booking history** — read that section for the full trade-off and mitigations.
- No audit trail of who confirmed/cancelled a booking or edited pricing/turf config — `bookings`/`turf_pricing`/`turfs` don't record which admin made a change, only `updated_at`/`created_at` timestamps. (Payment status changes *are* audited, in `payment_events` — see [Admin payment verification](#admin-payment-verification).) Worth extending the same pattern to booking-status and config changes before multiple admins share a project.
- There's no rate limiting on `/admin/login` beyond whatever Supabase Auth applies by default — a determined attacker could still attempt many password guesses against it. Low risk for a single-admin internal tool, but worth hardening before exposing this to a larger team.
- Admin search (`/admin/bookings`) matches an exact full uuid or a partial customer name/phone — there's no 5-digit reference anymore (removed in Phase 7) and no prefix/partial match on the uuid. It matches against the **booking's own stored** `customer_name`/`customer_phone`, not the Customer Master's canonical values (the *displayed* name/phone, by contrast, does prefer canonical — see [Customer Master](#customer-master-phase-10)). For new bookings these are identical by construction, so this only matters for a historical booking whose name was later corrected via `/admin/customers`: search by the old spelling still finds it, search by the corrected spelling won't, until that row is re-saved. A worthwhile follow-up if this becomes a real pain point.
- `POST /api/customers/lookup` (used by the booking form to pre-fill a returning customer's name) is public and rate-limited the same way `/api/bookings/lookup` is, for the same reason: a phone number alone is enough to get a result back. The result here is strictly less sensitive than a full booking history (just a name, if one exists) but is still real personal data — documented rather than left unprotected because it "seems smaller."
- Turf/pricing/block management use one page per resource with an inline add/edit form, not separate `/new` and `/[id]/edit` routes — a deliberate simplification; ask if you'd prefer the latter.
- The QR image upload is a straightforward two-step operation (upload to Storage, then save the URL): if the DB update after a successful Storage upload somehow fails, the file sits in Storage unlinked until the admin retries the upload (which `upsert`s the same path again) — not auto-cleaned up, but also not harmful (it just isn't referenced by anything until relinked).
- The call icon's "sensible fallback" when no `contact_phone` is configured is to simply not render the icon, rather than showing a disabled button or falling back to a different number — a deliberate choice, documented here in case a different fallback is wanted.
- The rate limiter (customer booking API and lookup API) is in-memory and single-instance only; see [Rate limiting](#rate-limiting) above.
- The migrations were written and reviewed manually, never executed against the live project by the assistant — every one of them is meant to be run by you via the SQL Editor (see [step 4](#4-run-the-database-migrations) and [Remaining manual steps](#remaining-manual-steps)). Repeated read-only checks against the live project (service-role key) across phases confirmed the project's actual current state: all migrations through Phase 6's turf-fields migration are live (`turfs.upi_vpa`/`whatsapp_number`/`contact_phone` exist, the `turf-qr-codes` Storage bucket exists, an administrator is bootstrapped, `bookings.short_reference` is correctly absent per Phase 7). **Not yet applied:** the Phase 8 turf-display-fields migration (`turfs.is_verified`/`max_persons`/`turf_count`/`amenities`/`cover_image_url`, and the `turf-cover-images` bucket) and both Phase 10 Customer Master migrations (`public.customers` doesn't exist yet; `bookings.customer_id` doesn't exist yet). The live project currently has 25 `bookings` rows that the Phase 10 backfill migration would process once run. Until the Phase 8 migration is applied, the home page degrades gracefully to "Could not load turf details" (a clean PostgREST `42703` for the missing columns) rather than crashing — the same pattern documented in every earlier phase for an unapplied migration.

## Testing

```bash
npm test
```

runs the default suite (244 tests, 1 skipped): pure unit tests (`tests/time.test.ts`, `tests/pricing.test.ts`, `tests/slot-availability.test.ts`, `tests/validation.test.ts`, `tests/booking-status.test.ts`, `tests/dashboard-summary.test.ts`, `tests/admin-auth.test.ts`, `tests/upi.test.ts`, `tests/booking-lookup.test.ts`, `tests/whatsapp.test.ts` — no mocks, no network) and API route tests (`tests/api/*.test.ts`) that call the exported `handle*Request` functions directly with a small in-memory fake Supabase client (`tests/helpers/fake-supabase.ts`, now including a minimal Storage mock for the QR-upload route) instead of a real database. The fake simulates the real constraints the routes depend on (the booking overlap exclusion → `23P01`, the idempotency unique index → `23505`, the Phase 4 pricing overlap exclusion → `23P01`, the Phase 10 unique index on `customers.phone` → `23505` on both insert and update, and the `create_turf_block()` RPC's overlap check) so each route's *error-handling* is tested, without that being a substitute for the database actually enforcing them. `tests/helpers/admin-deps.ts` builds the three auth scenarios (admin / signed-in non-admin / unauthenticated) every admin route test exercises. The fake also returns a fresh clone of each row on every `.select()` (not a live reference into its in-memory table), matching what a real HTTP/JSON round trip does — an earlier version of the fake shared references and produced one misleading test failure before this was fixed.

These mocked/pure tests cover: 5:00 PM + 2.5h = 7:30 PM, a booking ending exactly at closing time (accepted) vs. extending past it (rejected), past-date/past-time rejection, overlapping requests getting a `409`, adjacent bookings being allowed, a cancelled booking not blocking its old slot, a blocked period being rejected, a client-submitted price/status being ignored, invalid durations/phone/name being rejected, an identical retry (same `Idempotency-Key`) not creating a duplicate, rate limiting kicking in after repeated requests, unauthenticated/non-admin rejection on every single admin route, invalid prices/time-ranges/day-of-week being rejected, overlapping pricing rules getting a `409` (adjacent ones allowed), a deactivated turf rejecting new bookings while its historical bookings stay untouched, every booking status transition (valid and invalid, including cancelled being terminal), a block that would overlap an active booking being rejected (while a cancelled booking never blocks one), and admin booking data never leaking through a 401/403 response body.

**Phase 5 additions:** valid and invalid Indian mobile numbers (letters, wrong length, country-code/formatting variants); `paymentMethod` being required and validated, the correct initial `payment_status` per method, and a client-submitted `paymentStatus` being ignored; and the admin payment route (auth gating, invalid/no-op status rejected, cash→paid, upi→paid, upi→failed, the audit row recorded with correct `previous_status`, and that it never touches the booking's approval `status`).

**Phase 6 additions:** `restrictToDigits` truncating at the limit and stripping non-digits (the "11th digit never appears" requirement, tested at the pure-function level — the actual `<input>` behavior needs the manual browser check below, since jsdom/a browser-driven test isn't part of this suite); `isPhoneLike`; the UPI URI and WhatsApp message/URL builders byte-for-byte; per-turf UPI availability (a turf with no `upi_vpa`/`payee_name` can't accept a `upi` booking, one with both can); the admin turf payment-field validation (VPA format, required WhatsApp number defaulting correctly, never overwriting an untouched field, explicit clearing via an empty string); and the QR-upload route (auth gating, rejecting the wrong file type/an oversized file/an empty file/a missing turf, and a successful PNG/JPEG/WEBP upload saving the resulting URL).

**Phase 7 additions (booking lookup reversal):** `POST /api/bookings/lookup` now tested with phone-only requests — malformed/wrong-length/letter-containing phone numbers rejected, a valid phone with no bookings returning an empty list (not a 404), a reference/OTP field in the request body being silently ignored rather than required, every booking for a matching phone returned sorted upcoming-first, another customer's booking never appearing, and the response never containing `customer_phone`, the internal uuid, or any `reference` field; the UPI panel's `note` field (replacing the removed `reference`) present only for a pending-verification upi booking; and rate limiting still kicking in under repeated requests from one client. `isValidShortReference` and the booking API's short-reference retry/collision tests were deleted along with the feature they tested. The WhatsApp message template test was updated to the reference-free template.

**Phase 8 additions (home page redesign):** `getOperatingHoursLabel` (a normal span, a fractional span, and the equal-opening/closing "24 hours, not 0" edge case from the reference screenshot); the admin turf display-field validation (`isVerified`/`turfCount` defaulting correctly when omitted, `maxPersons` and `amenities` accepted/rejected, an unknown amenity value rejected, edits to one display field never touching an untouched one, replacing the amenities list entirely); and the cover-image upload route (`tests/api/admin-turf-cover.test.ts`, mirroring the QR-upload route's own tests: auth gating, wrong file type/oversized/empty file/missing turf rejected, a successful PNG/JPEG/WEBP upload saving the resulting URL into `turf-cover-images`).

**Phase 10 additions (Customer Master):** `POST /api/customers/lookup` (malformed phone rejected, a known number's saved name returned, an unknown number returning `{ name: null }` rather than an error, the response never containing anything but `name`, rate limiting); `POST /api/bookings`'s customer resolution (`tests/api/bookings.test.ts`, "Customer Master" block) — a brand-new phone creates exactly one `customers` row and links the booking, an invalid name on a brand-new phone is rejected, an **existing** customer's saved name is used even when the browser submits a different one, a booking still succeeds with no `customerName` in the request at all when the phone is already known, and — the one that actually exercises the race-handling code path, not just a pre-seeded lookup — a simulated concurrent insert collision (23505) on `customers.phone` resolves to the other request's canonical record rather than erroring or duplicating; `GET /api/admin/customers` (auth gating, search by name, search by phone, booking count and most-recent-date computed correctly including a customer with zero bookings) and `PATCH /api/admin/customers/[id]` (auth gating, name edit, invalid name rejected, 404 for a missing customer, phone edit, and — via a new `onUpdate` hook added to the fake Supabase client specifically so this is tested honestly rather than asserted — a phone-number conflict with another customer rejected with `409` and the row left unchanged); and `GET /api/admin/bookings`'s canonical-customer overlay (the `customers` embed's name/phone preferred over the booking's own stored values when linked, falling back when not linked, the raw embed object itself never leaking into the response, and the new `customerId` filter).

**What's genuinely database-backed vs. mocked:**

- `supabase/tests/booking_overlap_tests.sql` (Phase 2) is the one script that exercises the *real* Postgres exclusion constraint, directly, with no mocking. Run it in the SQL Editor — see [Validating the schema](#validating-the-schema) above.
- `tests/integration/live-booking-overlap.test.ts` is a Vitest test that also hits a real Supabase project (the same overlap/adjacency/cancellation scenarios, via the actual `@supabase/supabase-js` client), but it's **skipped by default** — it only runs with explicit opt-in, since it writes and then deletes real rows:
  ```bash
  RUN_SUPABASE_INTEGRATION_TESTS=1 npm test -- tests/integration
  ```
  This has **not** been run in this environment (it requires the idempotency-key migration, which is applied; running it still writes to your real project, however briefly). Everything else under `tests/` has been run, and passes.

## Remaining manual steps

1. Run the remaining migrations against the live project, **in order**: `supabase/migrations/20261016000001_turf_display_fields.sql`, then `supabase/migrations/20261017000001_create_customers.sql`, then `supabase/migrations/20261017000002_backfill_customers_from_bookings.sql` (everything before them is already applied live, confirmed via read-only schema checks: Phases 2–6's turf/payment fields exist, `bookings.short_reference` is correctly absent per Phase 7). **Skip** `20261014000002_short_booking_reference.sql` — it was superseded before ever being applied; see the notice at its top. **Read the backfill script's `RAISE NOTICE` output** after running it — it reports how many customers were created, how many bookings were linked, and (if any) which phone numbers need manual review.
2. On `/admin/turfs`, edit your turf and fill in its UPI ID, payee name, and (optionally) UPI phone/contact number/WhatsApp number, then upload a QR image, to actually exercise the Phase 6 UPI/QR/call-icon flows. While you're there, set the new Phase 8 fields too: tick "Verified" if applicable, set max persons and number of turfs, check off the amenities this turf actually has, and upload a cover image.
3. Run `supabase/tests/booking_overlap_tests.sql` in the SQL Editor and confirm every line says `PASS`.
4. Optionally run the opt-in live integration test (`RUN_SUPABASE_INTEGRATION_TESTS=1 npm test -- tests/integration`).
5. On `/admin/customers`, review the backfilled list against what you'd expect from your real historical bookings — spot-check a few customers with multiple past bookings under slightly different spellings of their name, and confirm the canonical name chosen looks right (the most frequent non-blank spelling). Correct any that don't via the Edit action.
6. `npm run dev` and walk through the customer, lookup, and admin flows end to end in the browser (see manual test steps below). Note: until step 1's migrations are applied, the home page will show "Could not load turf details" (the live `turfs` table is missing columns the home page's query now selects) — this is the same graceful-degradation behavior documented in earlier phases for an unapplied migration, not a bug.

### Manual browser test steps

**Admin turf setup (do this first, once):**
1. Sign in at `/admin/login`, go to `/admin/turfs`, click Edit on your turf.
2. Enter a UPI ID (VPA), payee name, and optionally a UPI phone number; set/confirm the WhatsApp number (defaults to `9344689836` for a brand-new turf); set a public contact number. Save.
3. Upload a QR image (PNG/JPEG/WEBP, ≤2MB) and confirm it shows a preview, an uploading state, then a success message; reload the page and confirm the uploaded image still shows as "current".
4. Try uploading a `.txt` file and confirm it's rejected client-side with a clear message before any network request.
5. Under "Home page display details," tick "Verified," set max persons and number of turfs, check a few amenities, and upload a cover image (same PNG/JPEG/WEBP restriction, ≤5MB). Save, reload, and confirm every value — including the cover image — still shows as current.

**Customer flow:**
1. `npm run dev`, open `http://localhost:3000`. Confirm the hero section shows your uploaded cover image (or a plain green gradient if you skipped that step — never a broken image icon), the turf name, a "Verified" badge (since you just enabled it), the call icon (tapping it opens your device's dialer with the contact number you set), and the location below. Confirm the Sport/Max persons/Turfs stat cards, the Opening Hours card (and that an opening time equal to closing time reads "24 hours," not "0 hours"), and an Amenities card listing only the amenities you actually checked.
2. Confirm the bottom nav shows only **Home** and **Bookings** (no Profile tab), evenly split, fixed at the bottom of the screen, with Home highlighted as active; tapping Bookings navigates to `/my-bookings` and highlights that tab instead. Confirm page content is never hidden behind the nav while scrolling. Confirm visiting `/profile` directly still works even though it's no longer linked from the nav.
3. On mobile width, confirm a sticky "Book Now" bar sits directly above the bottom nav (not overlapping it) and tapping it navigates to `/book/<turf id>` — the Book Slot page. On a desktop-width browser window, confirm the fixed bar is gone and an inline "Book Now" button in the page flow does the same navigation.
4. On the Book Slot page, confirm the shared header shows the **exact same** turf name, Verified badge, location, and call icon as Home (same component, same data), followed by a "Book Your Slot" heading, then the date/time/duration flow.
5. Pick a date, a start time, and a duration (note the live price shown on each duration button). In the mobile number field (now the **first** field, before name), try typing 11+ digits in a row and confirm the 11th digit never appears; try typing/pasting letters and confirm they never appear either.
6. Enter a 10-digit number you have **not** booked with before. Confirm the name field stays editable, with a hint that no saved name was found; fill in a name and choose **Cash at turf**, then submit.
7. Confirm the confirmation panel shows turf name, date/time/duration, booking status ("Awaiting approval"), payment method ("Cash at turf"), payment status ("Unpaid (pay at the turf)"), and a total matching the duration step's preview — plus "Notify Turf on WhatsApp", "Book another slot", and "View My Bookings" buttons. Confirm there is **no** reference/code shown anywhere on this screen.
8. Click "Notify Turf on WhatsApp" and confirm it opens WhatsApp (web or app) addressed to the WhatsApp number you set, with a prefilled message using the name you just entered — and confirm it does **not** send anything by itself; you still have to press Send.
9. Click "Book another slot," pick a new date/time/duration, and enter the **same** 10-digit number from step 6. Confirm a brief loading spinner appears in the phone field, then the name field auto-fills with the name you entered before **and becomes read-only** (with a lock icon and "This is the saved name for this mobile number" hint). Try clicking into it — confirm you cannot edit it. Submit the booking and confirm the confirmation screen shows that same saved name.
10. Reload the availability for a booked date/time — the slot should now show as unavailable.
11. Try submitting the same booking twice in a row without reloading (simulating a double-click) and confirm it does not create two rows in `bookings`.

**UPI flow:**
1. Make a new booking choosing **UPI** as the payment method (only selectable because you configured UPI in the turf-setup step above).
2. Confirm the confirmation panel shows a UPI panel: your uploaded QR image, the configured VPA/payee name, the correct amount, a descriptive payment note (turf + date/time, not a reference code), a generated QR code, and a "Pay with UPI" link — and that payment status reads "Payment pending verification", not "Paid".
3. On a phone, tapping "Pay with UPI" should attempt to open your UPI app chooser; confirm it shows the right payee/amount. On desktop (or if no UPI app opens), confirm the QR code and the VPA text are both usable as a fallback.
4. Confirm nothing on the page ever claims the payment succeeded, before or after tapping the link.

**Booking lookup flow:**
1. From the home page, click "View My Bookings" (or use the link from a confirmation screen, which carries `?phone=` and should auto-fill and auto-run the search). Confirm there is only a mobile-number field — no reference, OTP, or any other field.
2. Try entering 11+ digits in a row and confirm the 11th digit never appears, same as the booking form.
3. Search with an unrelated/made-up phone number that has no bookings — confirm you get exactly: "No bookings found for this mobile number. Please check the number and try again."
4. Search with the phone number from a booking you just made — confirm it returns all of that phone's bookings, upcoming ones first, each showing turf, date/time, duration, status, payment method, payment status, and total, with no reference code anywhere.
5. If one of them is the UPI booking from above, confirm its UPI panel reappears here too (so the customer can still complete payment after leaving and coming back). Click "Refresh" and confirm it re-fetches without errors.

**Admin flow:**
1. Open `http://localhost:3000/admin` signed out — confirm it redirects to `/admin/login`.
2. Sign in with the administrator account you created. Confirm you land on the dashboard and see today's summary cards and the recent bookings table, including a Payment column (no Ref column — removed in Phase 7).
3. On `/admin/turfs`, edit the turf's hours and confirm the change is rejected if you set closing time earlier than opening time; then deactivate it and confirm a new customer booking attempt against it now fails.
4. On `/admin/pricing`, try adding a rule that overlaps an existing one for the same turf and day and confirm it's rejected with a clear message; add a non-overlapping one and confirm it appears.
5. On `/admin/bookings`, search by a test customer's name or phone number and confirm it finds exactly the right booking(s); search by a booking's internal uuid (visible in its expanded "Internal ID" row) and confirm that also finds exactly that one. Confirm a pending booking, then cancel a different one, and confirm the cancelled one's slot becomes bookable again on the customer page.
6. Still on `/admin/bookings`, find the cash booking from above and click "Mark cash paid" — confirm its payment status updates to "Paid" and that re-checking `/my-bookings` for that booking now shows "Paid" too. Find the UPI booking and try both "Verify paid" and "Mark failed" on different test bookings.
7. On `/admin/blocks`, try blocking a time range that overlaps an active booking and confirm it's rejected; block a genuinely free range and confirm it immediately shows as unavailable on the customer availability page; then remove the block and confirm the slot reopens.
8. On `/admin/customers`, confirm the two numbers you booked with above both appear, each with the correct booking count (2 for the one you booked twice, 1 for the other) and most-recent-booking date. Search by part of a name, then by part of a phone number, and confirm the list narrows correctly.
9. Click Edit on one customer, change the saved name, and Save. Confirm a success message appears and the table updates. Go make (or look up) a new booking with that same phone number and confirm the **new** name is what gets picked up — both in the booking form's auto-filled name and in `/admin/bookings`'s display of that customer's older bookings (their historical rows aren't rewritten, but the admin list now shows the updated canonical name for all of them).
10. Still on `/admin/customers`, try editing a customer's phone number to a number that already belongs to a different customer and confirm you get a clear "already belongs to another customer" error rather than a silent failure or a duplicate.
11. Expand "view booking history" on a customer with bookings and confirm it shows the right turf/date/time/status for each, matching what `/admin/bookings` shows for that same customer.
12. Confirm `/admin/customers` redirects to `/admin/login` when signed out, same as every other admin page.
13. Sign out from the sidebar and confirm `/admin` redirects to the login page again.
