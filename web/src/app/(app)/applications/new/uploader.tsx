"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Row = { key: string; company: string; form: File | null; deck: File | null; state: "ready" | "sending" | "sent" | "refused"; note?: string; id?: string };

const MAX = 25 * 1024 * 1024;

/** "Talkbook_Form.pdf" and "Talkbook_Deck.pdf" pair up as Talkbook. */
function companyOf(name: string): { company: string; kind: "form" | "deck" } {
  const kind = /deck|pitch|presentation/i.test(name) ? "deck" : "form";
  const company = name.replace(/\.pdf$/i, "").replace(/[_\s-]*(form( response)?|deck|pitch|application|response)[_\s-]*/gi, " ").replace(/[_-]+/g, " ").trim();
  return { company: company || name, kind };
}

function problem(f: File): string | null {
  if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return `${f.name} is not a PDF.`;
  if (f.size > MAX) return `${f.name} is over 25 MB.`;
  return null;
}

export function Uploader() {
  const [mode, setMode] = useState<"files" | "warm">("files");
  return (
    <div className="mt-8">
      <div className="segmented" role="tablist">
        {(["files", "warm"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
          >
            {m === "files" ? "Public form applications" : "Add a warm intro"}
          </button>
        ))}
      </div>
      {mode === "files" ? <Files /> : <WarmIntro />}
    </div>
  );
}

function Files() {
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | File[]) {
    const bad: string[] = [];
    setRows((prev) => {
      const next = [...prev];
      for (const f of Array.from(list)) {
        const p = problem(f);
        if (p) { bad.push(p); continue; }
        const { company, kind } = companyOf(f.name);
        const k = company.toLowerCase().replace(/[^a-z0-9]/g, "");
        let row = next.find((r) => r.key === k && r.state === "ready");
        if (!row) { row = { key: k, company, form: null, deck: null, state: "ready" }; next.push(row); }
        row[kind] = f;
      }
      return next;
    });
    setErrors(bad);
  }

  function swap(i: number) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, form: r.deck, deck: r.form } : r)));
  }

  async function sendAll() {
    const ready = rows.map((r, i) => [r, i] as const).filter(([r]) => r.state === "ready");
    await Promise.all(
      ready.map(async ([r, i]) => {
        if (!r.form) {
          setRows((prev) => prev.map((x, j) => (j === i ? { ...x, state: "refused", note: "A public form application needs the form PDF." } : x)));
          return;
        }
        setRows((prev) => prev.map((x, j) => (j === i ? { ...x, state: "sending" } : x)));
        const fd = new FormData();
        fd.set("source", "public_form");
        fd.set("form", r.form, r.form.name);
        if (r.deck) fd.set("deck", r.deck, r.deck.name);
        const res = await fetch("/api/applications", { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        setRows((prev) => prev.map((x, j) => (j === i
          ? res.ok
            ? { ...x, state: "sent", id: body.id, note: body.position ? `In queue, number ${body.position}` : "In queue" }
            : { ...x, state: "refused", note: body.error ?? "Could not be saved. Try again." }
          : x)));
      }),
    );
  }

  const readyCount = rows.filter((r) => r.state === "ready").length;
  const sentCount = rows.filter((r) => r.state === "sent").length;

  return (
    <div className="mt-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        role="button"
        tabIndex={0}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed px-6 py-14 text-center transition-colors duration-300 ${over ? "border-brass bg-surface" : "border-border-strong bg-surface/60 hover:border-brass"}`}
      >
        <div className="font-display text-[26px] leading-tight">Drop forms and decks here</div>
        <p className="mt-2 text-[13px] text-muted">PDF only, up to 25 MB each. Or click to choose files.</p>
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => e.target.files && add(e.target.files)} />
      </div>
      {errors.length ? (
        <ul className="mt-3 space-y-1 border-l border-flag pl-4 text-[13px] text-flag">
          {errors.map((e) => <li key={e}>{e} It was not added.</li>)}
        </ul>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-6 overflow-hidden panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="eyebrow">{rows.length} {rows.length === 1 ? "application" : "applications"}</div>
            <div className="flex items-center gap-2">
              {sentCount ? <Link href="/" className="btn btn-secondary">See the pipeline</Link> : null}
              <button
                onClick={sendAll}
                disabled={readyCount === 0}
                className="btn btn-primary"
              >
                Send {readyCount || ""} to the queue
              </button>
            </div>
          </div>
          <ul>
            {rows.map((r, i) => (
              <li key={`${r.key}-${i}`} className="grid grid-cols-1 items-center gap-2 border-b border-border px-5 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                <div className="font-display text-[19px]">{r.company}</div>
                <div className="text-[12px] text-muted">
                  <div>Form: {r.form ? r.form.name : <span className="text-needs-human">missing</span>}</div>
                  <div>Deck: {r.deck ? r.deck.name : <span>none, the brief will list it as a gap</span>}</div>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  {r.state === "ready" ? (
                    <>
                      <button onClick={() => swap(i)} className="rounded-full border border-border px-3 py-1 text-muted hover:text-text">Swap form and deck</button>
                      <button onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="rounded-full px-2 py-1 text-muted hover:text-flag" aria-label={`Remove ${r.company}`}>Remove</button>
                    </>
                  ) : r.state === "sending" ? (
                    <span className="flex items-center gap-2 text-muted"><span className="live-dot" aria-hidden="true" />Sending</span>
                  ) : r.state === "sent" ? (
                    <Link href={`/applications/${r.id}`} className="text-go hover:underline">{r.note}</Link>
                  ) : (
                    <span className="text-flag">{r.note}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function WarmIntro() {
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; note?: string; id?: string }>({ kind: "idle" });

  async function submit(fd: FormData) {
    setState({ kind: "sending" });
    fd.set("source", "warm_intro");
    for (const k of ["form", "deck"]) {
      const f = fd.get(k);
      if (f instanceof File && f.size === 0) fd.delete(k);
      if (f instanceof File && f.size > 0 && problem(f)) return setState({ kind: "error", note: problem(f)! });
    }
    const res = await fetch("/api/applications", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? { kind: "sent", id: body.id, note: body.position ? `In queue, number ${body.position}` : "In queue" } : { kind: "error", note: body.error ?? "Could not be saved." });
  }

  const field = "mt-1.5 w-full panel-sm px-3 py-2 text-[14px] outline-none transition-colors focus:border-brass";
  return (
    <form action={submit} className="mt-6 grid max-w-3xl gap-5 panel p-6 md:grid-cols-2 md:p-8">
      <label className="block">
        <span className="eyebrow">Company name</span>
        <input name="company_name" required className={field} placeholder="StockSathi" />
      </label>
      <label className="block">
        <span className="eyebrow">Website</span>
        <input name="website" className={field} placeholder="www.example.com" />
      </label>
      <label className="block md:col-span-2">
        <span className="eyebrow">Introduced by</span>
        <input name="introduced_by" className={field} placeholder="A founder in the Fund I portfolio" />
      </label>
      <label className="block md:col-span-2">
        <span className="eyebrow">Notes</span>
        <textarea name="notes" rows={4} className={field} placeholder="What the introducer said, and anything you already know." />
      </label>
      <label className="block">
        <span className="eyebrow">Form response (optional)</span>
        <input name="form" type="file" accept="application/pdf,.pdf" className="mt-2 block w-full text-[13px] text-muted file:mr-3 file:rounded-full file:border file:border-border file:bg-transparent file:px-3 file:py-1 file:text-text" />
      </label>
      <label className="block">
        <span className="eyebrow">Deck (optional)</span>
        <input name="deck" type="file" accept="application/pdf,.pdf" className="mt-2 block w-full text-[13px] text-muted file:mr-3 file:rounded-full file:border file:border-border file:bg-transparent file:px-3 file:py-1 file:text-text" />
      </label>
      <div className="flex flex-wrap items-center gap-4 md:col-span-2">
        <button
          disabled={state.kind === "sending"}
          className="btn btn-primary"
        >
          {state.kind === "sending" ? "Adding" : "Add warm intro"}
        </button>
        {state.kind === "sent" ? <Link href={`/applications/${state.id}`} className="text-[13px] text-go hover:underline">Added. {state.note}</Link> : null}
        {state.kind === "error" ? <span className="text-[13px] text-flag">{state.note}</span> : null}
      </div>
    </form>
  );
}
