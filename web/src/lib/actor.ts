import "server-only";
import { cookies } from "next/headers";

/**
 * Who is working right now. There is no sign-in: the person picks their name in the sidebar,
 * and every gate action records it. Roles still decide what each person may do (PRD Section 3.2).
 */
export type Role = "riya" | "kushal" | "aditya";
export const PEOPLE: Record<Role, string> = { riya: "Riya", kushal: "Kushal", aditya: "Aditya" };
export const ROLES = Object.keys(PEOPLE) as Role[];
export const ACTOR_COOKIE = "working_as";

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

/** The person working now. Defaults to Riya, who does most of the daily screening. */
export async function currentActor(): Promise<{ role: Role; name: string }> {
  const value = (await cookies()).get(ACTOR_COOKIE)?.value;
  const role: Role = isRole(value) ? value : "riya";
  return { role, name: PEOPLE[role] };
}

/** What each role may do (PRD Section 3.2). */
export const can = {
  gate1: (r: Role) => r === "riya" || r === "kushal",
  gate2: (r: Role) => r === "kushal",
  sendEmail: (r: Role) => r === "riya",
  approveThesis: (r: Role) => r === "kushal",
  changeCostCap: (r: Role) => r === "kushal",
};
