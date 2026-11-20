import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "./env";

/** Supabase client acting as the signed-in user. Row Level Security applies. */
export async function createUserClient() {
  const cookieStore = await cookies();
  const { url, key } = supabasePublicEnv();
  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Supabase client with the secret key. Bypasses Row Level Security.
 * Server only: workers and trusted routes. Never import from client code.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(supabasePublicEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
