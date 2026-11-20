"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTOR_COOKIE, isRole } from "@/lib/actor";

/** Switches who is working. Kept for a year so it survives restarts. */
export async function setWorkingAs(formData: FormData) {
  const role = formData.get("role");
  if (!isRole(role)) return;
  (await cookies()).set(ACTOR_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
