// Rewards program copy and numbers (D-078), used by /rewards (components/rewards.tsx).
// Points come from checked page scans (finished work), never from scores. The parent approves every prize.
// The numbers are first values, approved by Savar 2026-10-09; change them here only.

export const PER_PAGE = 10;
export const WEEK_BONUS = 25;
export const BOOK_BONUS = 50;
const PAGES_PER_BOOK = 22;

/** One subject, 5 days a week: every page, 4 full weeks and 1 finished book. */
export const POINTS_PER_MONTH = PER_PAGE * PAGES_PER_BOOK + WEEK_BONUS * 4 + BOOK_BONUS;

export const EARN: { title: string; text: string; points: number }[] = [
  { title: "Every finished page", text: "Scan the page in the app. The points land once the page is checked.", points: PER_PAGE },
  { title: "A full week", text: "Practice 5 days in one week for a streak bonus.", points: WEEK_BONUS },
  { title: "A finished workbook", text: "Every page of the book scanned, start to end.", points: BOOK_BONUS },
];

export const PRIZES: { name: string; points: number }[] = [
  { name: "Sticker sheet and badge", points: 250 },
  { name: "A small toy or a book", points: 500 },
  { name: "CAD 15 gift card", points: 750 },
  { name: "Movie tickets", points: 1000 },
  { name: "A day at the aquarium", points: 2000 },
  { name: "A day at the zoo", points: 2000 },
  { name: "A big toy", points: 3500 },
  { name: "An iPad", points: 12000 },
];

export const REWARDS_FAQ: { question: string; answer: string }[] = [
  { question: "Does it cost extra?", answer: "No. Rewards are part of every plan." },
  { question: "Do wrong answers lose points?", answer: "No. Points are for finished work, not for scores. A hard page earns the same as an easy one." },
  { question: "What counts as a finished page?", answer: "A page with your child's work on it, scanned in the app. Every page is checked, so blank pages do not earn points." },
  { question: "Do points expire?", answer: "No. Points stay while your plan is active, and through a pause." },
  { question: "Can I say no to a prize?", answer: "Yes. You approve every prize before we order it. You can also save points together for a bigger goal." },
  { question: "Do two subjects earn more?", answer: "Yes. Math + Reading earns points from both books, so prizes come about twice as fast." },
];

export const points = (n: number) => n.toLocaleString("en-CA");
