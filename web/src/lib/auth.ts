import "server-only";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";

export type Role = "riya" | "kushal" | "aditya" | "admin";
export type Member = { id: string; name: string; email: string; role: Role };

/** The signed-in fund member. Sends anyone else to sign in or to the not-allowed page. */
export async function requireMember(): Promise<Member> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("users")
    .select("id, name, email, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!member) redirect("/not-allowed");
  return member as Member;
}

/** Roles that may act at each gate (PRD Section 3.2). Admin can act as any role during development. */
export const can = {
  gate1: (r: Role) => r === "riya" || r === "kushal" || r === "admin",
  gate2: (r: Role) => r === "kushal" || r === "admin",
  sendEmail: (r: Role) => r === "riya" || r === "admin",
  approveThesis: (r: Role) => r === "kushal" || r === "admin",
  changeCostCap: (r: Role) => r === "kushal" || r === "admin",
};
