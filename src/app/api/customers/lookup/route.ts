import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateCustomerPhone } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Same threat model as /api/bookings/lookup (Phase 7): a phone number alone
// is enough to get a result back, so this is rate-limited the same way to
// bound bulk probing from one client. The result here is strictly less
// sensitive than a booking history (just a name, if one is saved), but it
// is still real personal data, so it gets the same treatment rather than
// being left unprotected because it "seems smaller."
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 5 * 60_000;

export interface CustomerLookupDeps {
  getAdminClient: () => SupabaseClient;
}

const defaultDeps: CustomerLookupDeps = { getAdminClient: createSupabaseAdminClient };

/**
 * Used by the booking form: once the customer finishes typing a valid
 * 10-digit mobile number, this tells the form whether that number already
 * has a saved name in the Customer Master, so the form can pre-fill and
 * lock the name field rather than asking a returning customer to retype
 * their name. Returns `{ name: null }` for an unrecognized number (not a
 * 404 -- "no customer yet" is an entirely normal, expected result here).
 */
export async function handleCustomerLookupRequest(request: Request, deps: CustomerLookupDeps = defaultDeps) {
  const rateLimit = checkRateLimit(`customers-lookup:${getClientIp(request)}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many lookup attempts. Please wait a while and try again." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const phoneResult = validateCustomerPhone(input.phone);
  if (!phoneResult.ok) {
    return NextResponse.json({ error: phoneResult.error }, { status: 400 });
  }

  const admin = deps.getAdminClient();
  const { data, error } = await admin.from("customers").select("name").eq("phone", phoneResult.value).maybeSingle();

  if (error) {
    console.error("customers/lookup: query failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ name: data?.name ?? null }, { status: 200 });
}

export async function POST(request: Request) {
  return handleCustomerLookupRequest(request);
}
