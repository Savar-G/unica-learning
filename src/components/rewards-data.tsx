// PROTOTYPE ONLY (branch site/rewards-prototype): shared rewards facts for the grid card and /rewards variants.
// Every number here is a placeholder for Savar to set: points per page, bonuses, prize prices.
// Earn rule: points come from checked page scans (finished work), never from scores or from a book arriving.
import type { ReactNode } from "react";
import type { Tone } from "@/ds";

export const PER_PAGE = 10;
export const WEEK_BONUS = 25;
export const BOOK_BONUS = 50;
export const PAGES_PER_BOOK = 22;
/** One subject, 5 days a week: 22 pages + 4 full weeks + 1 finished book. */
export const MONTHLY = PER_PAGE * PAGES_PER_BOOK + WEEK_BONUS * 4 + BOOK_BONUS; // 370

export const EARN: { pts: string; title: string; text: string }[] = [
  { pts: `+${PER_PAGE}`, title: "Every finished page", text: "Scan the page in the app. The points land once the page is checked." },
  { pts: `+${WEEK_BONUS}`, title: "A full week", text: "Practice 5 days in one week for a streak bonus." },
  { pts: `+${BOOK_BONUS}`, title: "A finished workbook", text: "Every page of the book scanned, start to end." },
];

const svg = (d: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;

export const PRIZE_ICONS = {
  star: svg(<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />),
  toy: svg(<><rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M8 11V8.5a1.5 1.5 0 0 1 3 0V11M13 11V8.5a1.5 1.5 0 0 1 3 0V11" /></>),
  card: svg(<><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></>),
  ticket: svg(<><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" /><path d="M14 7v10" strokeDasharray="2 2" /></>),
  fish: svg(<><path d="M3 12c3-4 8-5 12-3l5-3v12l-5-3c-4 2-9 1-12-3z" /><circle cx="8" cy="11" r="0.8" /></>),
  paw: svg(<><circle cx="7" cy="9" r="1.8" /><circle cx="11" cy="6" r="1.8" /><circle cx="15.5" cy="7" r="1.8" /><circle cx="18" cy="11" r="1.8" /><path d="M8 17c0-3 2.5-5 5-5s4.5 2 4 5c-.3 2-2.5 2-4 1.5S8.5 19.5 8 17z" /></>),
  kit: svg(<><path d="M4 8h16v11H4z" /><path d="M9 8V5h6v3M4 13h16" /></>),
  tablet: svg(<><rect x="5" y="2.5" width="14" height="19" rx="2.5" /><path d="M11 18.5h2" /></>),
} as const;

export type PrizeIcon = keyof typeof PRIZE_ICONS;

export interface Prize {
  pts: number;
  name: string;
  note: string;
  icon: PrizeIcon;
  tone: Tone | "ink";
}

export const PRIZES: Prize[] = [
  { pts: 250, name: "Sticker sheet and badge", note: "Mailed inside the next workbook box.", icon: "star", tone: "sun" },
  { pts: 500, name: "A small toy or a book", note: "Your child picks from our shelf. It ships with the next book.", icon: "toy", tone: "leaf" },
  { pts: 750, name: "CAD 15 gift card", note: "For books, games or a treat.", icon: "card", tone: "tang" },
  { pts: 1000, name: "Movie tickets", note: "Two tickets: one for your child, one for you.", icon: "ticket", tone: "sky" },
  { pts: 2000, name: "A day at the aquarium", note: "Tickets for your child and one adult.", icon: "fish", tone: "sky" },
  { pts: 2000, name: "A day at the zoo", note: "Tickets for your child and one adult.", icon: "paw", tone: "leaf" },
  { pts: 3500, name: "A big toy", note: "A building set, an art kit or a board game.", icon: "kit", tone: "tang" },
  { pts: 12000, name: "An iPad", note: "The big goal. Saved up over time, together.", icon: "tablet", tone: "ink" },
];

export const TONE_BG: Record<Prize["tone"], string> = {
  sun: "#fff4cc", sky: "#e4ecff", tang: "#ffe6dc", leaf: "#dcf4e8", ink: "#e9e9ec",
};

export const REDEEM: { title: string; text: string }[] = [
  { title: "Your child picks", text: "They choose a prize in the app when they have the points, or save up for a bigger one." },
  { title: "You approve", text: "Nothing is ordered until you say yes on your phone." },
  { title: "We send it", text: "Small prizes ride in the next workbook box. Tickets and gift cards come by email." },
];

export const REWARDS_FAQ: { question: string; answer: string }[] = [
  { question: "Does it cost extra?", answer: "No. Rewards are part of every plan." },
  { question: "Do wrong answers lose points?", answer: "No. Points are for finished work, not for scores. A hard page earns the same as an easy one." },
  { question: "What counts as a finished page?", answer: "A page with your child's work on it, scanned in the app. Every page is checked, so blank pages do not earn points." },
  { question: "Do points expire?", answer: "No. Points stay while your plan is active, and through a pause." },
  { question: "Can I say no to a prize?", answer: "Yes. You approve every prize before we order it. Many families save points together for a bigger goal." },
  { question: "Do two subjects earn more?", answer: "Yes. Math + Reading earns points from both books, so prizes come about twice as fast." },
];

export const fmt = (n: number) => n.toLocaleString("en-CA");

/** Months to reach a prize at a monthly rate, as plain words. */
export function monthsTo(pts: number, perMonth = MONTHLY) {
  const m = pts / perMonth;
  if (m <= 1) return "in the first month";
  if (m < 1.75) return "in about 6 weeks";
  if (m < 12) return `in about ${Math.round(m)} months`;
  const y = m / 12;
  return y < 1.25 ? "in about a year" : `in about ${Math.round(y * 2) / 2} years`;
}
