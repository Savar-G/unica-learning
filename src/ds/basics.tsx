"use client";

// Pagewise design system: basic building blocks. Every component renders the classes
// the live site uses; styles live in ./styles/base.css + ./styles/warm.css.
import type * as React from "react";
import { useEffect, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

export type Tone = "sun" | "sky" | "tang" | "leaf";
export type Vars = CSSProperties & Record<`--${string}`, string | number>;

export interface PagewiseRootProps {
  /** Page content. Every Pagewise component must render inside this root. */
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The Pagewise theme root (warm look). Sets the colour, type and grain tokens
 * (`--ink`, `--sun`, `--g1`..`--g4`, `--noise`, `--sans`, `--mono`) that every component reads.
 * Without it, components fall back to unstyled defaults.
 */
export function PagewiseRoot({ children, className = "", style }: PagewiseRootProps) {
  return (
    <div className={`look-root ${className}`.trim()} data-look="warm" style={style}>
      {children}
    </div>
  );
}

export interface LogoProps {
  /** Brand name; "Pagewise" is the current placeholder. */
  brand?: string;
  href?: string;
}

/** Wordmark: the brand name followed by a small orange square. */
export function Logo({ brand = "Pagewise", href = "#top" }: LogoProps) {
  return (
    <a className="logo" href={href} aria-label={`${brand} home`}>
      {brand}
      <b />
    </a>
  );
}

type ButtonBase = {
  /** `primary` = solid ink; `ghost` = white with a grey border. */
  variant?: "primary" | "ghost";
  size?: "md" | "sm";
  /** Adds the → arrow that nudges right on hover. Defaults to true for primary. */
  arrow?: boolean;
  children?: ReactNode;
};

export type ButtonProps = ButtonBase &
  (({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children">) | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">));

/** Square-ish (6px) button. Renders an `<a>` when `href` is set, otherwise a `<button>`. */
export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", arrow, children, className = "", ...rest } = props;
  const showArrow = arrow ?? variant === "primary";
  const cls = `btn${variant === "ghost" ? " ghost" : ""}${size === "sm" ? " sm" : ""} ${className}`.trim();
  const inner = (
    <>
      {children}
      {showArrow && <span className="arr">→</span>}
    </>
  );
  if ("href" in rest && rest.href !== undefined) {
    return <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>{inner}</a>;
  }
  return <button type="button" className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>{inner}</button>;
}

export interface EyebrowProps {
  children?: ReactNode;
  className?: string;
}

/** Section label: Geist Mono caps with an orange square marker. */
export function Eyebrow({ children, className = "" }: EyebrowProps) {
  return <p className={`eyebrow ${className}`.trim()}>{children}</p>;
}

export interface ChipProps {
  children?: ReactNode;
  /** Small coloured dot/background tint. */
  tone?: Tone;
  className?: string;
}

/** Small mono pill label, e.g. a status or a step name. */
export function Chip({ children, tone = "sun", className = "" }: ChipProps) {
  return <span className={`chip ${tone} ${className}`.trim()}>{children}</span>;
}

export interface HighlightProps {
  children?: ReactNode;
  /** Let the page's scroll observer draw the stroke in; leave false to show it drawn. */
  animate?: boolean;
}

/** Yellow highlighter stroke behind a word (used on "Mastered." in the hero). */
export function Highlight({ children, animate = false }: HighlightProps) {
  return <span className={animate ? "mark" : "mark is-in"}>{children}</span>;
}

export interface SwapWordProps {
  /** Words that rotate in a mono pill every 2.2 s (first word shows with reduced motion). */
  words: string[];
  interval?: number;
}

/** Inline word pill that cycles through `words`. Screen readers get the full list. */
export function SwapWord({ words, interval = 2200 }: SwapWordProps) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || words.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => window.clearInterval(t);
  }, [words.length, interval]);
  return (
    <>
      <span className="swap" aria-hidden="true">
        {words.map((w, n) => (
          <span key={w} className={n === i ? "on" : undefined}>{w}</span>
        ))}
      </span>
      <span className="sr">{words.join(", ")}</span>
    </>
  );
}

export interface SectionProps {
  id?: string;
  children?: ReactNode;
  className?: string;
  "aria-labelledby"?: string;
}

/** Page section with the standard vertical rhythm and side gutters. */
export function Section({ id, children, className = "", ...rest }: SectionProps) {
  return (
    <section id={id} className={`sec ${className}`.trim()} {...rest}>
      {children}
    </section>
  );
}

export interface SectionHeaderProps {
  eyebrow?: ReactNode;
  /** Sentence case, light weight, ends with a period: "Six steps. One loop." */
  title: ReactNode;
  lead?: ReactNode;
  /** id for the h2, so the parent section can use aria-labelledby. */
  titleId?: string;
  className?: string;
}

/** Eyebrow + large light headline + optional grey lead paragraph. */
export function SectionHeader({ eyebrow, title, lead, titleId, className = "" }: SectionHeaderProps) {
  return (
    <div className={`sec-head ${className}`.trim()}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 id={titleId}>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </div>
  );
}

export interface PhotoProps {
  src: string;
  alt: string;
  /** CSS aspect-ratio, e.g. "4/3". Ignored when `height` is set. */
  ratio?: string;
  height?: number | string;
  /** Corner radius in px (cards use 4, the hero uses 2). */
  radius?: number;
  className?: string;
}

/** Real photo of a child learning at home, cropped to fill its box. */
export function Photo({ src, alt, ratio = "4/3", height, radius = 4, className = "" }: PhotoProps) {
  return (
    <div className={`ph ${className}`.trim()} style={{ aspectRatio: height ? undefined : ratio, height, borderRadius: radius }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" />
    </div>
  );
}
