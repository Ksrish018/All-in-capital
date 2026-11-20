"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function Requeue({ id, mode, label }: { id: string; mode: "full_review" | "retry"; label: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  return (
    <div>
      <button
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true });
          const res = await fetch(`/api/applications/${id}/requeue`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mode }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return setState({ busy: false, error: body.error ?? "That did not work. Try again." });
          setState({ busy: false });
          router.refresh();
        }}
        className="btn btn-primary"
      >
        {state.busy ? "Sending" : label}
      </button>
      {state.error ? <p className="mt-2 text-[12px] text-flag">{state.error}</p> : null}
    </div>
  );
}
