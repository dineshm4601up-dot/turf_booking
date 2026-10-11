import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cookie-bound client for reading the signed-in user's session in Server
 * Components, Server Actions, and Route Handlers. Uses the public anon key
 * (the user's own session authorizes them via RLS) -- never the
 * service-role key. In a Server Component, cookies() is read-only, so the
 * setAll below is a documented no-op there (Supabase's own guidance): a
 * session refreshed mid-render just won't persist until the next
 * Action/Route Handler/middleware pass writes it back.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component -- safe to ignore because
          // middleware.ts refreshes the session cookie on navigation.
        }
      },
    },
  });
}
