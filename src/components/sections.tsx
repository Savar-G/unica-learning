// Landing page sections, composed from the Unica Learning design system (src/ds).
// Site-only concerns stay here: next/image photos, scroll reveals (Rise/Knot), and the
// links to /start, the signup for the free online math assessment (#82).
import type { ReactNode } from "react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { HeroWorkbook } from "@/components/hero-workbook";
import "@/components/hero-workbook.css";
import "@/components/statement.css";
import { FaqMore } from "@/components/faq-more";
import { StartLink, StartNote } from "@/components/start-link";
import { ADDITIONAL_CHILD_PRICE, BRAND, HERO, OFFER_ENDS, PLANS, SOCIAL_LINKS, cad } from "@/lib/site";
import { FAQ } from "@/lib/faq";
import {
  BeliefList,
  Eyebrow,
  Faq as FaqList,
  Highlight,
  IncludedCard,
  Nav as NavBar,
  PlanCard,
  PlanGrid,
  Section,
  SectionHeader,
  type IconName,
} from "@/ds";
import { HomeCompare } from "./compare";
import { Knot, Rise, type Vars } from "./drawn";

import adapt4 from "@/assets/img/loop-adapt-4.jpg";
import heroHome2 from "@/assets/img/hero-home-2.jpg";
import emo4 from "@/assets/img/emotion-4.jpg";
import emo5 from "@/assets/img/emotion-5.jpg";
import emo7 from "@/assets/img/emotion-7.jpg";
import emo9 from "@/assets/img/emotion-9.jpg";
import emo10 from "@/assets/img/emotion-10.jpg";
import emo11 from "@/assets/img/emotion-11.jpg";

/** The main call to action (D-041): the free online math assessment, before any plan or card (#82). */
export const START_LABEL = "Take free assessment";

function GetStarted({ src }: { src: string }) {
  return <StartLink src={src}>{START_LABEL} <span className="arr">→</span></StartLink>;
}

const d = (s: number) => ({ "--d": `${s}s` }) as Vars;

export function Nav() {
  return <NavBar brand={BRAND} links={[{ label: "How it works", href: "#how" }, { label: "What's included", href: "/whats-included" }, { label: "Curriculum", href: "/curriculum" }, { label: "Pricing", href: "#price" }, { label: "FAQ", href: "#faq" }]} cta={<StartLink className="btn sm" src="nav">Free assessment</StartLink>} />;
}

// Hero (D-214, cleaned up in D-215): a plain kicker line, the headline, the lead, the buttons and the facts on the left;
// the sample workbook on the closing section's grainy field on the right.
const HERO_FACTS = ["Free assessment", "First month free", "Cancel anytime"];

export function Hero() {
  return (
    <header id="top" className="hero hero-wb">
      <div className="txt">
        <p className="kicker">{HERO.kicker}</p>
        <h1>{HERO.title} <span className="mark">{HERO.highlight}</span> {HERO.after}</h1>
        <p className="lead">{HERO.lead}</p>
        <div className="ctas">
          <GetStarted src="hero" />
          <Link className="btn ghost" href="/sample-report">See a sample report</Link>
        </div>
        <ul className="facts">{HERO_FACTS.map((f) => <li key={f}>{f}</li>)}</ul>
      </div>
      <HeroWorkbook />
    </header>
  );
}

// The one-line statement after the hero (D-215, after the Spruce quote block): the set program, then what Unica does
// (in ink), then how. Compares with a category, never a brand (D-064).
export function Statement() {
  return (
    <section className="statement" aria-label="How Unica is different">
      <Rise as="p">
        Learning centres follow a set program. <strong>Unica personalizes your child&apos;s learning.</strong> Each workbook
        builds on the last one: more practice where they struggled, and new challenges when they are ready.
      </Rise>
    </section>
  );
}

// Program parts first, the workbook last (D-095). The left column reads first, then the photo, then the right column.
const DRIFT: [StaticImageData, number, number, number, number, number, number, boolean][] = [
  [adapt4, 3, 7, 15, 21, 0.14, -4, false], [emo9, 23, 8, 12, 17, -0.1, 3, true],
  [emo5, 79, 5, 17, 22, 0.18, 4, false], [heroHome2, 62, 7, 12, 16, -0.14, -3, true],
  [emo4, 3, 70, 15, 19, -0.18, 3, false], [emo7, 80, 66, 17, 22, 0.1, -4, false],
  [emo11, 22, 78, 13, 16, 0.12, -2, true], [emo10, 64, 79, 13, 16, -0.1, 4, true],
];

// Hidden from the home page (2026-11-02); kept here to bring back later. Render <Feel /> in landing.tsx to restore.
export function Feel() {
  return (
    <Section className="feel" aria-labelledby="feelT">
      <Knot />
      {DRIFT.map(([src, l, t, w, h, s, r, hide], i) => (
        <div key={i} className={`drift${hide ? " hide-sm" : ""}`} aria-hidden="true" data-speed={s} style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, "--r": `${r}deg` } as Vars}>
          <div className="ph"><Image src={src} alt="" sizes="(min-width: 760px) 18vw, 40vw" placeholder="blur" /></div>
        </div>
      ))}
      <Rise className="msg">
        <h2 id="feelT">A program made for one child: yours.</h2>
        <p className="lead">Your child&apos;s program starts from the assessment. After that, it&apos;s shaped by their progress.</p>
      </Rise>
    </Section>
  );
}

// One list for the home page and /our-story, so the promise text cannot drift apart.
export const PROMISE: [IconName, string, string][] = [
  ["shield", "First month free", "Your first month of workbooks is free. Cancel before day 30 and you pay nothing. We email you 7 days before the first charge."],
  ["calendar", "Fits your family's schedule", "Kids are busy. Take a week or a month off, and pick up where your child left off."],
  ["test", "Free assessment, nothing to pay today", "Your child takes the free online math assessment before you choose a plan. Adding a card charges nothing."],
  ["undo", "Cancel anytime", "No contract. Stop whenever you want."],
];

// The home page shows the first two; pricing already says "free assessment" and "cancel anytime".
const HOME_PROMISE = PROMISE.slice(0, 2);

export function PromiseCards({ items = PROMISE }: { items?: [IconName, string, string][] }) {
  return (
    <div className="promise">
      {items.map(([icon, title, text], i) => (
        <IncludedCard key={title} icon={icon} title={title} className="rise" style={d(i * 0.06)}>
          {text}
        </IncludedCard>
      ))}
    </div>
  );
}

export function OurPromise() {
  return (
    <Section id="promise" aria-labelledby="promiseT">
      <Knot />
      <div className="found">
        <Rise>
          <Eyebrow>Our promise</Eyebrow>
          <h2 id="promiseT" style={{ margin: "16px 0 20px" }}>Try it with nothing to lose.</h2>
          <p className="lead">{BRAND} is made in Vancouver by two students who tutored kids in math and grew up doing learning programs. They saw both sides: learning centres that gave every child the same pages, and tutoring most families could only afford for an hour a week. So they built the middle: personal, on paper, and affordable.</p>
          <p style={{ margin: "18px 0 0" }}>
            <Link href="/our-story" style={{ fontWeight: 500, textUnderlineOffset: 4 }}>Read why we built it →</Link>
          </p>
        </Rise>
        <PromiseCards items={HOME_PROMISE} />
      </div>
    </Section>
  );
}

export function Pricing() {
  return (
    <Section id="price" aria-labelledby="priceT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="Pricing" title="A learning centre's structure. A plan built for your child. A fraction of the price." titleId="priceT" />
        <p className="g-line">
          <span className="offer-flag">Limited-time offer</span>
          Try it <Highlight>free for a month.</Highlight> Offer ends {OFFER_ENDS}.
        </p>
      </Rise>
      <PlanGrid>
        <PlanCard
          className="rise"
          featured
          name={PLANS.one.name}
          note={PLANS.one.note}
          price={PLANS.one.price}
          offer={{ price: "Free", note: "your first month!", then: `Then CAD ${cad(PLANS.one.price)} a month.` }}
          priceNote={<>Additional children: CAD {cad(ADDITIONAL_CHILD_PRICE)}/month each</>}
          features={[
            "Free online math assessment and report, before you choose a plan",
            "A program built from your child's level and gaps",
            "2 paper workbooks a month, mailed home",
            "The Unica Teaching Assistant: help out loud when they're stuck",
            "The parent app: instant answer checks, solutions and progress reports",
            "Rewards for every page and every week",
            "Delivery included. Cancel anytime",
          ]}
          more={<Link href="/whats-included" className="more-link">See everything that&apos;s included <span aria-hidden="true">→</span></Link>}
          ctaLabel={START_LABEL}
          cta={<div className="plan-cta"><GetStarted src="price" /><StartNote /></div>}
        />
      </PlanGrid>
    </Section>
  );
}

/** How we compare (D-219): its own section after Pricing. The link under the title opens /compare (D-114). */
export function Compare() {
  return (
    <Section id="compare" aria-labelledby="compareT">
      <Knot />
      <Rise>
        <SectionHeader className="hc-head-block" eyebrow="How we compare" title="Tutor, learning centre or Unica?" titleId="compareT" />
        <Link className="hc-full" href="/compare">See the full comparison <span aria-hidden="true">→</span></Link>
      </Rise>
      <Rise>
        <HomeCompare />
      </Rise>
    </Section>
  );
}

export function Faq() {
  return (
    <Section id="faq" aria-labelledby="faqT">
      <Knot />
      <Rise>
        <SectionHeader className="faq-head" eyebrow="FAQ" title="Questions, answered." titleId="faqT" lead={<>Have another question? <Link href="/contact">Contact us</Link> and we will write back.</>} />
      </Rise>
      <FaqList items={FAQ} />
      <FaqMore />
    </Section>
  );
}

const CLOSING_BELIEFS = [
  { text: "Every child learns differently. Learning should adapt.", color: "sun" },
  { text: "No child should fall behind because the class moved on.", color: "sky" },
  { text: "Personal, on paper, and affordable.", color: "tang" },
] as const;

/** The closing claim. Rendered inside <Footer>, in the same colour field as the footer card (D-080). */
export function Closing() {
  return (
    <section className="close" aria-labelledby="closeT">
      <Rise>
        <BeliefList items={[...CLOSING_BELIEFS]} />
      </Rise>
      <Rise as="h2" id="closeT">This is what learning should be like.</Rise>
      <Rise className="ctas">
        <GetStarted src="close" />
        <a className="btn ghost" href="#price">See pricing</a>
        <StartNote />
      </Rise>
    </section>
  );
}

/** Last pencil-thread knot. The thread lives in <main>, and the closing now sits after it, in the footer field. */
export function ThreadEnd() {
  return (
    <div className="thread-end">
      <Knot />
    </div>
  );
}

const FOOTER_GROUPS: { title: string; links: { label: string; href: string }[] }[] = [
  { title: "Learn", links: [{ label: "How it works", href: "/#how" }, { label: "What's included", href: "/whats-included" }, { label: "Pricing", href: "/pricing" }, { label: "Free math assessment", href: "/math-assessment" }, { label: "FAQ", href: "/#faq" }, { label: "How we compare", href: "/compare" }, { label: "Curriculum", href: "/curriculum" }] },
  { title: "Company", links: [{ label: "Our story", href: "/our-story" }, { label: "Rewards", href: "/rewards" }, { label: "Resources", href: "/resources" }, { label: "Blog", href: "/blog" }] },
  { title: "Help", links: [{ label: "Contact us", href: "/contact" }, { label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }] },
];

const SOCIAL_ICONS: Record<(typeof SOCIAL_LINKS)[number]["id"], ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M5.4 9.4h3.1V19H5.4V9.4zM6.9 4.7a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6zM10.4 9.4h3v1.3c.4-.8 1.4-1.6 3-1.6 3.1 0 3.7 2 3.7 4.7V19H17v-4.6c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4V19h-3.1V9.4z" />
    </svg>
  ),
};

/** Site footer (D-080): a white link card inside a grainy colour field. The home page passes <Closing /> as children. */
export function Footer({ children }: { children?: ReactNode }) {
  return (
    <div className={`ending${children ? " has-close" : ""}`}>
      <div className="ending-field">
        {children}
        <footer className="foot">
          <div className="foot-brand">
            <a className="logo" href="#top">{BRAND}<b /></a>
            <p>A personalized math learning program for ages 5 to 14.</p>
            <ul className="foot-social" aria-label="Social media">
              {SOCIAL_LINKS.map((l) => (
                <li key={l.id}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`${BRAND} on ${l.label}`}>{SOCIAL_ICONS[l.id]}</a>
                </li>
              ))}
            </ul>
          </div>
          {FOOTER_GROUPS.map((g) => (
            <nav className="foot-col" key={g.title} aria-label={g.title}>
              <h2>{g.title}</h2>
              <ul>
                {g.links.map((l) => (
                  <li key={l.label}>{l.href.startsWith("/") && !l.href.startsWith("/#") ? <Link href={l.href}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}</li>
                ))}
              </ul>
            </nav>
          ))}
          <div className="foot-fine">
            <span>© 2026 {BRAND}</span>
            <span>Made in Vancouver, BC</span>
            <span>First month free</span>
            <span>Cancel anytime</span>
            <CookieSettingsButton />
          </div>
        </footer>
      </div>
    </div>
  );
}
