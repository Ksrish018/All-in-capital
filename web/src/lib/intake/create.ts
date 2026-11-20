import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { queue } from "@/lib/db";
import { BUCKET, QUEUE, type ScreeningJob } from "./screen";

// Steps 1 and 2. Intake, store and queue. Nothing is processed outside the queue.

export const MAX_BYTES = 25 * 1024 * 1024;

export class IntakeRefused extends Error {}

export type NewApplication = {
  source: "public_form" | "warm_intro";
  companyName?: string;
  website?: string;
  introducedBy?: string;
  notes?: string;
  form?: File | null;
  deck?: File | null;
};

/** Refuses anything that is not a real PDF of 25 MB or less, with a clear message. */
export async function checkPdf(file: File, what: string): Promise<Uint8Array> {
  if (file.size === 0) throw new IntakeRefused(`The ${what} is empty.`);
  if (file.size > MAX_BYTES) throw new IntakeRefused(`The ${what} is ${(file.size / 1048576).toFixed(1)} MB. The limit is 25 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  if (head !== "%PDF-") throw new IntakeRefused(`The ${what} is not a PDF. Please upload a PDF file.`);
  return bytes;
}

/** Guesses the company from a file name such as "Talkbook_Form.pdf". Parsing replaces it with the real name. */
export function nameFromFile(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[_\s-]*(form( response)?|deck|application)[_\s-]*/gi, " ").replace(/[_-]+/g, " ").trim() || "Unnamed company";
}

export async function createApplication(input: NewApplication): Promise<{ id: string; position: number }> {
  if (input.source === "public_form" && !input.form) throw new IntakeRefused("A public form application needs the form PDF.");
  if (input.source === "warm_intro" && !input.companyName?.trim()) throw new IntakeRefused("A warm intro needs the company name.");
  const form = input.form ? await checkPdf(input.form, "form") : null;
  const deck = input.deck ? await checkPdf(input.deck, "deck") : null;

  const db = createAdminClient();
  const company = input.companyName?.trim() || nameFromFile(input.form?.name ?? input.deck?.name ?? "");
  const { data: app, error } = await db
    .from("applications")
    .insert({
      company_name: company,
      website: input.website?.trim() || null,
      source: input.source,
      introduced_by: input.introducedBy?.trim() || null,
      intro_notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !app) throw new Error(`Could not create the application: ${error?.message}`);

  // Store files privately. If anything fails, the application says why instead of vanishing.
  try {
    for (const [kind, bytes] of [["form", form], ["deck", deck]] as const) {
      if (!bytes) continue;
      const path = `${app.id}/${kind}.pdf`;
      const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(`Could not store the ${kind}: ${up.error.message}`);
      const doc = await db.from("documents").insert({ application_id: app.id, kind, storage_path: path });
      if (doc.error) throw new Error(`Could not record the ${kind}: ${doc.error.message}`);
    }
    await db.from("applications").update({ status: "queued" }).eq("id", app.id);
    await queue.send<ScreeningJob>(QUEUE, { application_id: app.id });
  } catch (e) {
    await db.from("applications").update({ status: "needs_attention", status_reason: e instanceof Error ? e.message : String(e) }).eq("id", app.id);
    throw e;
  }
  const positions = await queue.positions(QUEUE);
  return { id: app.id, position: positions.get(app.id) ?? 0 };
}
