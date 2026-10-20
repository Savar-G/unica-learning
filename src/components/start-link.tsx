"use client";

// Every "Take free assessment" entry (D-041, #82): a normal link to /start, the signup for the free online math
// assessment. A link works without JavaScript, with the keyboard and in a new tab. /start sends a signed-in parent to
// their account. `src` names the entry for cta_click, which reaches analytics only after the visitor accepts.
import Link, { useLinkStatus } from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { startHref } from "@/lib/visit-source";
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

function Anchor({ href, src, className, children }: { href: string; src: string; className: string; children: ReactNode }) {
  return (
    // Keep this page visible with inline feedback until /start is ready. Use default prefetch so the
    // session-dependent destination is checked on navigation, not reused from a full-page prefetch.
    <Link className={className} href={href} onClick={() => track("cta_click", { src })}>
      <StartLinkLabel>{children}</StartLinkLabel>
    </Link>
  );
}

// The visit's utm_* tags (a flyer's QR code lands on the home page with them) go on to /start, because the signup form
// keeps the tags of the page it is on. The server-rendered page links to plain /start; the tags are added once the page
// loads, so the page stays static.
function TaggedStartLink(props: { src: string; className: string; children: ReactNode }) {
  return <Anchor {...props} href={startHref(useSearchParams())} />;
}

export function StartLink({ src, className = "btn", children }: { src: string; className?: string; children: ReactNode }) {
  return (
    <Suspense fallback={<Anchor href="/start" src={src} className={className}>{children}</Anchor>}>
      <TaggedStartLink src={src} className={className}>{children}</TaggedStartLink>
    </Suspense>
  );
}

/** The line under an assessment button (D-134): the test needs a laptop or tablet, so a parent on a phone knows first. */
export const START_NOTE = "Your child takes the test on a laptop or tablet.";

export function StartNote() {
  return <p className="start-note">{START_NOTE}</p>;
}
