// The comparison facts behind the home "How we compare" table (D-097) and the /compare page (D-114).
// Categories only, never a competitor name (D-064). Every fact is backed by .design/research/competitors-2026-10.md
// and .design/research/compare-page-2026-10-16.md; re-check them before editing. A full mark is yes, a half mark is
// partly, an empty mark is no.
import { BRAND, PLANS } from "@/lib/site";

export type Mark = "yes" | "part" | "no";
export type OptionId = "tutor" | "centre" | "online" | "us";
export type RowId = "personal" | "pace" | "plan" | "help" | "gaps" | "paper" | "home";

export const MARK_LABEL: Record<Mark, string> = { yes: "Yes", part: "Partly", no: "No" };

/** Column order on /compare. `short` is the phone switch label. */
export const OPTIONS: { id: OptionId; name: string; short: string }[] = [
  { id: "tutor", name: "Private tutor", short: "Tutor" },
  { id: "centre", name: "Learning centre", short: "Centre" },
  { id: "online", name: "Online platform", short: "Online" },
  { id: "us", name: BRAND, short: BRAND },
];

export const ROWS: { id: RowId; label: string; cells: Record<OptionId, [Mark, string]> }[] = [
  {
    id: "personal",
    label: "Personal to your child",
    cells: {
      tutor: ["yes", "The tutor adjusts each session"],
      centre: ["part", "Own pace, on a set path"],
      online: ["yes", "Adapts to their answers on screen"],
      us: ["yes", "Every book matched to their level and gaps"],
    },
  },
  {
    id: "pace",
    label: "Moves at their pace",
    cells: {
      tutor: ["yes", "Set by the tutor"],
      centre: ["yes", "Moves up when they're ready"],
      online: ["yes", "Moves up when they're ready"],
      us: ["yes", "More practice where they need it, new topics when they're ready"],
    },
  },
  {
    id: "plan",
    label: "A structured plan",
    cells: {
      tutor: ["part", "Depends on the tutor"],
      centre: ["yes", "A set program at the centre"],
      online: ["part", "Suggested skills; your child often picks"],
      us: ["yes", "A new book before the last one runs out"],
    },
  },
  {
    id: "help",
    label: "Help when they're stuck",
    cells: {
      tutor: ["yes", "Explains live"],
      centre: ["part", "Ask the instructor at the centre"],
      online: ["part", "Hints and videos, varies by platform"],
      us: ["yes", "The companion explains it out loud, step by step"],
    },
  },
  {
    id: "gaps",
    label: "Gaps shown to you",
    cells: {
      tutor: ["part", "When the tutor reports them"],
      centre: ["part", "Depends on the centre"],
      online: ["yes", "Reports on the platform"],
      us: ["yes", "A gap report after every scan"],
    },
  },
  {
    id: "paper",
    label: "Pencil and paper",
    cells: {
      tutor: ["part", "Depends on the tutor"],
      centre: ["part", "Depends on the centre"],
      online: ["no", "On a screen"],
      us: ["yes", "Every day; the screen stays with you"],
    },
  },
  {
    id: "home",
    label: "No driving",
    cells: {
      tutor: ["part", "Online, at home, or at the tutor's"],
      centre: ["no", "At the centre, often twice a week"],
      online: ["yes", "At home"],
      us: ["yes", "Mailed to your door"],
    },
  },
];

/** Big number, then its unit. Learning centres: BC centre pages list about $170-$220 per subject a month (2026-10-16). */
export const COST: Record<OptionId, [string, string]> = {
  tutor: ["$40-$100", "an hour"],
  centre: ["About $200", "per subject, a month"],
  online: ["$0-$25", "a month"],
  us: [`CAD ${PLANS.one.price}`, "a month, delivery included"],
};

/** One block per option on /compare: what it does well, what is harder, and what Unica does instead. */
export const ONE_BY_ONE: { id: Exclude<OptionId, "us">; tag: string; title: string; summary: string; goodTitle: string; good: string[]; hardTitle: string; hard: string[]; us: string[] }[] = [
  {
    id: "tutor",
    tag: "vs Tutor programs",
    title: `A tutor teaches live. ${BRAND} explains when they're stuck, and keeps them practising every day.`,
    summary: `Tutoring is time with a person. ${BRAND} is a plan your child works through at home, 15-30 minutes a day.`,
    goodTitle: "A tutor is good at",
    good: ["Explaining live and answering questions", "Adjusting to your child each session", "Help with homework and tests"],
    hardTitle: "Harder with a tutor",
    hard: ["Often an hour or two a week; the other days are up to you", "$40-$100 an hour, every week", "How much you hear about gaps depends on the tutor"],
    us: ["Practice 5 days a week, built from their last book", "The companion explains any step out loud, plus a report and worked solutions after every scan", `CAD ${PLANS.one.price} a month. You can keep a tutor too.`],
  },
  {
    id: "centre",
    tag: "vs Learning centres",
    title: "Structured like a learning centre, without the drive.",
    summary: `A centre gives your child a program and a routine. ${BRAND} does too, and builds each book from how they did on the last one.`,
    goodTitle: "A centre is good at",
    good: ["A set program and a daily habit", "A placement test to start", "Instructors at the centre"],
    hardTitle: "Harder with a centre",
    hard: ["You drive there, often twice a week, and wait", "Your child moves along a set path", "About $200 per subject a month, often plus an enrolment fee"],
    us: ["Every book is built from their own work", "It comes to your door, and the companion explains any step when they're stuck", `CAD ${PLANS.one.price} a month, no enrolment fee`],
  },
  {
    id: "online",
    tag: "vs Online learning platforms",
    title: "Adapts like an online platform, on paper instead of a screen.",
    summary: `Online platforms adapt to every tap. ${BRAND} adapts too, from the work your child does with a pencil.`,
    goodTitle: "An online platform is good at",
    good: ["Adapting to answers right away", "Low cost, and some are free", "Practice anywhere, any time"],
    hardTitle: "Harder with an online platform",
    hard: ["Practice happens on a screen", "Answers are tapped or typed, so the working on paper is never marked"],
    us: ["Your child works with pencil and paper", "You take a photo; we mark the work and show you the gaps", "The screen stays with you"],
  },
];

export const COMPARE_FAQ: { question: string; answer: string }[] = [
  { question: `Does ${BRAND} replace school?`, answer: `No. ${BRAND} works alongside school. It follows your child's curriculum, so practice at home matches class, and moves ahead when your child is ready.` },
  { question: "Can we keep our tutor?", answer: `Yes. A tutor can explain live, and ${BRAND} gives your child daily practice between sessions.` },
  { question: "Is there any screen time?", answer: "Daily practice is on paper. The free math assessment is online. The app is for you: scan a page to check answers or see every step." },
  { question: "Where do these prices come from?", answer: "Public price lists and rate pages, checked October 2026. Prices vary by tutor, centre and plan." },
];
