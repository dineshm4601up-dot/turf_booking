import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { isBookingStatus } from "@/lib/booking-status";
import { isValidDateString, isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface CustomerEmbed {
  name: string;
  phone: string;
}

interface AdminBookingRow {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_id: string | null;
  // supabase-js can't infer the embed's cardinality without a typed
  // Database schema, so it may type this as an object or an array
  // depending on the query shape -- handle both at runtime.
  customers: CustomerEmbed | CustomerEmbed[] | null;
  [key: string]: unknown;
}

function getCustomer(customers: AdminBookingRow["customers"]): CustomerEmbed | null {
  if (!customers) return null;
  return Array.isArray(customers) ? (customers[0] ?? null) : customers;
}

/**
 * Prefers the Customer Master's canonical name/phone over whatever was
 * literally typed at the time this specific booking was made -- so admin
 * booking details stay consistent with later admin name edits -- while
 * falling back to the booking's own stored values for a historical row
 * that was never linked to a customer record (see the Phase 10 backfill
 * migration's reporting for which rows those are). Never overwrites the
 * underlying row, just the value returned to the client.
 */
function withCanonicalCustomer(row: AdminBookingRow) {
  const customer = getCustomer(row.customers);
  const { customers: _customers, ...rest } = row;
  return {
    ...rest,
    customer_name: customer?.name ?? row.customer_name,
    customer_phone: customer?.phone ?? row.customer_phone,
  };
}

export async function handleAdminBookingsGet(request: Request, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const status = searchParams.get("status");
  const turfId = searchParams.get("turfId");
  const customerId = searchParams.get("customerId");
  const search = searchParams.get("search")?.trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE));

  if (date && !isValidDateString(date)) {
    return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
  }
  if (status && !isBookingStatus(status)) {
    return NextResponse.json({ error: "status must be one of pending, confirmed, cancelled." }, { status: 400 });
  }
  if (turfId && !isValidUuid(turfId)) {
    return NextResponse.json({ error: "A valid turfId is required." }, { status: 400 });
  }
  if (customerId && !isValidUuid(customerId)) {
    return NextResponse.json({ error: "A valid customerId is required." }, { status: 400 });
  }

  const admin = deps.getAdminClient();
  let query = admin
    .from("bookings")
    .select(
      "id, turf_id, customer_id, customer_name, customer_phone, booking_date, start_time, end_time, duration_minutes, total_price, status, payment_method, payment_status, payment_updated_at, created_at, turfs(name), customers(name, phone)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (date) query = query.eq("booking_date", date);
  if (status) query = query.eq("status", status);
  if (turfId) query = query.eq("turf_id", turfId);
  if (customerId) query = query.eq("customer_id", customerId);

  if (search) {
    if (isValidUuid(search)) {
      query = query.eq("id", search);
    } else {
      const escaped = search.replace(/[%_]/g, (c) => `\\${c}`);
      query = query.or(`customer_name.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%`);
    }
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error("admin/bookings GET failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(
    { bookings: (data ?? []).map((row) => withCanonicalCustomer(row as unknown as AdminBookingRow)), total: count ?? 0, page, pageSize },
    { status: 200 }
  );
}

export async function GET(request: Request) {
  return handleAdminBookingsGet(request);
}
