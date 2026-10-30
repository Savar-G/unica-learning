import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A short page around the desk (#301): a page QR code that cannot open, or Forgot PIN. Only the wordmark and one way
 * back, so a child who reaches it from the desk finds no way into the account.
 */
export function DeskShell({ back, title, children }: { back: { href: string; label: string }; title: string; children: ReactNode }) {
  return (
    <div className="look-root support-root" data-look="warm">
      <header className="nav"><div className="in">
        <span className="logo">Unica Learning<b /></span>
        <Link className="support-back" href={back.href}>{back.label}</Link>
      </div></header>
      <main id="main" className="support-page">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
