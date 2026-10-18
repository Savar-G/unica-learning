import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/site";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { BUSINESS_NAME } from "@/lib/contact";

/** `wide` uses the full nav width, for the assessment report (D-087); a page with no `label` shows no eyebrow. */
export function SupportPage({ label, title, wide = false, children }: { label: string; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className="look-root support-root" data-look="warm">
      <header className="nav"><div className="in">
        <Link className="logo" href="/" aria-label={`${BRAND} home`}>{BRAND}<b /></Link>
        <Link className="support-back" href="/">Back to home</Link>
      </div></header>
      <main id="main" className={wide ? "support-page support-wide" : "support-page"}>
        {label && <p className="eyebrow">{label}</p>}
        {title && <h1>{title}</h1>}
        {children}
      </main>
      <footer className="support-footer" aria-label="Site information">
        <Link href="/resources">Resources</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/contact">Contact us</Link>
        <CookieSettingsButton />
        <span>© 2026 {BUSINESS_NAME}</span>
      </footer>
    </div>
  );
}
