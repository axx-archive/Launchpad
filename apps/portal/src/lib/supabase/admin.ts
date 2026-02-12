import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service role client — bypasses RLS.
 * Use ONLY in server-side API routes and server components for admin operations.
 * Never expose or import from client code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Admin operations require the service role key."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
