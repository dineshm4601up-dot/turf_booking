# Turf Booking Platform

A mobile-first turf booking app. Next.js App Router + TypeScript + Tailwind CSS on the frontend, Supabase (PostgreSQL) on the backend.

## Phase status

- **Phase 1 (done):** Customer booking UI — date/time/duration selection, booking summary.
- **Phase 2 (done):** Supabase schema, migrations, and Row Level Security.
- **Phase 3 (done):** Live availability, the real booking API, and the UI wired to real data. The demo availability generator and fake "demo booking" flow from Phase 1 are gone — every booking shown is a real row in `bookings`.
- **Phase 4 (done):** Secure admin dashboard — Supabase Auth login, turf/pricing/booking/block management, all gated by real server-side authorization.
- **Phase 5 (done):** Strict Indian mobile validation, a secure "View My Bookings" lookup, cash/UPI payment method selection with admin-verified payment status.
- **Phase 6 (done):** Per-turf UPI config with admin-uploaded QR images, a 5-digit booking reference replacing the uuid everywhere customer-facing, a WhatsApp booking-reminder button, and a call icon on the customer header.
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
   - `20261014000002_short_booking_reference.sql` (Phase 6: the 5-digit `short_reference` column on `bookings`, its backfill, generator function, and unique constraint — see [Short booking reference](#the-5-digit-booking-reference) below)
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
- **Not yet applied:** both Phase 6 migrations — `turfs.upi_vpa`/`whatsapp_number`/`contact_phone` don't exist yet, `bookings.short_reference` doesn't exist yet, and no Storage buckets exist yet (confirmed via `storage.listBuckets()`).

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
| `bookings` | Customer bookings | `end_time > start_time`; `duration_minutes` must match the actual time span; `status` in `pending`/`confirmed`/`cancelled`; `short_reference` is a unique 5-digit string (see below); **no two active bookings for the same turf may have overlapping times** (see below) |
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
2. The response includes a `upi` object: `{ payeeVpa, payeeName, payeePhone, amount, reference, uri }`, where `amount` is the server-calculated total (never client-supplied) and `reference` is the booking's 5-digit short reference (see below) — not the uuid.
3. `UpiPaymentPanel.tsx` renders the configured payee name/VPA/phone, the amount and reference, **the admin-uploaded QR image if one exists** (shown above the generated QR code as the turf's actual payment QR, scannable directly), a QR code (`react-qr-code`, pure SVG, no external network call) encoding `uri`, and a "Pay with UPI" link using the same `uri`.
4. `uri` is a standard deep link built by `buildUpiPaymentUri` (`src/lib/upi.ts`): `upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<reference>`, with every parameter percent-encoded (spaces become `%20`, not `+`, for broader UPI-app compatibility). On a phone with a UPI app installed, tapping it opens that app's payment-method chooser with the amount and payee pre-filled; if no compatible app is installed, nothing happens (the link silently fails to resolve), which is exactly why the QR code stays visible alongside it as the fallback, and why the panel also shows the VPA as copyable text.
5. **Opening the UPI app, or returning to the page afterward, never changes `payment_status`.** It stays `pending_verification` until an admin independently verifies the payment (by checking their own UPI app/bank for a matching transaction, identified by the short reference in the transaction note) and marks it `paid` or `failed` from `/admin/bookings`. No payment gateway, webhook, or automatic confirmation of any kind is implemented — this app cannot know a UPI payment happened on its own, and nothing in the UI claims otherwise.

#### QR code image upload

`/admin/turfs` (edit mode only — a turf must be saved once before it has an id to attach a file to) has a file input for the QR image, posting to `POST /api/admin/turfs/[id]/qr` as `multipart/form-data`. The route validates the file is PNG/JPEG/WEBP and ≤2MB before ever touching Storage, uploads it to the `turf-qr-codes` Supabase Storage bucket (created by the Phase 6 migration, `public: true` — the QR is meant to be shown to customers, the same trust level as the VPA already shown to them) at a per-turf path (`<turfId>/qr.<ext>`) with `upsert: true` (replacing, not accumulating, on every re-upload), then saves the resulting public URL onto `turfs.qr_image_url`. The admin UI shows uploading/success/error states and the currently-saved image when editing. Only the service-role key ever writes to this bucket — no anon/authenticated Storage policy is added, so the absence of one is what keeps writes admin-only.

### Admin payment verification

`/admin/bookings` shows each booking's payment method and status alongside its approval status, and — depending on the current state — a "Mark cash paid", "Verify paid", or "Mark failed" button. These call `PATCH /api/admin/bookings/[id]/payment`, a route completely separate from the booking-approval `PATCH /api/admin/bookings/[id]`, gated by the same `checkAdminAuth()` every other admin route uses. Every change is recorded in `payment_events` (`booking_id`, `previous_status`, `new_status`, `changed_by`, `created_at`) and stamps `bookings.payment_updated_at` — an audit trail of who verified what, and when. Setting a status to the value it already has is rejected (`400`), and the update itself is guarded the same optimistic-concurrency way as booking-status changes (`.eq("payment_status", currentStatus)`), so two admins acting on the same booking at once can't silently overwrite each other.

## Short booking reference, WhatsApp reminder, and call icon (Phase 6)

### The 5-digit booking reference

Every booking now has a `short_reference`: a 5-digit string (`"10000"`–`"99999"`, stored as `text` so it's never treated as a number) that replaces the long uuid everywhere a customer or admin reads a reference — the confirmation screen, `/my-bookings`, the admin bookings list, and the WhatsApp message. The uuid `id` column is unchanged as the real primary/foreign key everywhere internally; the short reference is a display/lookup value layered on top, generated by the database itself:

- `generate_unique_short_reference()` (the Phase 6 migration) is the column's `DEFAULT`: it picks a random 5-digit candidate and retries (up to 200 times) until one isn't already taken, then returns it. This reduces collision likelihood but isn't the real safety net.
- A `UNIQUE` constraint (`bookings_short_reference_unique`) is the real safety net: under true concurrency, two simultaneous inserts can still both pick the same still-free-looking candidate before either commits. When that happens, the losing `INSERT` fails with Postgres `23505`, and `POST /api/bookings` catches specifically that constraint (by name, in the error message, distinguishing it from the idempotency-key constraint's own `23505`) and **retries the whole insert** (up to 5 times) rather than erroring — the column's `DEFAULT` picks a fresh candidate on every fresh attempt.
- If the generator function itself can't find a free value after 200 attempts (the ~90,000-value space nearly or fully exhausted), it raises `SHORT_REFERENCE_EXHAUSTED` and the API returns a clear `503` rather than ever assigning or guessing a duplicate.
- Existing bookings (from before this migration) were backfilled in one pass: a randomly-shuffled permutation of every possible 5-digit value was assigned 1:1 to existing rows by creation order, guaranteeing uniqueness without touching any other column on those rows.

### Booking lookup security — revised (Phase 6)

**This replaces the Phase 5 design and weakens it; the trade-off is deliberate and documented, not accidental.** Phase 5 used the booking's own uuid (122 bits of effectively unguessable entropy) as the "proof of ownership" credential for `/my-bookings`. Phase 6 requires replacing the uuid shown to customers with the 5-digit reference everywhere — including, necessarily, on the lookup form itself, since a customer who is never shown their uuid has no way to type it back in. `POST /api/bookings/lookup` therefore now requires **both** a phone number **and** the 5-digit `short_reference` (90,000 possible values, not 2^122).

Mitigations in place for this smaller search space:
- The rate limit on this endpoint was tightened specifically because of this change: **8 requests per 10 minutes per IP** (`src/lib/rate-limit.ts`), down from the Phase 5 limit of 10/minute — roughly a 75x reduction in sustainable request rate, making a brute-force sweep of the full space impractical for a single attacking IP.
- The exact phone number is still required too — an attacker needs to already know (or guess) a specific victim's number, not just try references against an arbitrary one.
- A right-phone-wrong-reference or right-reference-wrong-phone request gets the identical generic `404` as a request for a number with no bookings at all, so the response itself never reveals which half of the pair was correct.

**True OTP verification still isn't implemented**: no SMS/OTP provider is configured in this environment, and nothing in this app pretends one is — there's no "OTP sent" message anywhere, because none is sent. This 5-digit-reference design is the honest, documented fallback, not a disguised OTP flow. If this matters for your deployment (it should, before handling real customer data at scale), the two real fixes are: (a) configure a real SMS/OTP provider and gate `/my-bookings` behind it instead of this reference check, or (b) at minimum, consider a longer/less guessable reference for the *lookup credential* specifically while keeping the 5-digit code as the human-friendly *display* value admins and customers read aloud to each other — the two don't have to be the same value, this implementation just keeps them unified for simplicity per the brief's literal instruction to use the short reference "in... booking lookup."

The confirmation screen's "View My Bookings" link carries `?phone=&ref=` so a customer who just booked doesn't have to retype anything — this is a convenience, not a separate security mechanism; it pre-fills the same form with the same (phone, 5-digit reference) pair, which still goes through the same checks.

### WhatsApp booking reminder

After a successful booking, the confirmation screen shows a "Notify Turf on WhatsApp" button (`buildWhatsappClickToChatUrl` + `buildBookingWhatsAppMessage`, `src/lib/whatsapp.ts`) that opens `https://wa.me/<turf's WhatsApp number>?text=<prefilled message>` in a new tab. The destination number comes from `bookings` response's `turfWhatsappNumber` field, which the booking API reads from that specific turf's `whatsapp_number` column — **never hardcoded in frontend code**. New turfs default to `9344689836` (via the Phase 6 migration's column default, which also backfills existing turfs) but every turf can edit it from `/admin/turfs`; that default is a starting value, not a permanent destination. The message is built from the exact template in the spec (reference, turf name, customer name/phone, date, times, duration, amount, payment method, payment status, booking status), and clicking the link **only opens WhatsApp with that text prefilled — it never sends anything automatically**; the person still has to press Send themselves. The button only appears after a booking has actually been saved (it's part of the post-submit confirmation view, not the form).

### Call icon

The customer home page header (`TurfInfoCard.tsx`) shows a phone icon next to the turf name when that turf has a `contact_phone` configured (`/admin/turfs`, a field distinct from the UPI phone and the WhatsApp number — mixing these up was explicitly avoided). Tapping it uses a plain `tel:` link (`aria-label="Call turf"`) to open the device's dialer. If no contact number is configured for the active turf, the icon is simply not rendered at all — a deliberate "sensible fallback" choice (a visible-but-non-functional button seemed worse than no button), documented here in case a different fallback is preferred later.

## Assumptions and limitations

- Turf hours are assumed to fit within a single calendar day (`opening_time < closing_time`); turfs open past midnight (e.g. 22:00–02:00) aren't supported by the current schema.
- Times are assumed to be specified to whole-minute precision (no seconds); the `bookings_duration_matches_range` check compares `duration_minutes` against the exact span between `start_time` and `end_time`.
- No explicit timezone handling anywhere: "is this in the past" is computed by comparing plain `Date` objects, which uses whichever timezone the Node process itself runs in. This works as long as the deployment's server timezone matches the turf's local timezone; it will misbehave otherwise (e.g. a UTC server with an IST turf). A future phase should store an explicit timezone per turf and use it consistently instead of the server's local clock.
- The app assumes a single active turf (the UI fetches "the first active turf" with no turf-picker) even though the schema supports many. Multi-turf support would mostly be a UI change — the API already takes `turfId` as a parameter.
- `turfs.sport_type` is one text field, not a list — the seed data combines multiple sports into one comma-separated string (`"Football (5-a-side), Cricket Box, Pickleball"`) because the schema has no sport-type-per-turf many-to-many table yet.
- A new booking is always created with `status: 'pending'`; nothing automatically transitions it to `'confirmed'`. That transition is now an admin action (`/admin/bookings`, Phase 4) — see [Booking status transitions](#booking-status-transitions).
- No real payment gateway of any kind. Cash and UPI are both "intent to pay" flows that an admin verifies manually; nothing in the UI or the admin dashboard's revenue figures claims a payment gateway, webhook, or automatic verification exists.
- No real phone OTP verification — no SMS/OTP provider is configured, and the app doesn't pretend one is. `/my-bookings` requires phone + the 5-digit booking reference instead (see [Booking lookup security — revised](#booking-lookup-security--revised-phase-6)). **This is weaker than the Phase 5 design** (90,000 possible references vs. an effectively unguessable uuid) — read that section for the full trade-off and mitigations. A customer who loses every booking reference they were ever shown has no self-service way to recover access and must contact the turf directly.
- No audit trail of who confirmed/cancelled a booking or edited pricing/turf config — `bookings`/`turf_pricing`/`turfs` don't record which admin made a change, only `updated_at`/`created_at` timestamps. (Payment status changes *are* audited, in `payment_events` — see [Admin payment verification](#admin-payment-verification).) Worth extending the same pattern to booking-status and config changes before multiple admins share a project.
- There's no rate limiting on `/admin/login` beyond whatever Supabase Auth applies by default — a determined attacker could still attempt many password guesses against it. Low risk for a single-admin internal tool, but worth hardening before exposing this to a larger team.
- Admin "search by reference" (`/admin/bookings`) matches an exact 5-digit `short_reference`, an exact full uuid, or a partial customer name/phone — there's no prefix/partial match on either reference format.
- Turf/pricing/block management use one page per resource with an inline add/edit form, not separate `/new` and `/[id]/edit` routes — a deliberate simplification; ask if you'd prefer the latter.
- The QR image upload is a straightforward two-step operation (upload to Storage, then save the URL): if the DB update after a successful Storage upload somehow fails, the file sits in Storage unlinked until the admin retries the upload (which `upsert`s the same path again) — not auto-cleaned up, but also not harmful (it just isn't referenced by anything until relinked).
- The call icon's "sensible fallback" when no `contact_phone` is configured is to simply not render the icon, rather than showing a disabled button or falling back to a different number — a deliberate choice, documented here in case a different fallback is wanted.
- The rate limiter (customer booking API and lookup API) is in-memory and single-instance only; see [Rate limiting](#rate-limiting) above.
- The migrations were written and reviewed manually. Repeated read-only checks against the live project (service-role key) across phases confirmed: all Phase 2–5 migrations are live (`bookings.payment_method` exists, an administrator is bootstrapped, the seed turf has since been renamed via the admin dashboard). **Both Phase 6 migrations are not yet applied** (`turfs.upi_vpa`/`whatsapp_number`/`contact_phone` and `bookings.short_reference` don't exist yet on the live project, and no Storage bucket exists). Confirmed live and working: the home page still renders (degrading gracefully — a direct PostgREST query for the new turf columns returns a clean `42703` "column does not exist" error, which the existing error-handling in `page.tsx` turns into its normal "Could not load turf details" state rather than crashing) and `GET /api/availability` still works unaffected. Creating an actual booking, saving turf payment/contact fields, uploading a QR image, and generating a short reference were **not** attempted against the live project, since the schema checks already show they'd fail until both migrations are applied.

## Testing

```bash
npm test
```

runs the default suite (206 tests, 1 skipped): pure unit tests (`tests/time.test.ts`, `tests/pricing.test.ts`, `tests/slot-availability.test.ts`, `tests/validation.test.ts`, `tests/booking-status.test.ts`, `tests/dashboard-summary.test.ts`, `tests/admin-auth.test.ts`, `tests/upi.test.ts`, `tests/booking-lookup.test.ts`, `tests/whatsapp.test.ts` — no mocks, no network) and API route tests (`tests/api/*.test.ts`) that call the exported `handle*Request` functions directly with a small in-memory fake Supabase client (`tests/helpers/fake-supabase.ts`, now including a minimal Storage mock for the QR-upload route) instead of a real database. The fake simulates the real constraints the routes depend on (the booking overlap exclusion → `23P01`, the idempotency unique index → `23505`, the short-reference unique constraint → `23505`, the Phase 4 pricing overlap exclusion → `23P01`, and the `create_turf_block()` RPC's overlap check) so each route's *error-handling* is tested, without that being a substitute for the database actually enforcing them. `tests/helpers/admin-deps.ts` builds the three auth scenarios (admin / signed-in non-admin / unauthenticated) every admin route test exercises. The fake also returns a fresh clone of each row on every `.select()` (not a live reference into its in-memory table), matching what a real HTTP/JSON round trip does — an earlier version of the fake shared references and produced one misleading test failure before this was fixed.

These mocked/pure tests cover: 5:00 PM + 2.5h = 7:30 PM, a booking ending exactly at closing time (accepted) vs. extending past it (rejected), past-date/past-time rejection, overlapping requests getting a `409`, adjacent bookings being allowed, a cancelled booking not blocking its old slot, a blocked period being rejected, a client-submitted price/status being ignored, invalid durations/phone/name being rejected, an identical retry (same `Idempotency-Key`) not creating a duplicate, rate limiting kicking in after repeated requests, unauthenticated/non-admin rejection on every single admin route, invalid prices/time-ranges/day-of-week being rejected, overlapping pricing rules getting a `409` (adjacent ones allowed), a deactivated turf rejecting new bookings while its historical bookings stay untouched, every booking status transition (valid and invalid, including cancelled being terminal), a block that would overlap an active booking being rejected (while a cancelled booking never blocks one), and admin booking data never leaking through a 401/403 response body.

**Phase 5 additions:** valid and invalid Indian mobile numbers (letters, wrong length, country-code/formatting variants); `paymentMethod` being required and validated, the correct initial `payment_status` per method, and a client-submitted `paymentStatus` being ignored; and the admin payment route (auth gating, invalid/no-op status rejected, cash→paid, upi→paid, upi→failed, the audit row recorded with correct `previous_status`, and that it never touches the booking's approval `status`).

**Phase 6 additions:** `restrictToDigits` truncating at the limit and stripping non-digits (the "11th digit never appears" requirement, tested at the pure-function level — the actual `<input>` behavior needs the manual browser check below, since jsdom/a browser-driven test isn't part of this suite); `isValidShortReference`/`isPhoneLike`; the UPI URI and WhatsApp message/URL builders byte-for-byte (including the exact required WhatsApp template); `POST /api/bookings/lookup` now keyed on a 5-digit reference instead of a uuid, with distinct matching-pair/wrong-phone/wrong-reference/nonexistent-pair scenarios, confirming the response never contains `customer_phone` *or* the internal uuid; the booking API's short-reference retry loop (a forced single collision still succeeds, a forced run past the retry budget returns a clear `500` rather than ever duplicating a reference); per-turf UPI availability (a turf with no `upi_vpa`/`payee_name` can't accept a `upi` booking, one with both can, and the UPI panel's `reference`/`tn` is the short code); the admin turf payment-field validation (VPA format, required WhatsApp number defaulting correctly, never overwriting an untouched field, explicit clearing via an empty string); and the QR-upload route (auth gating, rejecting the wrong file type/an oversized file/an empty file/a missing turf, and a successful PNG/JPEG/WEBP upload saving the resulting URL).

**What's genuinely database-backed vs. mocked:**

- `supabase/tests/booking_overlap_tests.sql` (Phase 2) is the one script that exercises the *real* Postgres exclusion constraint, directly, with no mocking. Run it in the SQL Editor — see [Validating the schema](#validating-the-schema) above.
- `tests/integration/live-booking-overlap.test.ts` is a Vitest test that also hits a real Supabase project (the same overlap/adjacency/cancellation scenarios, via the actual `@supabase/supabase-js` client), but it's **skipped by default** — it only runs with explicit opt-in, since it writes and then deletes real rows:
  ```bash
  RUN_SUPABASE_INTEGRATION_TESTS=1 npm test -- tests/integration
  ```
  This has **not** been run in this environment (it requires the idempotency-key migration, which is applied; running it still writes to your real project, however briefly). Everything else under `tests/` has been run, and passes.

## Remaining manual steps

1. Run both Phase 6 migrations against the live project, in order: `supabase/migrations/20261014000001_turf_payment_contact_fields.sql`, then `supabase/migrations/20261014000002_short_booking_reference.sql` (everything before them, through Phase 5, is already applied; an administrator is already bootstrapped).
2. On `/admin/turfs`, edit your turf and fill in its UPI ID, payee name, and (optionally) UPI phone/contact number/WhatsApp number, then upload a QR image, to actually exercise the Phase 6 UPI/QR/call-icon flows.
3. Run `supabase/tests/booking_overlap_tests.sql` in the SQL Editor and confirm every line says `PASS`.
4. Optionally run the opt-in live integration test (`RUN_SUPABASE_INTEGRATION_TESTS=1 npm test -- tests/integration`).
5. `npm run dev` and walk through the customer, lookup, and admin flows end to end in the browser (see manual test steps below).

### Manual browser test steps

**Admin turf setup (do this first, once):**
1. Sign in at `/admin/login`, go to `/admin/turfs`, click Edit on your turf.
2. Enter a UPI ID (VPA), payee name, and optionally a UPI phone number; set/confirm the WhatsApp number (defaults to `9344689836` for a brand-new turf); set a public contact number. Save.
3. Upload a QR image (PNG/JPEG/WEBP, ≤2MB) and confirm it shows a preview, an uploading state, then a success message; reload the page and confirm the uploaded image still shows as "current".
4. Try uploading a `.txt` file and confirm it's rejected client-side with a clear message before any network request.

**Customer flow:**
1. `npm run dev`, open `http://localhost:3000`. Confirm the call icon appears next to the turf name (since you just set a contact number) and that tapping it opens your device's dialer with that number.
2. In the mobile number field, try typing 11+ digits in a row and confirm the 11th digit never appears — the field stops accepting input at 10 characters. Try typing/pasting letters and confirm they never appear either.
3. Pick a date, a start time, a duration (note the live price shown on each duration button), fill in name + a 10-digit phone number, choose **Cash at turf**, submit.
4. Confirm the confirmation panel shows a **5-digit** reference (not a long uuid), turf name, date/time/duration, booking status ("Awaiting approval"), payment method ("Cash at turf"), payment status ("Unpaid (pay at the turf)"), and a total matching the duration step's preview — plus "Notify Turf on WhatsApp", "Book another slot", and "View My Bookings" buttons.
5. Click "Notify Turf on WhatsApp" and confirm it opens WhatsApp (web or app) addressed to the WhatsApp number you set, with a prefilled message matching the required template exactly (reference, turf, customer name/phone, date, times, duration, amount, payment method/status, booking status) — and confirm it does **not** send anything by itself; you still have to press Send.
6. Reload the availability for that date/time — the slot you just booked should now show as unavailable.
7. Try submitting the same booking twice in a row without reloading (simulating a double-click) and confirm it does not create two rows in `bookings`.

**UPI flow:**
1. Make a new booking choosing **UPI** as the payment method (only selectable because you configured UPI in the turf-setup step above).
2. Confirm the confirmation panel shows a UPI panel: your uploaded QR image, the configured VPA/payee name, the correct amount, the 5-digit booking reference, a generated QR code, and a "Pay with UPI" link — and that payment status reads "Payment pending verification", not "Paid".
3. On a phone, tapping "Pay with UPI" should attempt to open your UPI app chooser; confirm it shows the right payee/amount. On desktop (or if no UPI app opens), confirm the QR code and the VPA text are both usable as a fallback.
4. Confirm nothing on the page ever claims the payment succeeded, before or after tapping the link.

**Booking lookup flow:**
1. From the home page, click "View My Bookings" (or use the magic link from a confirmation screen, which should auto-fill and auto-run the search).
2. Try searching with just a phone number and an unrelated/made-up 5-digit reference — confirm you get "No booking found..." (not someone else's data).
3. Search with the phone number and the exact 5-digit reference from a booking you just made — confirm it returns all of that phone's bookings, upcoming ones first, each showing its own 5-digit reference, turf, date/time, duration, status, payment method, payment status, and total.
4. If one of them is the UPI booking from above, confirm its UPI panel reappears here too (so the customer can still complete payment after leaving and coming back). Click "Refresh" and confirm it re-fetches without errors.

**Admin flow:**
1. Open `http://localhost:3000/admin` signed out — confirm it redirects to `/admin/login`.
2. Sign in with the administrator account you created. Confirm you land on the dashboard and see today's summary cards and the recent bookings table, including a Ref and Payment column.
3. On `/admin/turfs`, edit the turf's hours and confirm the change is rejected if you set closing time earlier than opening time; then deactivate it and confirm a new customer booking attempt against it now fails.
4. On `/admin/pricing`, try adding a rule that overlaps an existing one for the same turf and day and confirm it's rejected with a clear message; add a non-overlapping one and confirm it appears.
5. On `/admin/bookings`, search by the 5-digit reference from one of your test bookings and confirm it finds exactly that one. Confirm a pending booking, then cancel a different one, and confirm the cancelled one's slot becomes bookable again on the customer page.
6. Still on `/admin/bookings`, find the cash booking from above and click "Mark cash paid" — confirm its payment status updates to "Paid" and that re-checking `/my-bookings` for that booking now shows "Paid" too. Find the UPI booking and try both "Verify paid" and "Mark failed" on different test bookings.
7. On `/admin/blocks`, try blocking a time range that overlaps an active booking and confirm it's rejected; block a genuinely free range and confirm it immediately shows as unavailable on the customer availability page; then remove the block and confirm the slot reopens.
8. Sign out from the sidebar and confirm `/admin` redirects to the login page again.
