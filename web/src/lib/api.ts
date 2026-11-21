import "server-only";
import { NextResponse } from "next/server";
import { GateError } from "./gates-server";

/** Runs a gate action and turns a GateError into a plain message with the right status. */
export async function act(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof GateError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("gate action:", e);
    return NextResponse.json({ error: "That did not work. Try again." }, { status: 500 });
  }
}

export async function body<T>(req: Request): Promise<Partial<T>> {
  return ((await req.json().catch(() => ({}))) ?? {}) as Partial<T>;
}
