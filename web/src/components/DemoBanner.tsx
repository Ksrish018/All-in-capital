import { REQUEST_ACCESS_URL } from "@/lib/demo";

export function DemoBanner() {
  return (
    <div role="note" style={{ background: "#111827", color: "#fff", fontSize: 13 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "8px 24px", display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "center" }}>
        <strong>Read-only demo</strong>
        <span aria-hidden="true" style={{ opacity: 0.5 }}>·</span>
        <span style={{ opacity: 0.85 }}>Look around freely. Buttons that change data are switched off.</span>
        <span aria-hidden="true" style={{ opacity: 0.5 }}>·</span>
        <a href={REQUEST_ACCESS_URL} style={{ color: "#fff", textDecoration: "underline", textUnderlineOffset: 3 }}>Request full access</a>
      </div>
    </div>
  );
}
