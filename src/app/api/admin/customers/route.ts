import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

/**
 * Lists customers with booking stats computed in application code rather
 * than a SQL view: the fake Supabase test client (see tests/helpers/
 * fake-supabase.ts) only simulates the subset of supabase-js our routes
 * actually use (select/eq/in/or/order/range, no GROUP BY), so keeping the
 * aggregation here -- one query for the page of customers, one query for
 * just the bookings belonging to those customers -- keeps this route fully
 * exercisable without a real database, consistent with every other admin
 * route in this app.
 */
export async function handleAdminCustomersGet(request: Request, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE));

  const admin = deps.getAdminClient();
  let query = admin.from("customers").select("id, name, phone, created_at", { count: "exact" }).order("created_at", { ascending: false });

  if (search) {
    const escaped = search.replace(/[%_]/g, (c) => `\\${c}`);
    query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error("admin/customers GET failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const customers = (data ?? []) as CustomerRow[];
  const customerIds = customers.map((c) => c.id);

  let bookingsByCustomer = new Map<string, { count: number; mostRecent: string | null }>();
  if (customerIds.length > 0) {
    const { data: bookingRows, error: bookingsError } = await admin
      .from("bookings")
      .select("customer_id, booking_date")
      .in("customer_id", customerIds);

    if (bookingsError) {
      console.error("admin/customers GET: failed to load booking stats", bookingsError);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }

    const stats = new Map<string, { count: number; mostRecent: string | null }>();
    for (const row of (bookingRows ?? []) as { customer_id: string | null; booking_date: string }[]) {
      if (!row.customer_id) continue;
      const existing = stats.get(row.customer_id) ?? { count: 0, mostRecent: null };
      existing.count += 1;
      if (!existing.mostRecent || row.booking_date > existing.mostRecent) {
        existing.mostRecent = row.booking_date;
      }
      stats.set(row.customer_id, existing);
    }
    bookingsByCustomer = stats;
  }

  const customersWithStats = customers.map((c) => {
    const stats = bookingsByCustomer.get(c.id) ?? { count: 0, mostRecent: null };
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      createdAt: c.created_at,
      bookingCount: stats.count,
      mostRecentBookingDate: stats.mostRecent,
    };
  });

  return NextResponse.json({ customers: customersWithStats, total: count ?? 0, page, pageSize }, { status: 200 });
}

export async function GET(request: Request) {
  return handleAdminCustomersGet(request);
}
