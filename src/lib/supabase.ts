import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS, so this module must never be
 * imported into anything that ships to a browser.
 */
export function db(): SupabaseClient {
  if (cached) return cached;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
