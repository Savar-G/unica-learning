// Content checks a page's measurements cannot catch, each from a problem a read of the live U10 Book 1 found
// (2026-11-17). A failing check fails the book (workbookQuality). Pure TypeScript: no network, database, clock or
// randomness.
import type { QuestionPackage } from "./question-package";
import type { GeneratedPage } from "./workbook-generator";

/**
 * A story or Challenge template another day printed may come back once, 3 or more days later (the live U10 Book 1:
 * one set of stories on Days 1, 4 and 7; a toy-car story and a Challenge on Days 8 and 10). The book check agrees.
 */
export function storyRepeatAllowed(otherDays: readonly number[], day: number): boolean {
  return otherDays.length === 0 || otherDays.length === 1 && Math.abs(otherDays[0] - day) >= 3;
}

import { twoWaysByKind, twoWaysMethods } from "./workbook-two-ways";

export interface ContentIssue { page: number; kind: "repeat" | "variety" | "coverage"; reason: string }

/** Slots whose blocks hold questions: a heading over none of them is an empty section. */
const QUESTION_SLOTS = new Set(["practice-row", "finish-these", "on-your-own", "remember-these", "unit-b-practice", "word-problems", "mixed-set", "challenge", "now-you"]);
/** Teaching panels whose explain line is the Watch out. */
const PANELS = new Set(["worked-example", "watch-one", "reminder"]);
/** Places whose template must not come back on another day of the book. */
const STORY_PLACES = new Set(["word-problems", "picture-stories", "math-in-the-world", "challenge"]);

/** A printed estimate guide that is also the answer: "Use about 21 grapes per small bunch as a guide ... 21". */
export function guideIsAnswer(p: QuestionPackage): boolean {
  const guide = /Use about ([\d,]+) [^.]* as a guide\./i.exec(p.text)?.[1]?.replace(/,/g, "");
  if (!guide) return false;
  const regions = p.item?.regions ?? [];
  const keys = regions.flatMap((r) => r.kind === "box" && r.answer?.type === "number" ? [String(r.answer.value)] : r.kind === "choice" && r.answer ? [r.answer.replace(/,/g, "")] : []);
  const value = p.answer?.value;
  if (value && value.type === "number") keys.push(String(value.value));
  return keys.includes(guide);
}

/** A Watch out or panel line with broken punctuation: "50, 45, 40, 45:." */
export function malformedLine(line: string): boolean {
  return /[:;,]\s*\.(?!\.)/.test(line) || /(?<!\.)\.\.(?!\.)/.test(line) || /\s{2,}/.test(line.trim());
}

export function contentIssues(pages: readonly GeneratedPage[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const storyDays = new Map<string, { day: number; page: number }[]>();
  const challengePages: { day: number; page: number; templates: Set<string> }[] = [];
  for (const p of pages) {
    const c = p.content;
    if (c?.kind === "how-plan") {
      const seconds = c.rows.map((r) => r.second);
      const twice = seconds.find((s, i) => seconds.indexOf(s) !== i);
      if (twice) issues.push({ page: p.number, kind: "variety", reason: `the plan says "${twice}" on more than one day; each row says what its day does` });
    }
    for (const q of p.questions) {
      const pkg = q.package;
      if (!pkg) continue;
      if (q.place === "solve-it-two-ways" && twoWaysByKind(pkg) && !twoWaysMethods(pkg))
        issues.push({ page: p.number, kind: "coverage", reason: `question ${q.number} asks for 2 ways but has no two methods of its kind ("${pkg.text}")` });
      if (guideIsAnswer(pkg)) issues.push({ page: p.number, kind: "coverage", reason: `question ${q.number}'s answer is the guide it prints ("${pkg.text}")` });
      const template = pkg.templateId?.split(":")[0];
      // (From U10, as the planner applies it: U4 to U9 keep their small task pools.)
      if (template && q.place && STORY_PLACES.has(q.place) && p.day !== null && pkg.level >= 10) {
        const key = `${q.place === "challenge" ? "challenge" : "story"}|${template}`;
        const before = storyDays.get(key) ?? [];
        const others = before.filter((u) => u.day !== p.day);
        // Once more at most, 3 or more days later (storyRepeatAllowed): never the same story day after day. (A Challenge is
        // checked by page pair below.)
        if (q.place !== "challenge" && others.length && !storyRepeatAllowed([...new Set(others.map((u) => u.day))], p.day))
          issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number} repeats the number story template of page ${others[0].page} (${template}); a template comes back once at most, 3 or more days later` });
        storyDays.set(key, [...before, { day: p.day, page: p.number }]);
      }
    }
    // (A step with two sets of hard forms, 6 or more, can give each day its own: then a near repeat is avoidable.)
    if (p.day !== null && p.questions.some((q) => q.place === "challenge" && (q.package?.level ?? 0) >= 10)) challengePages.push({ day: p.day, page: p.number,
      templates: new Set(p.questions.flatMap((q) => q.place === "challenge" && q.package?.templateId && (q.itemPlan?.template?.challengeTemplates ?? 0) >= 6 ? [q.package.templateId.split(":")[0]] : [])) });
    if (c?.kind !== "day") continue;
    for (const b of c.blocks) {
      if (QUESTION_SLOTS.has(b.slot) && b.label && !b.items.length) issues.push({ page: p.number, kind: "coverage", reason: `the page prints the heading "${b.label}" over no questions` });
      if (b.slot === "practice-row" && b.label && b.reviewFrom !== undefined && b.items.length && b.items.every((n) => n >= b.reviewFrom!))
        issues.push({ page: p.number, kind: "coverage", reason: `the page prints the heading "${b.label}" over review questions only` });
      if (!PANELS.has(b.slot)) continue;
      const explain = b.explain?.trim();
      if (explain && !/^Watch out: /.test(explain) && [b.label, c.title].some((t) => t && explain.replace(/\.$/, "").toLowerCase() === t.trim().toLowerCase()))
        issues.push({ page: p.number, kind: "coverage", reason: `the ${b.slot} panel prints its topic ("${explain}") where its Watch out goes` });
      for (const line of [explain ?? "", ...(b.lines ?? []).map((l) => (typeof l === "string" ? l : ""))]) {
        if (line && malformedLine(line)) issues.push({ page: p.number, kind: "coverage", reason: `the ${b.slot} panel prints a broken line: "${line}"` });
      }
    }
  }
  // Two Challenge pages within 3 days are nearly identical when they share 2 or more templates (the live U10 Book 1's
  // Days 8 and 10 shared all three).
  for (const [i, a] of challengePages.entries()) for (const b of challengePages.slice(i + 1)) {
    if (a.day === b.day || Math.abs(a.day - b.day) >= 3) continue;
    const shared = [...a.templates].filter((t) => b.templates.has(t));
    if (shared.length >= 2) issues.push({ page: b.page, kind: "repeat", reason: `the Challenge repeats ${shared.length} templates of page ${a.page}, ${Math.abs(a.day - b.day)} days before (${shared.join(", ")})` });
  }
  return issues;
}
