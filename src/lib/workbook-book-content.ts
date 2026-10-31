// The words and panels code writes around a generated book's questions (#312): what the real templates (#310,
// src/lib/workbook-template.ts) read from a page's content besides its questions. The AI writes only the questions; a
// page's header (topic, title, subtitle), the worked example, Watch one, the reminder and Spot the error's shown work,
// the cover and the plan page are written here by code from the plan, the curriculum and the checked packages, so no
// number on a page comes from the AI except inside a question code has checked. The look stays the template's.
// The header and cover words follow the sample books (src/lib/workbook-sample-book.ts).
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { operationResult, operationText, valueText, type Operation, type QuestionPackage } from "@/lib/question-package";
import type { Curriculum } from "@/lib/workbook-curriculum";
import type { Block, CoverContent, DayHeader, HowPlanContent, SlotName, WorkedLine } from "@/lib/workbook-page";
import { pageId } from "@/lib/workbook-page";
import type { PlannedPage, WorkbookPlan } from "@/lib/workbook-plan";

/** The longest topic a day label holds. */
const TOPIC_MAX = 45;

/** A skill (and its step) as a short topic: the step's name, else the skill text's first clause, else the level title. */
export function topicOf(curriculum: Curriculum, skill: string | undefined, step: number | undefined): string {
  if (!skill) return "Review";
  const named = step ? curriculum.skillSteps(skill)?.[step - 1]?.name : undefined;
  if (named) return named;
  const clause = (curriculum.skill(skill)?.text ?? skill).split(/,|;| \(/)[0].trim();
  return clause.length <= TOPIC_MAX ? clause : curriculum.levelOfSkill(skill)?.title ?? "Review";
}

/** A day page's header, from its planned parts. */
export function dayHeader(curriculum: Curriculum, page: PlannedPage, level: number): DayHeader {
  const main = page.parts.find((p) => p.step) ?? page.parts[0];
  const topic = topicOf(curriculum, main?.step?.skill ?? main?.skills[0], main?.step?.step);
  const early = level <= 9;
  const first = page.parts[0]?.kind;
  const type = page.type !== "parent-led" ? page.type
    : first === "new-idea" ? "new-idea" : first === "picture-stories" ? "word-problems" : first === "remember-these" ? "remember-these" : first ?? "practice";
  const t = (title: string, subtitle: string) => ({ title, subtitle });
  let head: { title: string; subtitle: string };
  switch (type) {
    case "warm-up": head = t("Warm-up", level >= 16 ? "Facts to 20. Beat your own count from last time." : "Facts to 20. Take your time: there is no timer."); break;
    case "new-idea": head = t(topic, level >= 19 ? "Try it first. Then see how it works." : "Watch how it works. Then try it."); break;
    case "practice": head = t(`Practice: ${topic}`, "Watch one. Finish two. Then do the rest on your own."); break;
    case "practice-2": head = t(`More practice: ${topic}`, "Each row is a little harder than the one before."); break;
    case "word-problems": head = t(`${topic} in stories`, "Read it. Work it out in the box. Write the answer."); break;
    case "math-in-the-world": head = t("Math in the world", "One real task. Plan it, then work it out."); break;
    case "unit-b": head = t(topic, `Unit B: ${topic.toLowerCase()}.`); break;
    case "friday-5": head = t("Remember these? and Friday 5", "Things you learned before, then five with no hints."); break;
    case "challenge": head = t("Challenge", (page.parts.find((x) => x.kind === "challenge")?.items ?? 1) > 1 ? "Two to stretch you." : "One to stretch you."); break;
    case "show-what-you-know": head = t("Show what you know", "Ten days of work. Show what you learned!"); break;
    case "level-test": head = t(`Level U${level} test`, "Do this on your own."); break;
    default: head = t("Remember these?", "Things you learned before, so they stay fresh.");
  }
  const grownUp = page.type === "parent-led"
    ? "Read each line aloud. Your child circles, colours or writes one number."
    : early && type === "new-idea" ? "Read the blue box aloud. Show both ways with a finger." : null;
  return { topic: type === "level-test" ? "Level test" : type === "show-what-you-know" ? "Show what you know" : topic, ...head, grownUp };
}

const COVER_LINE = 19;

/** A level title as two cover lines of at most 19 characters. */
function coverLines(title: string): [string, string] {
  const wrap = (text: string) => {
    const lines: string[] = [];
    for (const word of text.split(" ")) {
      const last = lines.at(-1);
      if (last !== undefined && `${last} ${word}`.length <= COVER_LINE) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    return lines;
  };
  for (const text of [title, title.split(" and ")[0], title.split(",")[0]]) {
    const lines = wrap(text);
    if (lines.length === 2 && lines.every((l) => l.length <= COVER_LINE)) return [lines[0], lines[1]];
    if (lines.length === 1) {
      const words = text.split(" ");
      if (words.length > 1) return [words.slice(0, -1).join(" "), words.at(-1)!];
    }
  }
  return [title, ""];
}

export interface BookFacts {
  curriculum: Curriculum;
  plan: WorkbookPlan;
  child: string;
  number: number;
}

const pagesADay = (plan: WorkbookPlan) => Math.max(...plan.days.map((d) => d.pages.length));

export function coverContent(o: BookFacts): CoverContent {
  const level = o.plan.level;
  const title = o.curriculum.level(`U${level}`)?.title ?? `Level U${level}`;
  return {
    kind: "cover", id: pageId(o.child, o.number, "COVER"), level, child: o.child, workbook: o.number, levelTitle: title,
    madeFrom: o.number === 1 ? "assessment" : "last-workbook", pagesADay: pagesADay(o.plan), minutes: { ...o.plan.timeTarget },
    title: coverLines(title),
    sentence: o.number === 1
      ? `${o.child}'s assessment showed what is secure and what to build next at Level U${level}. So this workbook:`
      : `${o.child}'s last workbook showed which steps stuck and which need another go. So this workbook:`,
    bullets: [
      "Builds the next steps of this level, one small step at a time",
      "Shows each new idea with a worked example first",
      "Brings back earlier skills every day, so they stay fresh",
      o.number === 1 ? "Ends each week with five questions and no hints" : "Fixes last time's mistakes with new questions",
    ],
    parentLine: `This fortnight, ask ${o.child} to show you one worked example and explain it in their own words.`,
  };
}

/** The How + Plan page; `ranges` are each day's book pages. */
export function howPlanContent(o: BookFacts, ranges: [number, number][]): HowPlanContent {
  const { plan, curriculum } = o;
  const dayTopic = (day: number, track: "A" | "B") => {
    const part = plan.days[day - 1].pages.flatMap((p) => p.parts).find((p) => p.unit === track && p.step);
    return part ? topicOf(curriculum, part.step!.skill, part.step!.step) : null;
  };
  return {
    kind: "how-plan", id: pageId(o.child, o.number, "HOW+PLAN"), level: plan.level, child: o.child, workbook: o.number,
    pagesADay: pagesADay(plan), minutes: { ...plan.timeTarget },
    rows: plan.days.map((d, i) => {
      const a = dayTopic(d.day, "A");
      const b = dayTopic(d.day, "B");
      const row = d.kind === "test" ? { topic: "Level test", second: "Done alone, in one sitting" }
        : d.kind === "light" ? { topic: "A light day", second: "Remember these? and a challenge" }
        : { topic: a ?? (d.kind === "mixed" ? "Mixed practice" : "Review"), second: d.day === 10 ? "Show what you know" : d.day === 5 ? "Friday 5" : b ?? (d.kind === "mixed" ? "Mixed practice" : "Remember these?") };
      return { day: d.day, ...row, pages: ranges[i] };
    }),
  };
}

const signOf = (op: Operation) => (op.kind.endsWith("add") ? "+" : op.kind.endsWith("subtract") ? "−" : op.kind.endsWith("multiply") ? "×" : op.kind.endsWith("divide") ? "÷" : "");

/** "268 + 157 = [425]": the operation with code's answer in blue. */
const solved = (op: Operation): WorkedLine => `${operationText(op)} = [${valueText(operationResult(op))}]`;

/** The panel slots: worked, not items. */
export const PANEL_SLOTS: readonly SlotName[] = ["worked-example", "watch-one", "reminder"];

/**
 * A panel's content, worked by code from a checked question of the same part (its easier example, so the panel never
 * gives away a question's answer): a worked example in two ways, Watch one, or a reminder. With no such question the
 * panel shows its label only.
 */
export function panelBlock(slot: SlotName, source: QuestionPackage | null, unit: "A" | "B" | null): Omit<Block, "items"> {
  const ex = source?.easierExample;
  const op = ex?.operation ?? null;
  if (slot === "worked-example") {
    if (!op) return { slot, note: unit === "B" ? "Unit B · new step" : "Unit A · new step" };
    const two = op.operands.length === 2 && op.operands.every((x) => typeof x === "number") && ["+", "−"].includes(signOf(op));
    const [a, b] = op.operands as number[];
    const res = valueText(operationResult(op));
    return {
      slot, label: operationText(op), note: unit === "B" ? "Unit B · new step" : "Unit A · new step",
      methods: two
        ? [
          { label: "In columns", lines: [`  ${a}`, `${signOf(op)} ${b}`, `= [${res}]`] },
          { label: "Check it", lines: signOf(op) === "+" ? [`${res} − ${b} = [${a}]`] : [`${res} + ${b} = [${a}]`] },
        ]
        : [{ label: "", lines: [solved(op)] }],
      explain: "Both ways give the same answer. Check with the other way.",
    };
  }
  if (slot === "watch-one") return op ? { slot, label: operationText(op), note: "Line up the places. Start with the ones.", lines: [solved(op)] } : { slot };
  return op
    ? { slot, label: "From yesterday", note: "From yesterday", lines: [solved(op)], explain: "Do it the same way as last time. Check your answer the other way." }
    : { slot, label: "From yesterday" };
}

/** Spot the error's shown work: the question's operation with the wrong answer the item shows. */
export function spotTheErrorLines(p: QuestionPackage): WorkedLine[] {
  const shown = p.item?.error?.answer;
  return p.operation && shown ? [`${operationText(p.operation)} = [${valueText(shown)}]`] : [];
}
