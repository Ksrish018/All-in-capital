import { NextResponse, type NextRequest } from "next/server";
import { createUserClient, createAdminClient } from "@/lib/supabase/server";

// Google sends the user back here. We finish sign-in, then check the allow list.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url));

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return NextResponse.redirect(new URL("/login?error=sign_in_failed", url));

  const email = data.user.email.toLowerCase();
  const admin = createAdminClient();
  const { data: allowed } = await admin.from("allowed_emails").select("name, role").eq("email", email).maybeSingle();

  if (!allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/not-allowed", url));
  }

  await admin
    .from("users")
    .upsert({ id: data.user.id, email, name: allowed.name, role: allowed.role }, { onConflict: "id" });
  return NextResponse.redirect(new URL("/", url));
}
