// The comparison facts behind the home "How we compare" table (D-097) and the /compare page (D-114).
// Categories only, never a competitor name (D-064). Every fact is backed by .design/research/competitors-2026-10.md
// and .design/research/compare-page-2026-10-16.md; re-check them before editing. A full mark is yes, a half mark is
// partly, an empty mark is no.
import { BRAND, PLANS } from "@/lib/site";

export type Mark = "yes" | "part" | "no";
export type OptionId = "tutor" | "centre" | "online" | "us";
export type RowId = "personal" | "plan" | "help" | "gaps" | "paper" | "home";

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
      us: ["yes", "Every page matched to their level and gaps"],
    },
  },
  {
    id: "plan",
    label: "A structured plan",
    cells: {
      tutor: ["part", "Depends on the tutor"],
      centre: ["yes", "A set program at the centre"],
      online: ["part", "Suggested skills; your child often picks"],
      us: ["yes", "The next pages arrive before they run out"],
    },
  },
  {
    id: "help",
    label: "Help when they're stuck",
    cells: {
      tutor: ["yes", "Explains live"],
      centre: ["part", "Ask the instructor at the centre"],
      online: ["part", "Hints, videos or worked answers on screen"],
      us: ["yes", "The Teaching Assistant explains it out loud, step by step"],
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
      us: ["yes", "5 days a week; the screen stays with you"],
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

/** Big number, then its unit, all a month so they compare. Tutors: 1 hour a week at $40-$100 is about $173-$433 a month
 *  (x 4.33). Learning centres: BC centre pages list about $170-$220 per subject a month (2026-10-16). */
export const COST: Record<OptionId, [string, string]> = {
  tutor: ["About $170-$430", "a month, for 1 hour a week"],
  centre: ["About $200", "a month, per subject"],
  online: ["$0-$25", "a month"],
  us: [`$${PLANS.one.price}`, "a month, delivery included"],
};

/** One block per option on /compare: what it does well, what is harder, and what Unica does instead. */
export const ONE_BY_ONE: { id: Exclude<OptionId, "us">; tag: string; title: string; summary: string; goodTitle: string; good: string[]; hardTitle: string; hard: string[]; us: string[] }[] = [
  {
    id: "tutor",
    tag: "vs Private tutors",
    title: `A tutor teaches live. ${BRAND} explains when they're stuck, and keeps them practising every day.`,
    summary: `Tutoring is time with a person. ${BRAND} is a plan your child works through at home, 15-30 minutes a day.`,
    goodTitle: "A tutor is good at",
    good: ["Explaining live and answering questions", "Adjusting to your child each session", "Help with homework and tests"],
    hardTitle: "Harder with a tutor",
    hard: ["Often an hour or two a week; the other days are up to you", "$40-$100 an hour: about $170-$430 a month for 1 hour a week", "How much you hear about gaps depends on the tutor"],
    us: ["Practice 5 days a week, built from their recent work", "The Teaching Assistant explains any step out loud, plus a report and worked solutions after every scan", `$${PLANS.one.price} a month. You can keep a tutor too.`],
  },
  {
    id: "centre",
    tag: "vs Learning centres",
    title: "Structured like a learning centre, without the drive.",
    summary: `A centre gives your child a program and a routine. ${BRAND} does too, and builds each set of pages from how they did on the last.`,
    goodTitle: "A centre is good at",
    good: ["A set program and a daily habit", "A placement test to start", "Instructors at the centre"],
    hardTitle: "Harder with a centre",
    hard: ["You drive there, often twice a week, and wait", "Your child moves along a set path", "About $200 per subject a month, often plus an enrolment fee"],
    us: ["Every page is built from their own work", "It comes to your door, and the Teaching Assistant explains any step when they're stuck", `$${PLANS.one.price} a month, no enrolment fee`],
  },
  {
    id: "online",
    tag: "vs Online learning platforms",
    title: "Adapts like an online platform, on paper instead of a screen.",
    summary: `Online platforms adapt to every tap. ${BRAND} adapts too, from the work your child does with a pencil.`,
    goodTitle: "An online platform is good at",
    good: ["Adapting to answers right away", "Low cost, and some are free", "Practice anywhere, any time"],
    hardTitle: "Harder with an online platform",
    hard: ["Practice happens on a screen", "Answers are tapped or typed, so the working on paper is never marked", "Help explains the question, without seeing how your child worked it"],
    us: ["Your child works with pencil and paper; the screen stays with you", "You take a photo; we mark the work and show you the gaps", "The Teaching Assistant explains any step they got wrong, out loud"],
  },
];

export const COMPARE_FAQ: { question: string; answer: string }[] = [
  { question: "Is this as good as a tutor?", answer: `They do different things. A tutor is a person who explains live, usually an hour or two a week. ${BRAND} is practice 5 days a week, built from your child's own work, with the Teaching Assistant to explain a step when they're stuck. You can use both.` },
  { question: "How much of my time does it take?", answer: "Your child works on paper, 15-30 minutes a day. You scan finished pages with your phone and read the report. The Teaching Assistant explains steps, so you don't have to." },
  { question: "What if my child is ahead or behind?", answer: "The free assessment finds their level, whatever their grade. Their pages start there: more practice on the gaps, and new topics when they're ready." },
  { question: `Does ${BRAND} replace school?`, answer: `No. ${BRAND} works alongside school. It follows your child's curriculum, so practice at home matches class, and moves ahead when your child is ready.` },
  { question: "Can we keep our tutor?", answer: `Yes. A tutor can explain live, and ${BRAND} gives your child daily practice between sessions.` },
  { question: "Is there any screen time?", answer: "Daily practice is on paper. The free math assessment is online. You use the app to scan finished pages and see progress. When your child is stuck, they can use your phone to talk with the Teaching Assistant." },
  { question: "Where do these prices come from?", answer: "Public price lists and rate pages, checked October 2026. Tutor prices are for 1 hour a week. Prices are in Canadian dollars, except some online platforms that list US prices. They vary by tutor, centre and plan." },
];
