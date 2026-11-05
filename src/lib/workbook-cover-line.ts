// D-233, Q8: one true cover sentence from checked signals and the topics actually taught.
import { FACTS_BY_GRADE } from "@/lib/assessment";
import type { WorkbookPlan } from "@/lib/workbook-plan";
import { UNIT_TITLES } from "@/lib/workbook-titles";

// Number-free versions of curriculum topics. These change cover copy only.
const TOPICS: Readonly<Record<string, string>> = {
  K1: "counting", K2: "making number groups", K3: "number parts",
  "1.1": "counting and comparing", "1.2": "number parts",
  "2.1": "counting and comparing", "2.2": "number benchmarks", "2.3": "number facts",
  "3.1": "larger numbers", "3.4": "number facts", "3.11": "solid objects", "3.14": "money",
  "4.1": "larger numbers", "4.7": "number facts",
  "5.1": "larger numbers", "5.8": "number facts", "5.9": "multiplication",
  "5.17": "comparing bar graphs", "7.6": "solving equations", "8.8": "solving equations",
};
const NUMBER = /\p{N}|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)s?\b/iu;
const list = (topics: string[]) => topics.length < 3 ? topics.join(" and ") : `${topics.slice(0, -1).join(", ")} and ${topics.at(-1)}`;

/** Copy limits complement the production renderer's measured cover-box fit check. */
export function coverLineProblem(line: string): string | null {
  if (!line.trim()) return "the cover sentence is empty";
  if (line.trim().split(/\s+/).length > 30) return "the cover sentence exceeds 30 words";
  if (line.length > 180) return "the cover sentence exceeds 180 characters";
  if (NUMBER.test(line)) return "the cover sentence contains a number";
  if (/\b(?:grades?|kindergarten|scores?)\b|%/i.test(line)) return "the cover sentence contains a grade or score";
  // Initials are names, not sentence endings.
  const withoutInitials = line.replace(/\b(?:[A-Z]\.)+/g, "");
  if (!/^[^.!?]+\.$/.test(withoutInitials)) return "the cover needs a single sentence";
  return null;
}

/** Null preserves today's copy without assessment signals, after book one, or without taught topics. */
export function workbookCoverLine(plan: WorkbookPlan, child: string, workbook: number): string | null {
  const s = plan.personal;
  if (workbook !== 1 || !s?.hasAssessment) return null;
  const units = [...new Set(plan.newSteps.map(step => step.unit))];
  const topics = [...new Set(units.flatMap(unit => {
    const title = TOPICS[unit] ?? UNIT_TITLES[unit]?.toLowerCase();
    return title && !NUMBER.test(title) ? [title] : [];
  }))].slice(0, 3);
  if (!topics.length) return null;

  const b = s.behaviour;
  const trusted = s.working?.certainty === "clear" && s.working.confidence === "normal"
    && !!b && !b.helpLikely && !b.unreliable && b.rushRuns === 0;
  const secureAreas = s.strands.length === 4
    && ["number", "fractions", "algebra", "shapes"].every(strand => s.strands.some(x => x.strand === strand && x.status === "secure" && x.total > 0 && x.correct > 0 && x.correct <= x.total));
  // Signals also list untested families. Require the grade's round in full and check any other recorded family.
  // This catches a missing byFamily row, which otherwise looks like a family the assessment never asked.
  const testedFamilies = new Set([...FACTS_BY_GRADE[s.grade], ...s.facts.filter(f => f.source !== "none").map(f => f.family)]);
  const secureFacts = testedFamilies.size > 0 && [...testedFamilies].every(family => {
    const f = s.facts.find(f => f.family === family);
    const r = f?.result;
    return f?.source !== "none" && f?.state === "known" && !!r && r.answered > 0 && r.correct > 0 && r.correct <= r.answered
      && r.accuracy === "secure" && r.speed === "quick" && r.medianMs !== null && Number.isFinite(r.medianMs) && r.medianMs > 0;
  });
  const ahead = trusted && s.adjustments.trustedAboveGrade && s.weak.length === 0 && secureAreas && secureFacts;
  const catchUp = s.start?.rule === "P3" || !!s.working && s.working.working < s.grade;
  for (const name of [child, "Your child"]) for (let count = topics.length; count > 0; count--) {
    const selected = topics.slice(0, count);
    const line = ahead
      ? `${name} did very well on every part of the assessment, so this book moves ahead to ${list(selected)}.`
      : catchUp
        ? `This book starts with ${selected[0]}, step by step${selected.length > 1 ? `, then moves on to ${list(selected.slice(1))}` : ""}.`
        : trusted
          ? `This book works on ${list(selected)}, at the level ${name === "Your child" ? "your child" : name} showed on the assessment.`
          : `This book gives ${name === "Your child" ? "your child" : name} practice with ${list(selected)}, step by step.`;
    if (!coverLineProblem(line)) return line;
  }
  throw new Error("The personal cover sentence does not meet its copy limits.");
}
