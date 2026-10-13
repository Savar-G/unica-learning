"use client";

// Every "Take free assessment" entry (D-041, #82): a normal link to /start, the signup for the free online math
// assessment. A link works without JavaScript, with the keyboard and in a new tab. /start sends a signed-in parent to
// their account. `src` names the entry for cta_click, which reaches analytics only after the visitor accepts.
import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { track } from "@/lib/track";

function StartLinkLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  // Keep the button's width while its label changes. The empty status is present before the announcement.
  return (
    <span style={{ display: "inline-grid", gap: "inherit", alignItems: "center" }}>
      <span style={{ gridArea: "1 / 1", display: "inline-flex", alignItems: "center", gap: "inherit", visibility: pending ? "hidden" : undefined }}>{children}</span>
      <span style={{ gridArea: "1 / 1", opacity: pending ? 1 : 0 }} role="status">
        {pending ? "Opening..." : null}
      </span>
    </span>
  );
}

export function StartLink({ src, className = "btn", children }: { src: string; className?: string; children: ReactNode }) {
  return (
    // Default prefetch prepares /start's loading screen. The page still checks the current session on each visit.
    <Link className={className} href="/start" onClick={() => track("cta_click", { src })}>
      <StartLinkLabel>{children}</StartLinkLabel>
    </Link>
  );
}
