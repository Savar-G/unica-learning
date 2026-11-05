import type { StartState } from "@/lib/assessment";
import type { ChildStage } from "@/lib/child-stage";
import type { ChildView } from "@/lib/parent-view";
import { reportPath } from "@/lib/report-view";

// The Assessment tab's rules and words (#552, spec #544, D-245, D-249). Pure: no database, cookie store or clock. The
// page's layout is round r544, set 1, option B, which Savar has not chosen yet: it lives only in
// src/components/parent-assessment.tsx and the `.pd-split` and `.pd-go` rules of parent-shell.css.

const CARRIED: Record<string, string> = { password: "1", pin: "1", existing: "1", desk: "error" };

/**
 * Where /account sends a child whose stage opens on the report; null keeps the home page. The saved messages go along,
 * because another page sends the parent to /account to show them.
 */
export function openingPath(child: Pick<ChildView, "opensOn" | "reportIds">, query: Readonly<Record<string, unknown>>): string | null {
  const opensOnReport = child.opensOn === "report_start_free_month" || child.opensOn === "report_waitlist";
  if (!opensOnReport || !child.reportIds[0]) return null;
  const carried = Object.entries(CARRIED).filter(([key, value]) => query[key] === value);
  const qs = new URLSearchParams(carried).toString();
  return `${reportPath(child.reportIds[0])}${qs ? `?${qs}` : ""}`;
}

/**
 * Whether a report shows the action beside it. Only a report whose own offer fits the child's stage: an older BC report
 * of a family now on the waitlist offers nothing. While a new test is open, the report keeps its offer: the stage says
 * "continue", but a family with no card must not lose the button for up to 24 hours.
 */
export function reportAction(stage: ChildStage, callToAction: "card" | "waitlist"): boolean {
  if (stage === "report_ready_bc") return callToAction === "card";
  if (stage === "report_ready_waitlist") return callToAction === "waitlist";
  return stage === "test_running";
}

export interface TestLink {
  href: string;
  date: string;
  current: boolean;
}

/** The child's tests by date, newest first; nothing for one test, which is the report in view. */
export function otherTests(child: Pick<ChildView, "finishedTests">, reportId: string, date: (at: number) => string): TestLink[] {
  if (child.finishedTests.length < 2) return [];
  return child.finishedTests.map((t) => ({ href: reportPath(t.reportId), date: date(t.finishedAt), current: t.reportId === reportId }));
}

export interface FreeMonthWords {
  title: string;
  button: string;
  /** Under the button beside the report. */
  note: string;
  /** Under the button fixed at the bottom of a phone. */
  bar: string;
  /** Back from the payment page with no card. */
  notSaved: string;
}

// "Nothing is charged today." and "your first workbook arrives at your home" are the words of the Stripe page
// (cardTerms in src/lib/stripe.ts); a test holds them together.
export const freeMonthWords = (name: string): FreeMonthWords => ({
  title: `Start ${name}'s free month`,
  button: "Start free month",
  note: "You add your card and shipping address on a secure payment page. Nothing is charged today.",
  bar: "Nothing is charged today. The free month starts when your first workbook arrives at your home.",
  notSaved: "Your card is not saved yet, and nothing was charged. Start the free month when you are ready.",
});

export interface Step {
  title: string;
  detail: string;
}

/** What happens after the button, beside the report. */
export const whatHappensNext = (name: string): Step[] => [
  { title: "We make Workbook 1", detail: `From this report, for ${name} only.` },
  { title: "We mail it to your home", detail: "Delivery within Canada is included." },
  { title: "The free month starts when it arrives", detail: "We email you a reminder 7 days before the first charge." },
];

/** The words of the page before the report. The button itself is StartTest's or SendLink's, by the start state. */
export interface TestWords {
  sub: string | null;
  title: string;
  text: string | null;
  info: { heading: string; steps: Step[]; text?: undefined } | { heading: string; text: string; steps?: undefined };
}

const HOW_IT_WORKS = (name: string) => ({
  heading: "How it works",
  steps: [
    { title: `${name} takes the test`, detail: "On a laptop or tablet, alone, in one sitting." },
    { title: "You get the report", detail: `By email, within minutes. It shows ${name}'s math level and the gaps to work on.` },
    { title: "You choose what comes next", detail: "For the BC curriculum, start the free month from the report. Nothing is charged until the first workbook arrives at your home." },
  ],
});

export function testWords(state: StartState, name: string, phone: boolean): TestWords {
  const place = phone && state.kind !== "wait" ? `A phone screen is too small for the test. We email you a sign-in link: open it on the laptop or tablet, and it opens ${name}'s start screen. The link works once and only for 24 hours.` : null;
  switch (state.kind) {
    case "wait":
      return {
        sub: null,
        title: `${name} finished the test`,
        text: null,
        info: { heading: "What the report shows", text: `The level ${name} works at, each area of math, the topics ${name} has secure and the ones to work on, with one of ${name}'s answers for each.` },
      };
    case "resume":
    case "finish":
      return {
        sub: null,
        title: state.kind === "resume" ? `${name}'s test is open` : `${name}'s answers are in`,
        text: place,
        info: {
          heading: "While the test is open",
          steps: [
            { title: "The answers are saved", detail: `${name} can stop and continue later.` },
            { title: "It closes after 24 hours", detail: "A test that is not finished by then closes. The new test has new questions." },
          ],
        },
      };
    case "expired":
      return { sub: null, title: `Start ${name}'s test again`, text: place, info: HOW_IT_WORKS(name) };
    case "start":
      return {
        sub: `Free. The report shows the level ${name} works at and the skills to work on next.`,
        title: `Start ${name}'s free math test`,
        text: place ?? `${name} takes the test alone, on this device, in one sitting. Start when ${name} is ready.`,
        info: HOW_IT_WORKS(name),
      };
  }
}
