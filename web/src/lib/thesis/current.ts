import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/** The card live screening uses: the latest approved version, or the latest draft until one is approved. */
export async function currentCardRow() {
  const db = createAdminClient();
  const { data: approved } = await db.from("thesis_cards").select("*").eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
  if (approved) return approved;
  const { data: latest } = await db.from("thesis_cards").select("*").order("version", { ascending: false }).limit(1).single();
  return latest;
}
