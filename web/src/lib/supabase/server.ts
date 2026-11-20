import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "./env";

/**
 * Supabase client with the secret key. Server only.
 * The app has no sign-in, so all reads and writes happen here, on the server.
 * Row Level Security still blocks any direct browser access to the database.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(supabasePublicEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
