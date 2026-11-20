import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Langfuse tracing over OpenTelemetry (PRD 15.2 and 18.1). One trace per application, one span per model call.
// The old ingestion API is switched off, so spans go to /api/public/otel/v1/traces as OTLP JSON.
// Only redacted inputs are ever traced. Failures here never break screening.

export function traceIdFor(applicationId: string | null): string {
  return createHash("sha256").update(`allin:${applicationId ?? "none"}`).digest("hex").slice(0, 32);
}

type Attr = string | number | boolean;

export async function sendSpan(args: {
  applicationId: string | null;
  name: string;
  startMs: number;
  endMs: number;
  attributes: Record<string, Attr | null | undefined>;
  error?: string | null;
}): Promise<string | null> {
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  const host = process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com";
  if (!pk || !sk) return null;
  const traceId = traceIdFor(args.applicationId);
  const value = (v: Attr) =>
    typeof v === "number" ? (Number.isInteger(v) ? { intValue: v } : { doubleValue: v }) : typeof v === "boolean" ? { boolValue: v } : { stringValue: v };
  const attributes = Object.entries({
    "langfuse.trace.name": args.applicationId ? `application ${args.applicationId}` : "system",
    "langfuse.session.id": args.applicationId ?? undefined,
    ...args.attributes,
  })
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([key, v]) => ({ key, value: value(v as Attr) }));
  const body = {
    resourceSpans: [{
      resource: { attributes: [{ key: "service.name", value: { stringValue: "allin-triage" } }] },
      scopeSpans: [{
        scope: { name: "allin-triage" },
        spans: [{
          traceId,
          spanId: randomBytes(8).toString("hex"),
          name: args.name,
          kind: 1,
          startTimeUnixNano: String(BigInt(args.startMs) * BigInt(1_000_000)),
          endTimeUnixNano: String(BigInt(args.endMs) * BigInt(1_000_000)),
          attributes,
          status: args.error ? { code: 2, message: args.error.slice(0, 200) } : { code: 1 },
        }],
      }],
    }],
  };
  try {
    const res = await fetch(`${host.replace(/\/$/, "")}/api/public/otel/v1/traces`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${pk}:${sk}`).toString("base64")}` },
      body: JSON.stringify(body),
    });
    return res.ok ? traceId : null;
  } catch {
    return null;
  }
}
