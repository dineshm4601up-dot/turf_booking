import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Browser-safe client using the public anon/publishable key. Memoized so
 * repeated calls across components reuse one instance (Supabase warns about
 * multiple GoTrueClient instances otherwise). Only ever reads tables that
 * Row Level Security allows the public to read (active turfs, pricing,
 * blocks) -- it never reads or writes bookings directly.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey);
  return cachedClient;
}
