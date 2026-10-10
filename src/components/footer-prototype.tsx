// PROTOTYPE (branch site/footer-prototype): closing claim + footer variants for the home page, switched with ?variant=.
// Throwaway. Fold the chosen variant into Closing/Footer in sections.tsx, then delete this file, its CSS and the switch.
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { Knot, Rise } from "@/components/drawn";
import { EndingSwitch } from "@/components/footer-prototype-switch";
import { Closing, Footer, STRIP } from "@/components/sections";
import { SUPPORT_HREF } from "@/lib/contact";
import { BRAND } from "@/lib/site";
import "./footer-prototype.css";

// Server-side copy of the flag in prototype-switcher.tsx: a server component cannot read a value from a "use client" module.
export const SHOW_PROTOTYPES = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

type L = { label: string; href: string };
const GROUPS: { title: string; links: L[] }[] = [
  { title: "Learn", links: [{ label: "How it works", href: "#how" }, { label: "What you get", href: "#inc" }, { label: "Pricing", href: "#price" }, { label: "FAQ", href: "#faq" }] },
  { title: "Company", links: [{ label: "Our story", href: "/our-story" }, { label: "Rewards", href: "/rewards" }, { label: "Resources", href: "/resources" }] },
  { title: "Help", links: [{ label: "Contact us", href: SUPPORT_HREF }, { label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }] },
];
const BELIEFS = [
  { text: "Every child learns differently. Learning should adapt.", tone: "var(--sun)" },
  { text: "No child should fall behind because the class moved on.", tone: "var(--sky)" },
  { text: "Personal, on paper, and affordable.", tone: "var(--tang)" },
];
const TAGLINE = "Personalized math and reading workbooks for ages 6-12.";
const FACTS = ["Made in Vancouver, BC", "30-day money-back guarantee", "Cancel anytime"];
const CLAIM = "This is what learning should be like.";

function A({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return href.startsWith("/") ? <Link className={className} href={href}>{children}</Link> : <a className={className} href={href}>{children}</a>;
}
const Logo = () => <a className="logo" href="#top">{BRAND}<b /></a>;
const Assess = ({ className = "", label = "Take free assessment" }: { className?: string; label?: string }) => (
  <button className={`btn ${className}`.trim()} data-open data-src="close">{label} <span className="arr" aria-hidden="true">→</span></button>
);
const Beliefs = ({ className = "" }: { className?: string }) => (
  <ul className={`fp-beliefs ${className}`.trim()}>
    {BELIEFS.map((b) => <li key={b.text}><i style={{ background: b.tone }} /><span>{b.text}</span></li>)}
  </ul>
);
const Cols = () => (
  <>
    {GROUPS.map((g) => (
      <nav className="fp-col" key={g.title} aria-label={g.title}>
        <h3>{g.title}</h3>
        <ul>{g.links.map((l) => <li key={l.label}><A href={l.href}>{l.label}</A></li>)}</ul>
      </nav>
    ))}
  </>
);
const Fine = ({ className = "" }: { className?: string }) => (
  <div className={`fp-fine ${className}`.trim()}>
    <span>© 2026 {BRAND}</span>
    {FACTS.map((f) => <span key={f}>{f}</span>)}
    <CookieSettingsButton />
  </div>
);

/* A - the reference, nearly literal: solid colour band, centred claim, white rounded card with link columns. */
function BandCard() {
  return (
    <section className="fp fpA" aria-labelledby="fpA-t">
      <Knot />
      <Rise><Beliefs className="on-dark" /></Rise>
      <Rise as="h2" id="fpA-t">{CLAIM}</Rise>
      <Rise className="ctas"><Assess className="fp-sun" /><a className="btn fp-outline" href="#price">See pricing</a></Rise>
      <footer className="fp-card">
        <div className="fp-brand"><Logo /><p>{TAGLINE}</p></div>
        <Cols />
        <Fine />
      </footer>
    </section>
  );
}

/* B - the reference in our own look: grainy gradient field, belief cards, white card nested in the field. */
function GradientCard() {
  return (
    <section className="fp fpB" aria-labelledby="fpB-t">
      <Knot />
      <div className="fpB-field">
        <Rise><Beliefs /></Rise>
        <Rise as="h2" id="fpB-t">{CLAIM}</Rise>
        <Rise className="ctas"><Assess /><a className="btn ghost" href="#price">See pricing</a></Rise>
        <footer className="fp-card">
          <div className="fp-brand"><Logo /><p>{TAGLINE}</p></div>
          <Cols />
          <Fine />
        </footer>
      </div>
    </section>
  );
}

/* C - giant wordmark: plain white close, columns, then the brand name full-bleed in the gradient, cropped at the bottom. */
function Wordmark() {
  return (
    <section className="fp fpC" aria-labelledby="fpC-t">
      <Knot />
      <Rise as="h2" id="fpC-t">{CLAIM}</Rise>
      <Rise className="ctas"><Assess /><a className="btn ghost" href="#price">See pricing</a></Rise>
      <footer>
        <div className="fpC-row">
          <div className="fp-brand"><p>{TAGLINE}</p><Beliefs /></div>
          <Cols />
        </div>
        <Fine />
        <div className="fpC-mark" aria-hidden="true">Unica<b /></div>
      </footer>
    </section>
  );
}

/* D - notebook page: ruled paper, red margin, the claim in a child's hand, links as a to-do list. */
function Notebook() {
  return (
    <section className="fp fpD" aria-labelledby="fpD-t">
      <Knot />
      <div className="fpD-page">
        <p className="fpD-date">Today&apos;s lesson</p>
        <Rise as="h2" id="fpD-t">This is what learning <u>should</u> be like.</Rise>
        <ol className="fpD-todo">
          {BELIEFS.map((b) => <li key={b.text}><span className="box done" aria-hidden="true" />{b.text}</li>)}
          <li className="cta"><span className="box" aria-hidden="true" /><Assess className="fp-sun" /></li>
        </ol>
        <footer className="fpD-foot">
          <div className="fp-brand"><Logo /><p>{TAGLINE}</p></div>
          <Cols />
        </footer>
        <Fine />
      </div>
    </section>
  );
}

/* E - ink band: left-aligned editorial claim, the action on the right, columns on a dark field. */
function Ink() {
  return (
    <section className="fp fpE" aria-labelledby="fpE-t">
      <Knot />
      <Beliefs className="on-dark" />
      <div className="fpE-head">
        <Rise as="h2" id="fpE-t">{CLAIM}</Rise>
        <Rise className="ctas"><Assess className="fp-sun" /><a className="fpE-link" href="#price">See pricing →</a></Rise>
      </div>
      <footer className="fpE-foot">
        <div className="fp-brand"><Logo /><p>{TAGLINE}</p></div>
        <Cols />
        <Fine />
      </footer>
    </section>
  );
}

/* F - split: the claim in a gradient panel on the left, the whole footer in a grey panel on the right, same height. */
function Split() {
  return (
    <section className="fp fpF" aria-labelledby="fpF-t">
      <Knot />
      <div className="fpF-grid">
        <div className="fpF-claim">
          <Rise as="h2" id="fpF-t">{CLAIM}</Rise>
          <Beliefs />
          <div className="ctas"><Assess /><a className="btn ghost" href="#price">See pricing</a></div>
        </div>
        <footer className="fpF-foot">
          <div className="fp-brand"><Logo /><p>{TAGLINE}</p></div>
          <div className="fpF-cols"><Cols /></div>
          <Fine />
        </footer>
      </div>
    </section>
  );
}

/* G - photo floor: the claim on white, the photo strip full-bleed, the footer card overlapping the photos. */
function PhotoFloor() {
  return (
    <section className="fp fpG" aria-labelledby="fpG-t">
      <Knot />
      <Rise><Beliefs /></Rise>
      <Rise as="h2" id="fpG-t">{CLAIM}</Rise>
      <Rise className="ctas"><Assess /><a className="btn ghost" href="#price">See pricing</a></Rise>
      <div className="fpG-strip" aria-hidden="true">
        {STRIP.map((src, i) => <div key={i}><Image src={src} alt="" sizes="(min-width: 900px) 12vw, 45vw" placeholder="blur" /></div>)}
      </div>
      <div className="fpG-floor">
        <footer className="fp-card">
          <div className="fp-brand"><Logo /><p>{TAGLINE}</p></div>
          <Cols />
          <Fine />
        </footer>
      </div>
    </section>
  );
}

/* H - index rows: no columns. The next steps are full-width rows; everything else is one line at the bottom. */
const ROWS: L[] = [
  { label: "See pricing", href: "#price" },
  { label: "Read why we built it", href: "/our-story" },
  { label: "Guides for BC parents", href: "/resources" },
  { label: "Ask us anything", href: SUPPORT_HREF },
];
function IndexRows() {
  return (
    <section className="fp fpH" aria-labelledby="fpH-t">
      <Knot />
      <Rise as="h2" id="fpH-t">{CLAIM}</Rise>
      <Beliefs />
      <ol className="fpH-rows">
        <li><button className="fpH-row primary" data-open data-src="close"><span className="n">01</span><span className="t">Take free assessment</span><span className="arr" aria-hidden="true">→</span></button></li>
        {ROWS.map((r, i) => (
          <li key={r.label}><A className="fpH-row" href={r.href}><span className="n">0{i + 2}</span><span className="t">{r.label}</span><span className="arr" aria-hidden="true">→</span></A></li>
        ))}
      </ol>
      <footer className="fpH-foot">
        <Logo />
        <nav aria-label="Site information">
          {[...GROUPS[0].links, ...GROUPS[1].links.slice(1), ...GROUPS[2].links.slice(1)].map((l) => <A key={l.label} href={l.href}>{l.label}</A>)}
        </nav>
        <Fine />
      </footer>
    </section>
  );
}

/* 0 - what ships today, for comparison. */
function Current() {
  return (
    <>
      <Closing />
      <Footer />
    </>
  );
}

const VARIANTS = [
  { key: "0", name: "Current", node: <Current /> },
  { key: "A", name: "Blue band + card (reference)", node: <BandCard /> },
  { key: "B", name: "Gradient field + card", node: <GradientCard /> },
  { key: "C", name: "Giant wordmark", node: <Wordmark /> },
  { key: "D", name: "Notebook page", node: <Notebook /> },
  { key: "E", name: "Ink band", node: <Ink /> },
  { key: "F", name: "Split panels", node: <Split /> },
  { key: "G", name: "Photo floor", node: <PhotoFloor /> },
  { key: "H", name: "Index rows", node: <IndexRows /> },
];

export function EndingPrototype() {
  return <EndingSwitch variants={VARIANTS.map(({ key, name }) => ({ key, name }))} nodes={Object.fromEntries(VARIANTS.map((v) => [v.key, v.node]))} fallback="A" />;
}
