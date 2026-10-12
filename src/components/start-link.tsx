"use client";

// Every "Take free assessment" entry (D-041, #82): a normal link to /start, the signup for the free online math
// assessment. A link works without JavaScript, with the keyboard and in a new tab. /start sends a signed-in parent to
// their account. `src` names the entry for cta_click, which reaches analytics only after the visitor accepts.
import Link from "next/link";
import type { ReactNode } from "react";
import { track } from "@/lib/track";

export function StartLink({ src, className = "btn", children }: { src: string; className?: string; children: ReactNode }) {
  return (
    <Link className={className} href="/start" prefetch={false} onClick={() => track("cta_click", { src })}>
      {children}
    </Link>
  );
}
