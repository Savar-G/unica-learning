// A1: a plain-language explanation made only from the saved planner data.
import { BC_SKILL_MAP, MISCONCEPTIONS, type FactFamilyId } from "@/lib/assessment";
import { UNIT_TITLES } from "@/lib/workbook-titles";
import { feelingLabel, goalLabel, interestLabel, styleLabel, weeklyTimeLabel } from "@/lib/learning-style";

// The plan stores this text, and stored plans and run fingerprints must not change when a label on a parent screen
// changes (D-325 renamed the goal and feeling answers on the signup step). The values the learning card used before
// D-325 keep their old short words here; a value added by D-325 uses its label from the signup step.
const PLAN_FEELING_WORDS: Partial<Record<Parameters<typeof feelingLabel>[0], string>> = { enjoys: "Enjoys it", okay: "It's okay", avoids: "Avoids it" };
const PLAN_GOAL_WORDS: Partial<Record<Parameters<typeof goalLabel>[0], string>> = { catch_up: "Catch up", keep_up: "Keep up", get_ahead: "Get ahead" };
const planFeelingLabel = (id: Parameters<typeof feelingLabel>[0]) => PLAN_FEELING_WORDS[id] ?? feelingLabel(id);
const planGoalLabel = (id: Parameters<typeof goalLabel>[0]) => PLAN_GOAL_WORDS[id] ?? goalLabel(id);
import type { WorkbookPlan } from "@/lib/workbook-plan";
import type { BookSignals, BookSoftSource, SignalId, SignalTrace } from "@/lib/workbook-signals";
import { bookSignals } from "@/lib/workbook-signals";
import { childProfileFacts, type ChildProfileInput, type ChildLearnerProfile } from "@/lib/child-profile";
import type { PlacementInput } from "@/lib/workbook-placement";

export interface WorkbookWhy {
  inputs: { label: string; value: string; reliability: string; status: string; reason: string }[];
  start: string;
  pages: { label: string; choices: string[] }[];
  warnings: string[];
}

/** The caller supplies a pure planner. This module has no store, AI client or run-start dependency. */
export function previewWorkbook(input: Omit<PlacementInput, "profile"> & { facts: ChildProfileInput; previous?: ChildLearnerProfile | null },
  planner: (input: PlacementInput & { number: number }) => import("./workbook-placement").NextWorkbookResult) {
  const profile = childProfileFacts(input.facts);
  if (input.facts.assessment && !profile?.assessment) return { ok: false as const, reason: "The test profile could not be read. Check the child's profile before making the book." };
  const basis = (p: ChildLearnerProfile) => ({ grade: p.grade, assessment: p.assessment && { id: p.assessment.assessmentId, profile: p.assessment.profile }, standards: p.standards, events: p.events, preferences: p.preferences, parent: p.parent });
  const sameFacts = !!profile && !!input.previous && stable(basis(profile)) === stable(basis(input.previous));
  if (profile && input.previous?.ai && sameFacts) profile.ai = input.previous.ai;
  const planned = planner({ ...input, profile, number: Math.max(0, ...input.workbooks.map(w => w.number)) + 1 });
  if (!planned.ok) return { ok: false as const, reason: "The plan could not be made. Check the child's profile and curriculum." };
  const why = planned.plan.personal?.why ?? workbookWhy(planned.plan, bookSignals({ ...input, profile }), planned.placement)!;
  if (input.previous?.ai && !sameFacts) {
    const row = why.inputs.find(i => i.label === LABELS.S20)!;
    row.status = "Not used";
    row.value = "Stored notes refer to different profile facts";
    row.reason = "The preview rebuilt the facts without AI. Older notes cannot choose topics for these facts.";
    why.warnings.push("Stored AI notes were excluded because the profile facts changed. A real run may write new notes.");
  }
  return { ok: true as const, plan: planned.plan, why };
}

// Database JSON can return object keys in a different order. Array order remains meaningful.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

const LABELS: Record<SignalId, string> = {
  S1: "School grade", S2: "Working level", S3: "Highest level the test measured",
  S4: "Math areas", S5: "Topic results", S6: "Weak topics", S7: "Mistakes",
  S8: "Learning since the test", S9: "Number facts", S10: "What the test left open",
  S11: "Pace and rushing", S12: "Results near the end of the test", S13: "Read-aloud use",
  S14: "Shown work", S15: "Help during the test", S16: "Answer changes",
  S17: "Interests and ways of learning", S18: "Parent's answers", S19: "AI notes from the test",
  S20: "AI notes from later learning", S21: "Report recommendation", S22: "Test length and device",
};
const REASONS: Record<SignalId, string> = {
  S1: "Only topics at or below the school grade can count as weaknesses.",
  S2: "The working level and the checks for help and rushing set the starting level.",
  S3: "The book cannot start above the level the test measured.",
  S4: "The area results can support a parent's request for harder work.",
  S5: "A secure topic skips first-book teaching only when the evidence is clear.",
  S6: "Weak topics shape the teaching order, support and review.",
  S7: "Only known mistakes at or below the school grade can guide practice. Typed answers are excluded.",
  S8: "Later learning adds to the topic results without counting the test twice.",
  S9: "Accuracy and speed guide the choice of warm-up facts.",
  S10: "Topics with no test result keep their short checks.",
  S11: "Rushing prevents harder work. Pace alone does not change the book.",
  S12: "A measured drop reduces the required time target by five minutes.",
  S13: "Three or more questions read aloud select shorter stories.",
  S14: "Shown work is for review here. It does not change the plan.",
  S15: "Likely help prevents a start above the school grade.",
  S16: "These entries record typing, not changes of mind. The planner never reads them.",
  S17: "Interests guide story settings. Ways of learning guide question choices within the plan.",
  S18: "The goal, feeling and weekly time apply within the test results and curriculum rules.",
  S19: "Allowed suggestions can choose between equal topics. AI text and percentages do not set the level or counts.",
  S20: "Notes with learning evidence can choose between equally weak topics. Their text does not change the plan.",
  S21: "The report recommendation is a consistency check. The summary and work comments are excluded.",
  S22: "Test length and device are for review here. They do not change the plan.",
};
const UNUSED: Partial<Record<SignalId, string>> = {
  S3: "The test did not reach its highest level.", S6: "No topic at or below school grade is weak.",
  S7: "No known mistake at or below school grade can guide practice.", S8: "No later answers count beyond the test.",
  S10: "The test left no topics marked for an extra check.", S11: "No rushing was found. Pace alone does not change the book.",
  S12: "No drop was measured near the end of the test.", S13: "Fewer than three questions were read aloud.",
  S19: "No suggested topic can choose between equal allowed topics in this plan.",
  S20: "No allowed suggestion has counted learning evidence to choose between equally weak topics.",
};
const FAMILIES: Record<FactFamilyId, string> = {
  add5: "addition to 5", sub5: "subtraction to 5", add10: "addition to 10", sub10: "subtraction to 10",
  add20: "addition to 20", sub20: "subtraction to 20", mul2510: "2s, 5s and 10s times tables",
  mul234510: "2s, 3s, 4s, 5s and 10s times tables", mul100: "multiplication to 100", div100: "division to 100",
};
const grade = (n: number) => n === 0 ? "Kindergarten" : `Grade ${n}`;
const list = (values: readonly string[], empty = "None") => values.length ? values.join(", ") : empty;
const topic = (code: string) => `${(UNIT_TITLES[code] ?? BC_SKILL_MAP.standards.find(s => s.code === code)?.text ?? "Topic name unavailable").replace(/\b\d{1,3}(?: \d{3})+\b/g, n => n.replace(/ /g, ","))} (${code})`;
const topicList = (codes: readonly string[]) => list(codes.map(topic));
const reliability = (r: SignalTrace["reliability"]) => ({ fact: "Recorded fact", clear: "Clear", "early-sign": "Early sign", parent: "Parent answer", soft: "AI suggestion" })[r];
const topics = (s: BookSignals["standards"]) => list(s.map(t => `${topic(t.code)}: ${t.certainty === "clear" ? "clear" : "early sign, limited evidence"}`));
const aiSource = (source: BookSoftSource | undefined) => source
  ? `Suggested topics: ${topicList(source.suggested)}. Review preferences: ${topicList(source.reviewOrder)}. Weak-topic preferences: ${topicList(source.weakOrder)}. Challenge preferences: ${topicList(source.challengeOrder)}. Not used: ${list(source.dropped.map(d => `${topic(d.standard)}: ${d.reason}`))}`
  : "The saved plan has no separate source details for these notes";

function values(s: BookSignals): Record<SignalId, string> {
  const b = s.behaviour;
  return {
    S1: grade(s.grade),
    S2: s.working ? `${grade(s.working.working)}; ${s.working.confidence === "normal" ? "normal confidence" : "low confidence"}` : "No measured working level",
    S3: s.working?.atCeiling ? "The test could not measure a higher level" : "The test did not reach its highest level",
    S4: list(s.strands.map(a => `${({ number: "Number", fractions: "Fractions", algebra: "Patterns", shapes: "Shapes" })[a.strand]}: ${a.correct} of ${a.total} correct, ${grade(a.level)}`)),
    S5: `${s.secure.length} secure; ${s.weak.length} weak at or below school grade. Secure topics: ${topics(s.secure)}`,
    S6: topics(s.weak),
    S7: list(s.mistakes.map(m => `${topic(m.standard)}: ${list(m.misconceptions.map(id => Object.entries(MISCONCEPTIONS).find(([key]) => key === id)?.[1].description ?? "Mistake not identified"))}; ${m.wrong} wrong, ${m.withHelp} with help, ${m.blank} blank, ${m.hints} hints`), "No known mistakes at or below school grade"),
    S8: s.events ? `${s.events.counted} later answers counted; ${s.events.inAssessmentProfile} answers already in the test excluded` : "No later learning recorded",
    S9: list(s.facts.filter(f => f.source !== "none").map(f => `${FAMILIES[f.family]}: ${f.state === "known" ? "accurate and quick" : f.state === "needs-practice" ? "needs practice" : "not enough evidence"}${f.result ? `, ${f.result.correct} of ${f.result.answered} correct` : ""}${f.source === "section" ? " (whole-section result)" : ""}`), "No facts measured"),
    S10: `Untested: ${topicList(s.unknowns?.untested ?? [])}. Check next: ${topicList(s.unknowns?.checkNext ?? [])}`,
    S11: b ? `${b.medianMs === null ? "No median time" : `${Math.round(b.medianMs / 1000)} seconds per question`}; ${b.unreliable || b.rushRuns > 0 ? "rushing found" : "no rushing found"}` : "No pace recorded",
    S12: b?.lateDrop === null || !b ? "Not enough evidence" : b.lateDrop ? "Results dropped near the end" : "No measured drop",
    S13: `${b?.readAloud ?? 0} questions read aloud`,
    S14: b?.whiteboard ? `${b.whiteboard.requiredWithWork} of ${b.whiteboard.required} requested drawings supplied` : "No shown-work counts",
    S15: b ? `${b.helpLikely ? "Help likely" : "Help not likely"}; ${b.helpFlags} warning signs` : "No help information",
    S16: "Excluded from planning",
    S17: `Interests: ${list(s.preferences.interests.map(interestLabel), "not answered")}. Learns from: ${list(s.preferences.styles.map(styleLabel), "not answered")}`,
    S18: `Feeling: ${s.parent.feeling ? planFeelingLabel(s.parent.feeling) : "not answered"}. Goal: ${s.parent.goal ? planGoalLabel(s.parent.goal) : "not answered"}. Weekly time: ${s.parent.weeklyTime ? weeklyTimeLabel(s.parent.weeklyTime) : "not answered"}`,
    S19: aiSource(s.soft.sources?.test),
    S20: aiSource(s.soft.sources?.learning),
    S21: s.report.howWeHelp ? ({ ahead: "Move ahead", behind: "Catch up", "on-grade": "Work at school grade" })[s.report.howWeHelp] : "No report recommendation supplied",
    S22: `${s.report.minutes === null ? "Time not supplied" : `${s.report.minutes} minutes`}; ${s.report.device ? `${s.report.device.deviceClass}, ${s.report.device.input}` : "device not supplied"}`,
  };
}

/** Uses saved facts only. It never reads the current child profile to explain an older book. */
export function workbookWhy(plan: WorkbookPlan, fallback?: BookSignals, placement?: import("./workbook-placement").PlacementTrace): WorkbookWhy | null {
  const s = plan.personal ?? fallback;
  if (!s) return null;
  const start = plan.personal?.start ?? placement;
  const v = values(s);
  const inputs = s.trace.map(t => ({
    label: LABELS[t.id], value: t.status === "missing" ? "Not recorded" : v[t.id], reliability: reliability(t.reliability),
    status: t.status === "missing" ? "Missing" : t.status === "used" ? "Used" : "Not used",
    reason: t.status === "missing" ? (t.id === "S17" || t.id === "S18" ? "Learning card not answered. Use the usual book choices." : "No result supplied. Use the usual book rule.") : t.status === "not-used" ? UNUSED[t.id] ?? REASONS[t.id] : REASONS[t.id],
  }));
  const warnings: string[] = [];
  if (s.hasAssessment && !start) warnings.push("This saved plan has no starting-level explanation.");
  if (s.hasAssessment && start?.rule === "P1") warnings.push("The child has a test, but the plan used school grade because a working level was unavailable.");
  const home = Number(start?.home.replace("U", ""));
  if ((s.report.howWeHelp === "ahead" && plan.level < home) || (s.report.howWeHelp === "behind" && s.working && s.working.working > s.grade && plan.level >= home)) warnings.push("The report recommendation and the starting level do not agree. Check the test before making the book.");
  for (const drop of s.soft.dropped) warnings.push(`AI suggestion ${topic(drop.standard)} not used: ${drop.reason === "not in this level" ? "not in this level" : "above school grade, so it is not a weakness"}.`);
  for (const f of plan.personal?.timeShortfalls ?? []) warnings.push(`Day ${f.day}: ${f.required} required minutes exceed the ${f.target}-minute target by ${f.shortfall} minutes.`);
  if (plan.fixItLater.length) warnings.push(`${plan.fixItLater.length} skills need correction in a later book because this book has no room.`);
  const startReasons: Record<string, string> = {
    P0: "Continue at the newest workbook's level.", P1: "No measured working level is available. Start from the school grade and recorded weak topics.",
    P2: "A start above school grade needs a clear working level, normal confidence, no likely help and no rushing.",
    P3: "Start at the lowest clearly weak topic because there are several clear gaps or a gap of at least two grades.",
    P4: "Start at the working level. Teach the lower weak topic alongside it for two books.",
    P5: `The measured working level is ${s.working ? grade(s.working.working) : "unavailable"}.${s.weak.length === 0 ? " No topic at or below school grade is weak." : " Early gaps below it do not lower the start."}`,
    P9: "Kindergarten starts at the first level.",
    I1: "A team instruction sets this level. Weak topics below it get review checks instead of a lower start.",
  };
  const asked = plan.instructions?.instructions;
  const pages: WorkbookWhy["pages"] = [{ label: "Cover", choices: [`${s.working && s.working.working > s.grade && s.adjustments.trustedAboveGrade ? "Move ahead" : plan.units.support || s.clearlyWeak.length ? "Build weak topics step by step" : "Work at the measured level"} with taught topics ${topicList([...new Set(plan.newSteps.map(step => step.unit))])}. The cover wording is added when the book is made.`] }];
  for (const day of plan.days) for (const page of day.pages) {
    const choices: string[] = [];
    const taught = [...new Set(page.parts.flatMap(p => p.step ? [p.step.unit] : []))];
    const earlySecure = taught.filter(code => s.secure.some(t => t.code === code && t.certainty !== "clear"));
    if (earlySecure.length && start?.rules.includes("P5a")) choices.push(`Teach ${topicList(earlySecure)} from step 1. The test suggests this work is secure, but the evidence is limited. One more answer could change the result.`);
    if (s.hasAssessment && page.parts.some(p => p.kind === "warm-up")) choices.push(`Known facts supplied for warm-up choices: ${list(s.facts.filter(f => f.state === "known").map(f => FAMILIES[f.family]))}. The final fact counts are chosen when the book is made.`);
    if (page.parts.some(p => p.kind === "word-problems" || p.kind === "picture-stories")) {
      if (s.preferences.interests.length) choices.push(`Story settings requested: ${s.preferences.interests.map(interestLabel).join(", ")}.`);
      if (s.preferences.styles.length) choices.push(`Ways of learning requested: ${s.preferences.styles.map(styleLabel).join(", ")}.`);
    }
    if (s.hasAssessment && s.adjustments.stretchShift > 0) choices.push(`Harder work starts ${s.adjustments.stretchShift} days earlier because ${asked?.difficulty === "harder" ? "the team asked for harder work" : "of the working level and test results"}.`);
    if (day.shortStories && page.parts.some(p => p.kind === "word-problems" || p.kind === "picture-stories")) choices.push("Shorter stories follow the recorded read-aloud use.");
    if (s.hasAssessment && page.parts.some(p => p.kind === "new-idea")) choices.push(`Picture support stays through Day ${s.adjustments.picturesThrough}.`);
    for (const part of page.parts) {
      if (part.step && s.weak.some(w => w.code === part.step!.unit)) choices.push(`Teach weak topic ${topic(part.step.unit)}, step ${part.step.step}.`);
      const requested = part.weakChecks?.filter(c => asked?.addReview.includes(c.unit) || asked?.teachLess.includes(c.unit)) ?? [];
      const gaps = part.weakChecks?.filter(c => !requested.includes(c)) ?? [];
      if (gaps.length) choices.push(`Check early gaps: ${gaps.map(c => `${topic(c.unit)}, ${c.items} questions`).join("; ")}.`);
      if (requested.length) choices.push(`Review the team asked for: ${requested.map(c => `${topic(c.unit)}, ${c.items} questions`).join("; ")}.`);
      if (part.templateDifficulty === "hard") choices.push("Challenge uses the hardest allowed questions from the first day.");
      if (part.extra) choices.push("This block is Extra to reduce the required time.");
      if (part.preferStandards?.length) choices.push(`Review or Challenge prefers secure topics ${topicList(part.preferStandards)}. AI can choose only between equal allowed topics.`);
      if (plan.units.support && part.step?.unit === plan.units.support) choices.push(`Teach lower topic ${topic(plan.units.support)} alongside the working level.`);
    }
    if (page.weakPractice && asked?.teachMore.includes(page.weakPractice)) choices.push(`Extra practice page on ${topic(page.weakPractice)}: the team asked to teach more of it.`);
    if (day.time && (s.parent.weeklyTime || s.behaviour?.lateDrop || page.parts.some(p => p.extra))) choices.push(`Required time for the day: ${day.time.required} minutes; target: ${day.time.target} minutes. This is a planning estimate.`);
    pages.push({ label: `Day ${day.day}, page ${page.number}`, choices: [...new Set(choices.length ? choices : ["Same as a standard book"])] });
  }
  return { inputs, start: `Start at U${plan.level}. ${start ? startReasons[start.rule] ?? "The saved placement sets this level." : "No starting-level reason was saved."}${start?.rules.includes("P7") ? " The test reached its highest measured level. Keep this start and add harder work." : ""}`, pages, warnings };
}
