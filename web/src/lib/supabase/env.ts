/**
 * Supabase URL and publishable key. Both are safe to expose.
 * Server code (including the proxy) reads the root .env values directly.
 * Browser code receives the NEXT_PUBLIC_ copies that next.config.ts inlines.
 */
export function supabasePublicEnv() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in the root .env");
  }
  return { url, key };
}
