// PROTOTYPE (throwaway): realistic paper pieces for the hero variants. They reuse Leah's real sample pages
// (public/whats-included/wb, the same renders as the What's included page) and add paper grain, page edges,
// staples, a gutter shadow and a pencil, so the workbook reads as a printed object, not a flat card.
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { MarkedPage, PageTwo } from "@/components/whats-included-parts";

const WB = "/whats-included/wb";
export const PAGES = {
  cover: `${WB}/leah-01-cover.jpg`,
  plan: `${WB}/leah-02-plan.jpg`,
  p3: `${WB}/leah-05-d1p3.jpg`,
};

/** One printed page: a page image (or children) with grain and light. */
export function Sheet({ src, children, className = "", style }: { src?: string; children?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`hp-sheet ${className}`.trim()} style={style}>
      {src ? <Image src={src} alt="" width={880} height={1139} sizes="(min-width: 900px) 480px, 80vw" /> : children}
    </div>
  );
}

/** A closed, saddle-stitched booklet: the cover with a page stack and a spine fold. */
export function Booklet({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`hp-booklet ${className}`.trim()} style={style}>
      {children}
      <i className="hp-fold" aria-hidden="true" />
    </div>
  );
}

/** Leah's Day 1 pages with her pencil answers. `w` is the width of one page in px. */
export function Day1Page({ w }: { w: number }) {
  return <Sheet><MarkedPage width={w} name /></Sheet>;
}
export function Day1PageTwo({ w }: { w: number }) {
  return <Sheet><PageTwo width={w} /></Sheet>;
}

/** An open workbook: two leaves, a gutter shadow, two staples and page edges on the outer sides. */
export function Spread({ left, right, className = "", style }: { left: ReactNode; right: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`hp-spread ${className}`.trim()} style={style}>
      <div className="hp-leaf l">{left}</div>
      <div className="hp-leaf r">{right}</div>
      <i className="hp-staple" style={{ top: "26%" }} aria-hidden="true" />
      <i className="hp-staple" style={{ top: "72%" }} aria-hidden="true" />
    </div>
  );
}

/** A yellow HB pencil, drawn at 520 x 30; size it with CSS width. */
export function Pencil({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={`hp-pencil ${className}`.trim()} style={style} viewBox="0 0 520 34" aria-hidden="true">
      <defs>
        <linearGradient id="hpBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset=".34" stopColor="#ffc93c" />
          <stop offset=".36" stopColor="#f2b52a" />
          <stop offset=".66" stopColor="#f2b52a" />
          <stop offset=".68" stopColor="#e09d17" />
          <stop offset="1" stopColor="#c9860c" />
        </linearGradient>
        <linearGradient id="hpMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f4f6" />
          <stop offset=".45" stopColor="#b9bbc2" />
          <stop offset="1" stopColor="#7d8089" />
        </linearGradient>
        <linearGradient id="hpWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dcb4" />
          <stop offset="1" stopColor="#d6aa72" />
        </linearGradient>
        <linearGradient id="hpRub" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb3b3" />
          <stop offset="1" stopColor="#e57c86" />
        </linearGradient>
      </defs>
      <rect x="2" y="3" width="36" height="28" rx="7" fill="url(#hpRub)" />
      <rect x="30" y="2" width="40" height="30" fill="url(#hpMetal)" />
      {[38, 46, 54, 62].map((x) => <rect key={x} x={x} y="2" width="2" height="30" fill="#8d9098" opacity=".55" />)}
      <rect x="70" y="3" width="372" height="28" fill="url(#hpBody)" />
      <path d="M442 3 L500 15.5 L500 18.5 L442 31 Z" fill="url(#hpWood)" />
      <path d="M486 12.5 L516 17 L486 21.5 Z" fill="#34353b" />
      <text x="110" y="21" fill="#8a5a06" fontFamily="var(--mono), monospace" fontSize="10" letterSpacing="1.5" opacity=".7">UNICA · HB · 2</text>
    </svg>
  );
}

/** The real cover, rebuilt in HTML at 880 px wide so the name can change (variant B). Size it with `zoom`. */
export function NamedCover({ name, zoom }: { name: string; zoom: number }) {
  const who = name || "Leah";
  const whose = /s$/i.test(who) ? `${who}'` : `${who}'s`;
  return (
    <div className="hp-cover" style={{ zoom }}>
      <div className="hp-cover-top"><span className="hp-wm">Unica Learning<i /></span><span className="hp-mono">Workbook 01 · 10 days</span></div>
      <div className="hp-cover-mk" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
      <p className="hp-cover-for">Made for <b>{who}</b> · Level U10 · Adding and subtracting to 1000</p>
      <p className="hp-cover-t">Carrying and<br /><mark>borrowing</mark></p>
      <div className="hp-cover-box">
        <span className="hp-mono">Made from {whose} assessment</span>
        <p>On Sep 22, {who} added well but slowed down when a subtraction needed borrowing. So this workbook:</p>
        <ul>
          <li>Practises borrowing, from 2-digit to 3-digit numbers</li>
          <li>Keeps carrying fresh every day</li>
          <li>Ends with one step ahead: borrowing across a zero</li>
        </ul>
      </div>
      <div className="hp-cover-foot">
        <span className="hp-qr" aria-hidden="true" />
        <span className="hp-mono">UL · {who.toUpperCase()} · W01 · COVER</span>
        <span className="hp-wm sm">Unica Learning<i /></span>
      </div>
    </div>
  );
}
