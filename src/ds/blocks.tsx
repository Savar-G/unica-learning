// Unica Learning design system: cards, lists and page-level blocks.
import type * as React from "react";
import type { CSSProperties, ReactNode } from "react";
import { Button, Logo, type Tone, type Vars } from "./basics";
import { ProgressReport, WorkbookPage } from "./product";

/* ------------------------------------------------------------------ steps */

export interface StepGridProps {
  /** StepCard children. Lays them out 1 / 2 / 3 columns by width. */
  children?: ReactNode;
}

/** Ordered grid for the six "How it works" steps. */
export function StepGrid({ children }: StepGridProps) {
  return <ol className="steps">{children}</ol>;
}

export interface StepCardProps {
  /** Two-digit step number, e.g. "01". */
  number: string;
  title: string;
  /** One or two sentences describing the step. */
  children?: ReactNode;
  /** Visual at the bottom of the card: a Photo, Mailer, PhoneScan or WorkbookPage. */
  visual?: ReactNode;
  /** `paper` = warm grey backdrop for a drawn WorkbookPage; `photo` = edge-to-edge. */
  visualTone?: "photo" | "paper";
  className?: string;
  style?: React.CSSProperties;
}

/** Soft grey card with a coloured corner square, step number, title, text and a visual. Use inside StepGrid. */
export function StepCard({ number, title, children, visual, visualTone = "photo", className = "", style }: StepCardProps) {
  return (
    <li className={`step ${className}`.trim()} style={style}>
      <div className="top">
        <span className="num">{number}</span>
        <span className="sq" />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {visual && <div className={`vis${visualTone === "paper" ? " dk" : ""}`}>{visual}</div>}
    </li>
  );
}

/* --------------------------------------------------------------- features */

export interface FeatureGridProps {
  children?: ReactNode;
}

/** Four-up grid for FeatureCards ("Why choose Unica Learning?"). */
export function FeatureGrid({ children }: FeatureGridProps) {
  return <div className="why">{children}</div>;
}

export interface FeatureCardProps {
  /** 1-4: sets the label ("01") and which gradient colours rise from the bottom. */
  index: 1 | 2 | 3 | 4;
  title: string;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Tall grey card with a grainy colour field at the bottom. Use inside FeatureGrid. */
export function FeatureCard({ index, title, children, className = "", style }: FeatureCardProps) {
  return (
    <div className={`c${index} ${className}`.trim()} style={style}>
      <span className="n">0{index}</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- included */

const ICONS = {
  test: <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h5M8 16l2 2 4-4" /></svg>,
  book: <svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 7h6" /></svg>,
  box: <svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></svg>,
  cam: <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="3" /><circle cx="12" cy="13" r="3.5" /><path d="M9 6l1.5-2h3L15 6" /></svg>,
  chart: <svg viewBox="0 0 24 24"><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></svg>,
  layers: <svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>,
  shield: <svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>,
  lock: <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  calendar: <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /><path d="M10 14v4M14 14v4" /></svg>,
  undo: <svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>,
  pencil: <svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></svg>,
  voice: <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
} as const;

export type IconName = keyof typeof ICONS;

export interface IncludedCardProps {
  /** A key of ICONS: test, book, box, cam, chart, layers, shield, lock, calendar, undo, pencil or voice. */
  icon: IconName;
  title: string;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Small grey card with a line icon on a white tile, a title and one line of text. */
export function IncludedCard({ icon, title, children, className = "", style }: IncludedCardProps) {
  return (
    <div className={`card ${className}`.trim()} style={style}>
      <div className="ic" aria-hidden="true">{ICONS[icon]}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- pricing */

export interface PlanGridProps {
  children?: ReactNode;
}

/** Two-column grid for PlanCards. */
export function PlanGrid({ children }: PlanGridProps) {
  return <div className="plans">{children}</div>;
}

export interface PlanCardProps {
  name: string;
  /** One line under the name, e.g. "Grades 1-7, ages 6-12". */
  note?: string;
  price: number;
  currency?: string;
  period?: string;
  features: string[];
  ctaLabel: string;
  /** Featured plan: white card with a grainy colour wash rising from the bottom and a solid button. */
  featured?: boolean;
  onSelect?: () => void;
  /** Replace the default button entirely (e.g. a button wired to a checkout dialog). */
  cta?: ReactNode;
  /**
   * A first-month offer, marked like a teacher's correction: the price crossed out in red pen with the offer price
   * written beside it, and a line for the price after. E.g. { price: "69.30", note: "first month, 30% off!", then: "Then CAD 99 a month." }
   */
  offer?: { price: string; note: string; then: string };
  className?: string;
  style?: React.CSSProperties;
}

/** White pricing card: name, note, big light price, checklist, full-width button. */
export function PlanCard({ name, note, price, currency = "CAD", period = "/ month", features, ctaLabel, featured = false, onSelect, cta, offer, className = "", style }: PlanCardProps) {
  return (
    <div className={`plan${featured ? " hl" : ""} ${className}`.trim()} style={style}>
      <div className="plan-head">
        <h3>{name}</h3>
        {note && <p className="small">{note}</p>}
        {offer ? (
          <>
            <div className="plan-offer">
              <s className="price">
                <span className="sr-only">Regular price </span>
                {currency} {price}
                <svg className="pen-strike" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M4 30 C 50 22, 120 16, 196 8" />
                </svg>
              </s>
              <p className="pen-price">
                <span className="sr-only">{currency} </span>
                <span>{offer.price}</span>
                <small>{offer.note}</small>
              </p>
            </div>
            <p className="plan-then">{offer.then}</p>
          </>
        ) : (
          <div className="price">
            {currency} {price}
            <small> {period}</small>
          </div>
        )}
      </div>
      <ul>
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {cta ?? (
        <Button variant={featured ? "primary" : "ghost"} onClick={onSelect}>
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- founders */

export interface FounderGridProps {
  children?: ReactNode;
}

/** Side-by-side row of FounderCards. */
export function FounderGrid({ children }: FounderGridProps) {
  return <div className="duo">{children}</div>;
}

export interface FounderCardProps {
  name: string;
  role?: string;
  /** Large initial shown on the gradient square (stands in for a photo). */
  initial?: string;
  /** `warm` = yellow/peach field; `cool` = blue/mint field. */
  field?: "warm" | "cool";
  /** Optional portrait URL; replaces the initial. */
  photo?: string;
}

/** Founder tile: gradient square with an initial (or a photo) and a name/role caption. */
export function FounderCard({ name, role = "Co-founder", initial, field = "warm", photo }: FounderCardProps) {
  return (
    <div className={`who${field === "cool" ? " cool" : ""}`}>
      <div className="face">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initial ?? name.charAt(0)
        )}
      </div>
      <div className="cap">
        <b>{name}</b>
        {role}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- FAQ */

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

export interface FaqProps {
  items: FaqItem[];
  /** Index of the item open on first render. */
  defaultOpen?: number;
}

/** Accordion of questions with square +/× toggles (native details/summary). */
export function Faq({ items, defaultOpen }: FaqProps) {
  return (
    <div className="faq">
      {items.map((it, i) => (
        <details key={it.question} open={i === defaultOpen}>
          <summary>
            {it.question}
            <span className="pm" aria-hidden="true" />
          </summary>
          <p>{it.answer}</p>
        </details>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- beliefs */

export interface BeliefItem {
  text: ReactNode;
  color?: Tone;
}

export interface BeliefListProps {
  items: BeliefItem[];
}

const TONE_VAR: Record<Tone, string> = { sun: "var(--sun)", sky: "var(--sky)", tang: "var(--tang)", leaf: "var(--leaf)" };

/** Three short belief statements on translucent white tiles, each with a colour square. */
export function BeliefList({ items }: BeliefListProps) {
  return (
    <ul className="beliefs">
      {items.map((b, i) => (
        <li key={i}>
          <i style={{ background: TONE_VAR[b.color ?? "sun"] }} />
          <span>{b.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------- gradient panel */

export interface GradientPanelProps {
  children?: ReactNode;
  /** Centre the content (closing call to action). */
  center?: boolean;
  className?: string;
}

/**
 * Inset rounded panel on a grainy warm gradient (sun, peach, sky). The page itself stays white;
 * colour lives inside panels like this one.
 */
export function GradientPanel({ children, center = true, className = "" }: GradientPanelProps) {
  return <div className={`close-in panel${center ? " center" : ""} ${className}`.trim()}>{children}</div>;
}

/* --------------------------------------------------------------------- nav */

export interface NavLink {
  label: string;
  href: string;
}

export interface NavProps {
  brand?: string;
  /** Where the wordmark links. "#top" on the home page; "/" on other pages. */
  home?: string;
  links?: NavLink[];
  ctaLabel?: string;
  onCta?: () => void;
  /** Replace the default call-to-action button. */
  cta?: ReactNode;
}

/** Sticky top bar: wordmark, section links (desktop) and a small primary button. */
export function Nav({
  brand = "Unica Learning",
  home = "#top",
  links = [
    { label: "How it works", href: "#how" },
    { label: "Pricing", href: "#price" },
    { label: "FAQ", href: "#faq" },
  ],
  ctaLabel = "Get started",
  onCta,
  cta,
}: NavProps) {
  return (
    <nav className="nav" aria-label="Main">
      <div className="in">
        <Logo brand={brand} href={home} />
        <ul>
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href}>{l.label}</a>
            </li>
          ))}
        </ul>
        {cta ?? (
          <Button size="sm" arrow={false} onClick={onCta}>
            {ctaLabel}
          </Button>
        )}
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------- hero */

export interface HeroProps {
  eyebrow?: ReactNode;
  /** Grey first part of the headline. */
  title?: ReactNode;
  /** Ink part of the headline, drawn with the yellow highlighter. */
  highlight?: ReactNode;
  /** Words after the highlight, styled like `title`. */
  after?: ReactNode;
  /** Problem line directly above the headline (a paragraph, not a heading). Empty by default. */
  kicker?: ReactNode;
  lead?: ReactNode;
  /** Buttons row (usually a primary and a ghost Button). */
  actions?: ReactNode;
  /** Short facts in mono under the buttons. */
  meta?: string[];
  /** Hero photo URL (or pass `media` to supply your own node). */
  imageSrc?: string;
  imageAlt?: string;
  media?: ReactNode;
  /** Card floating on the lower left of the photo; defaults to a ProgressReport. Pass null to hide. */
  report?: ReactNode | null;
  /** Card floating on the lower right; defaults to a marked WorkbookPage. Pass null to hide. */
  page?: ReactNode | null;
  /** Play the entrance animation and let the site's scroll observer draw the highlight. */
  animate?: boolean;
  id?: string;
  className?: string;
}

/** Page hero: left-aligned light headline with a highlighted word, CTAs, mono meta, and a photo in a moving colour field. */
export function Hero({
  eyebrow = "The future of learning is on paper.",
  title = "Personalized. Delivered.",
  highlight = "Mastered.",
  after,
  kicker = "",
  lead = "Math workbooks made for your child, mailed home, and adapted after every book.",
  actions,
  meta = [],
  imageSrc,
  imageAlt = "",
  media,
  report,
  page,
  animate = false,
  id,
  className = "",
}: HeroProps) {
  const reportNode = report === undefined ? <ProgressReport animate={animate} /> : report;
  const pageNode = page === undefined ? <WorkbookPage /> : page;
  return (
    <header id={id} className={`hero hero-c${animate ? " enter" : ""} ${className}`.trim()}>
      <div className="txt">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {kicker && <p className="kicker">{kicker}</p>}
        <h1>
          {title && <span className="pre">{title}</span>} {highlight && <span className={animate ? "mark" : "mark is-in"}>{highlight}</span>}
          {after && <> <span className="pre">{after}</span></>}
        </h1>
        {lead && <p className="lead">{lead}</p>}
        {actions && <div className="ctas">{actions}</div>}
        {meta.length > 0 && (
          <p className="meta">
            {meta.map((m, i) => (
              <span key={m}>
                {i > 0 && <i />}
                {m}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="stage">
        <div className="ph big">
          {media ?? (
            // eslint-disable-next-line @next/next/no-img-element
            imageSrc && <img src={imageSrc} alt={imageAlt} />
          )}
        </div>
        {pageNode && <div className="fl pg" data-speed="-.08">{pageNode}</div>}
        {reportNode && <div className="fl rp" data-speed=".06">{reportNode}</div>}
      </div>
    </header>
  );
}

export type { Vars };
