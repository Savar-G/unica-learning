// PROTOTYPE (throwaway): four hero variants for `/`, switchable with `?variant=`.
// Question: "What should the hero look like if it shows the real workbook instead of a photo?"
// Reference: a Spruce-style split hero (text left, product in a soft gradient panel, cropped by its edge).
// Copy is the approved hero copy (D-070); only layout and the visual change. Pick one, then rebuild it properly.
import Link from "next/link";
import type { ReactNode } from "react";
import { SwapWord } from "@/ds";
import { StartLink } from "@/components/start-link";
import { Hero, TOPICS } from "@/components/sections";
import { HERO } from "@/lib/site";
import { Booklet, Day1Page, Day1PageTwo, PAGES, Pencil, Sheet, Spread } from "./workbook";
import { NameHero } from "./name-hero";
import { PrototypeSwitcher, type VariantInfo } from "./switcher";
import "../whats-included.css";
import "./hero-prototype.css";

export const VARIANTS: VariantInfo[] = [
  { key: "a", label: "Panel, cropped spread" },
  { key: "b", label: "Type a name" },
  { key: "c", label: "Text above, open book" },
  { key: "d", label: "Colour field, page fan" },
  { key: "current", label: "Live hero today" },
];

export function pickVariant(v: string | string[] | undefined) {
  const k = Array.isArray(v) ? v[0] : v;
  return VARIANTS.some((x) => x.key === k) ? (k as string) : "a";
}

function Title() {
  return (
    <h1>
      {HERO.title} <span className="mark is-in">{HERO.highlight}</span> {HERO.after}
    </h1>
  );
}

function Lead() {
  return <p className="lead"><span className="nowrap">Miss <SwapWord words={TOPICS} /></span> {HERO.lead}</p>;
}

function Ctas({ src }: { src: string }) {
  return (
    <div className="ctas">
      <StartLink src={src}>Take free assessment <span className="arr" aria-hidden="true">→</span></StartLink>
      <Link className="btn ghost" href="/sample-report">See a sample report</Link>
    </div>
  );
}

function Facts({ className = "" }: { className?: string }) {
  return (
    <ul className={`hp-facts ${className}`.trim()}>
      <li>Free assessment</li>
      <li>First month free</li>
      <li>Cancel anytime</li>
    </ul>
  );
}

function Badge({ tag, children, href }: { tag: string; children: ReactNode; href: string }) {
  return (
    <Link className="hp-badge" href={href}>
      <b>{tag}</b>{children}<span aria-hidden="true">→</span>
    </Link>
  );
}

/* A: Spruce's split. Text left; on the right a soft grain panel with Leah's open workbook, cropped by the panel's
   right edge and faded at the bottom. */
function VariantA() {
  return (
    <header id="top" className="hp hp-a">
      <div className="hp-a-txt">
        <Badge tag="Ages 5-14" href="#how">A personalized math program</Badge>
        <Title />
        <Lead />
        <Ctas src="hero-proto-a" />
        <Facts />
      </div>
      <div className="hp-a-panel" role="img" aria-label="Leah's workbook, open at Day 1, with her pencil answers">
        <div className="hp-a-fade">
          <Spread className="hp-a-book" left={<Day1Page w={360} />} right={<Day1PageTwo w={360} />} />
          <Pencil className="hp-a-pencil" />
        </div>
      </div>
    </header>
  );
}

/* B: The parent's own child. The Spruce email bar becomes a first-name field; the cover changes to that name. */
function VariantB() {
  return (
    <NameHero
      head={<><p className="eyebrow">{HERO.kicker}</p><Title /><Lead /></>}
      foot={<Facts />}
      behind={
        <>
          <Sheet src={PAGES.plan} className="hp-b-back" />
          <Pencil className="hp-b-pencil" />
        </>
      }
    />
  );
}

/* C: Text centred above one wide grain panel. The workbook lies open in it and runs off the bottom edge. */
function VariantC() {
  return (
    <header id="top" className="hp hp-c">
      <div className="hp-c-txt">
        <Badge tag="How it works" href="#how">Every workbook is built from your child&apos;s last one</Badge>
        <Title />
        <Lead />
        <Ctas src="hero-proto-c" />
        <Facts />
      </div>
      <div className="hp-c-panel" role="img" aria-label="Leah's workbook lying open at her plan and Day 1, with her pencil answers">
        <span className="hp-c-tag"><i />Workbook 01 · Made for Leah</span>
        <Spread className="hp-c-book" left={<Sheet src={PAGES.plan} />} right={<Day1Page w={440} />} />
        <Pencil className="hp-c-pencil" />
      </div>
    </header>
  );
}

/* D: The whole hero is the colour field. Text on the field; on the right the cover leads a fan of pages that
   bleeds off the bottom. */
function VariantD() {
  return (
    <div className="hp-d-wrap">
      <header id="top" className="hp hp-d">
        <div className="hp-d-txt">
          <p className="eyebrow">{HERO.kicker}</p>
          <Title />
          <Lead />
          <Ctas src="hero-proto-d" />
          <Facts className="on-field" />
        </div>
        <div className="hp-d-stage" role="img" aria-label="Leah's workbook cover with two of her pages fanned behind it">
          <Sheet src={PAGES.p3} className="hp-d-p hp-d-p3" />
          <div className="hp-d-p hp-d-p2"><Day1PageTwo w={400} /></div>
          <Booklet className="hp-d-p hp-d-cover"><Sheet src={PAGES.cover} /></Booklet>
          <Pencil className="hp-d-pencil" />
        </div>
      </header>
    </div>
  );
}

export function HeroPrototype({ variant }: { variant: string }) {
  return (
    <>
      {variant === "a" && <VariantA />}
      {variant === "b" && <VariantB />}
      {variant === "c" && <VariantC />}
      {variant === "d" && <VariantD />}
      {variant === "current" && <Hero />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}
