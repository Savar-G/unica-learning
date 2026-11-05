"use client";

import { useState } from "react";

// "Email me the link" on the Scan pages tab's desktop screen (#564). Posts to /api/account/scan-link, which emails the
// page's address to the signed-in parent.

const TEXT: Record<string, string> = {
  sent: "We sent the link to your email. Open it on your phone.",
  too_many: "You asked for this link a few times in the last hour. Use the link in your email, or scan the code.",
  unsure: "We could not confirm the email went. Check your email before you ask again, or scan the code.",
  failed: "We could not send the email. Scan the code instead, or try again later.",
};

export function ScanEmailLink({ childId }: { childId: string }) {
  const [state, setState] = useState<"idle" | "busy" | keyof typeof TEXT>("idle");
  async function send() {
    setState("busy");
    try {
      const response = await fetch("/api/account/scan-link", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ child: childId }), cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      setState(response.ok ? "sent" : data.error === "too_many" || data.error === "unsure" ? data.error : "failed");
    } catch {
      setState("failed");
    }
  }
  return (
    <div className="scan-away-email">
      <button type="button" className="btn ghost" disabled={state === "busy" || state === "sent"} onClick={() => void send()}>
        {state === "busy" ? "Sending..." : "Email me the link"}
      </button>
      {state in TEXT && <p role={state === "sent" ? "status" : "alert"} className={`acct-alert${state === "sent" ? " acct-saved" : ""}`}>{TEXT[state]}</p>}
    </div>
  );
}
