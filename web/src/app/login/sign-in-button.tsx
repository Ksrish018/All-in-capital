"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function SignInButton() {
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }
  return (
    <button
      onClick={signIn}
      disabled={busy}
      className="w-full rounded-md bg-accent px-4 py-2.5 font-medium text-on-accent disabled:opacity-60"
    >
      {busy ? "Opening Google…" : "Sign in with Google"}
    </button>
  );
}
