import { NextResponse, after } from "next/server";
import { IntakeRefused, createApplication } from "@/lib/intake/create";
import { runScreeningWorker } from "@/lib/intake/screen";

export const maxDuration = 300;

// POST /api/applications. Creates one application from a form PDF, a deck PDF, or a warm intro.
export async function POST(req: Request) {
  const data = await req.formData();
  const str = (k: string) => (typeof data.get(k) === "string" ? (data.get(k) as string) : undefined);
  const file = (k: string) => {
    const v = data.get(k);
    return v instanceof File && v.size > 0 ? v : null;
  };
  const source = str("source") === "warm_intro" ? "warm_intro" : "public_form";
  try {
    const res = await createApplication({
      source,
      companyName: str("company_name"),
      website: str("website"),
      introducedBy: str("introduced_by"),
      notes: str("notes"),
      form: file("form"),
      deck: file("deck"),
    });
    // Start the worker straight away. The scheduler also calls it every minute.
    after(() => runScreeningWorker().catch((e) => console.error("screening worker:", e)));
    return NextResponse.json(res, { status: 201 });
  } catch (e) {
    if (e instanceof IntakeRefused) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("intake:", e);
    return NextResponse.json({ error: "The application could not be saved. Try again." }, { status: 500 });
  }
}
