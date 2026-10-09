import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/site";
import { CookieSettingsButton } from "@/components/cookie-consent";

export function SupportPage({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div className="look-root support-root" data-look="warm">
      <header className="nav"><div className="in">
        <Link className="logo" href="/" aria-label={`${BRAND} home`}>{BRAND}<b /></Link>
        <Link className="support-back" href="/">Back to home</Link>
      </div></header>
      <main id="main" className="support-page">
        <p className="eyebrow">{label}</p>
        {title && <h1>{title}</h1>}
        {children}
      </main>
      <footer className="support-footer" aria-label="Site information">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <CookieSettingsButton />
        <span>© 2026 {BRAND}</span>
      </footer>
    </div>
  );
}
