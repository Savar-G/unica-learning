// Workbook personalization, P3. Pure data from the current child profile. No answer text, free text, names or IDs.
import { BC_SKILL_MAP, FACTS_BY_GRADE, type Certainty, type FactFamilyId, type FactsResult, type Grade, type LearnerProfile } from "@/lib/assessment";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import type { Interest, LearningStyle } from "@/lib/learning-style";
import type { TestDevice } from "@/lib/test-context";

export type SignalId = `S${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22}`;
export type Reliability = "fact" | Certainty | "parent" | "soft";
export interface SignalTrace {
  id: SignalId;
  reliability: Reliability;
  status: "used" | "not-used" | "missing";
  reason: string;
}
export interface BookStandard {
  code: string;
  grade: number;
  status: "secure" | "developing" | "needs-attention";
  certainty: Certainty;
  aboveGrade: boolean;
}
export interface FamilyResult {
  answered: number;
  correct: number;
  skipped: number;
  medianMs: number | null;
  accuracy: "secure" | "needs-practice" | null;
  speed: "quick" | "needs-practice" | null;
}
// Structural extension so P3 compiles before P1 merges.
type FamilyFacts = FactsResult & { byFamily?: Partial<Record<FactFamilyId, FamilyResult>> };
export interface BookFactFamily {
  family: FactFamilyId;
  state: "known" | "needs-practice" | "not-measured";
  source: "family" | "section" | "none";
  result: FamilyResult | null;
}
export interface BookSignals {
  grade: Grade;
  /** False preserves the old grade-and-standards path, including profiles with events but no assessment. */
  hasAssessment: boolean;
  working: LearnerProfile["level"] | null;
  strands: Pick<LearnerProfile["strands"][number], "strand" | "level" | "status" | "certainty" | "levelCertainty" | "correct" | "total">[];
  standards: BookStandard[];
  weak: BookStandard[];
  clearlyWeak: BookStandard[];
  earlyWeak: BookStandard[];
  secure: BookStandard[];
  mistakes: { standard: string; misconceptions: string[]; stuckSteps: string[]; wrong: number; withHelp: number; blank: number; hints: number }[];
  events: { counted: number; inAssessmentProfile: number } | null;
  facts: BookFactFamily[];
  unknowns: { untested: string[]; checkNext: string[]; earlyLevel: boolean; earlyStrands: string[] } | null;
  behaviour: { medianMs: number | null; veryFast: number; leftOut: number; unreliable: boolean; rushRuns: number; lateDrop: boolean | null; readAloud: number | null; whiteboard: LearnerProfile["behaviour"]["whiteboard"] | null; helpLikely: boolean; helpAnswer: LearnerProfile["behaviour"]["help"]["answer"]; helpFlags: number } | null;
  preferences: { styles: LearningStyle[]; interests: Interest[] };
  parent: ChildLearnerProfile["parent"];
  /** Code values for downstream plan rules. No page mix or layout changes occur in this module. */
  adjustments: { trustedAboveGrade: boolean; stretchShift: 0 | 1 | 2; hardChallenge: boolean; picturesThrough: 3 | 5; shortStories: boolean; storyShare: 0.2 | null; requiredMinutes: number | null; extraChallenge: boolean };
  /** Only standard codes survive soft input. Consumers may use these to order equal candidates only. */
  soft: { weakOrder: string[]; reviewOrder: string[]; challengeOrder: string[]; suggested: string[]; dropped: { standard: string; reason: string }[] };
  report: { howWeHelp: "behind" | "on-grade" | "ahead" | null; minutes: number | null; device: TestDevice | null };
  trace: SignalTrace[];
}
export interface BookSignalsInput {
  grade: Grade;
  profile: ChildLearnerProfile | null;
  report?: { howWeHelp?: "behind" | "on-grade" | "ahead" | null; minutes?: number | null } | null;
  device?: TestDevice | null;
  /** At plan time, restrict soft choices to the selected level and already allowed standards. */
  allowedStandards?: readonly string[];
}
const MAP = new Map(BC_SKILL_MAP.standards.map(s => [s.code, s]));
const unique = (values: readonly string[]) => [...new Set(values)];
const codes = (values: readonly string[]) => unique(values.filter(c => MAP.has(c)));
const familyIds = [...new Set(Object.values(FACTS_BY_GRADE).flat())];
const absentParent = { feeling: null, goal: null, weeklyTime: null };

/** Extracts signals without retaining the profile or reading answers, report prose, or parent notes. */
export function bookSignals(input: BookSignalsInput): BookSignals {
  const p = input.profile;
  const stored = p?.assessment?.profile;
  const a = stored?.schemaVersion === 1 ? stored : undefined;
  const b = a?.behaviour;
  const grade = input.grade;
  const standards = (p?.standards ?? []).flatMap(s => {
    const known = MAP.get(s.code);
    return known ? [{ code: s.code, grade: known.grade, status: s.status, certainty: s.certainty, aboveGrade: known.grade > grade }] : [];
  });
  const weak = standards.filter(s => !s.aboveGrade && s.status !== "secure");
  const secure = standards.filter(s => s.status === "secure");
  const weakCodes = new Set(weak.map(s => s.code));
  const secureCodes = new Set(secure.map(s => s.code));
  const allowed = input.allowedStandards ? new Set(input.allowedStandards) : null;
  const preferences = { styles: [...(p?.preferences?.styles ?? [])], interests: [...(p?.preferences?.interests ?? [])] };
  const parent = { feeling: p?.parent?.feeling ?? absentParent.feeling, goal: p?.parent?.goal ?? absentParent.goal, weeklyTime: p?.parent?.weeklyTime ?? absentParent.weeklyTime };
  const working = a?.level ? { working: a.level.working, certainty: a.level.certainty, confidence: a.level.confidence, atCeiling: a.level.atCeiling } : null;
  const strands = (a?.strands ?? []).map(s => ({ strand: s.strand, level: s.level, status: s.status, certainty: s.certainty, levelCertainty: s.levelCertainty, correct: s.correct, total: s.total }));
  const rushed = !!b && (b.unreliable || b.rushRuns > 0);
  const trustedAboveGrade = !!working && working.working > grade && working.certainty === "clear" && working.confidence === "normal" && !!b && !b.help?.likely && !rushed;
  const stretch = !!working && (working.working > grade || working.atCeiling || (parent.goal === "get_ahead" && working.working === grade && strands.length === 4 && strands.every(s => s.status === "secure")));
  const shift = !rushed && stretch ? parent.feeling === "avoids" ? 1 : 2 : 0;
  const baseMinutes = parent.weeklyTime === "under_1h" ? 20 : parent.weeklyTime === "1_to_2h" ? 25 : null;
  const lateDrop = b?.thirds?.drop ?? null;
  const requiredMinutes = lateDrop ? (baseMinutes ?? 35) - 5 : baseMinutes;
  const mistakes = (p?.standards ?? []).filter(s => MAP.has(s.code) && MAP.get(s.code)!.grade <= grade).flatMap(s => {
    const wrong = a?.struggles?.filter(x => x.code === s.code).flatMap(x => x.wrong ?? []) ?? [];
    const e = s.events;
    const misconceptions = unique([...wrong.flatMap(x => x.misconception ? [x.misconception] : []), ...(e?.mistakes ?? [])]);
    const stuckSteps = [...(e?.stuckSteps ?? [])];
    return misconceptions.length || stuckSteps.length || wrong.length || (e && e.wrong + e.rightWithHelp + e.blank + e.hints > 0)
      ? [{ standard: s.code, misconceptions, stuckSteps, wrong: wrong.length + (e?.wrong ?? 0), withHelp: e?.rightWithHelp ?? 0, blank: e?.blank ?? 0, hints: e?.hints ?? 0 }] : [];
  });
  const section = a?.facts as FamilyFacts | null | undefined;
  const facts = familyIds.map((family): BookFactFamily => {
    const measured = section?.families.includes(family) ?? false;
    const row = measured ? section?.byFamily?.[family] : undefined;
    const source = row ? "family" : measured && !section?.byFamily ? "section" : "none";
    const score = source === "family" ? row : source === "section" ? section : null;
    const result = score ? { answered: score.answered, correct: score.correct, skipped: score.skipped, medianMs: score.medianMs, accuracy: score.accuracy, speed: score.speed } : null;
    const state = result?.accuracy === "needs-practice" || result?.speed === "needs-practice" ? "needs-practice" : result?.accuracy === "secure" && result.speed === "quick" ? "known" : "not-measured";
    return { family, state, source, result };
  });
  const aiPlan = a?.ai?.workbookPlan?.value;
  const findings = codes((p?.events?.counted ?? 0) > 0 ? p?.ai?.findings?.map(f => f.standard) ?? [] : []);
  const review = codes(aiPlan?.review.standards ?? []);
  const practise = codes(aiPlan?.practise.standards ?? []);
  const challenge = codes([...(a?.ai?.nextChallenge?.value ?? []), ...(aiPlan?.stretch.standards ?? [])]);
  const suggested = codes([...review, ...practise, ...challenge, ...findings]);
  const permitted = (c: string) => MAP.get(c)!.grade <= grade && (!allowed || allowed.has(c));
  const soft = {
    weakOrder: codes([...practise, ...findings]).filter(c => permitted(c) && weakCodes.has(c)),
    reviewOrder: review.filter(c => permitted(c) && secureCodes.has(c)),
    challengeOrder: challenge.filter(c => permitted(c) && secureCodes.has(c)),
    suggested,
    dropped: suggested.filter(c => !permitted(c)).map(c => ({ standard: c, reason: MAP.get(c)!.grade > grade ? "above school grade, not a weakness" : "not in this level" })),
  };
  const unknowns = a?.unknowns ? { untested: codes(a.unknowns.untested.map(s => s.code)), checkNext: codes(a.unknowns.checkNext.map(s => s.code)), earlyLevel: a.unknowns.earlySigns.level, earlyStrands: [...a.unknowns.earlySigns.strands] } : null;
  const behaviour = b ? { medianMs: b.medianMs, veryFast: b.veryFast, leftOut: b.leftOut, unreliable: b.unreliable, rushRuns: b.rushRuns, lateDrop, readAloud: b.readAloud?.questions ?? null, whiteboard: b.whiteboard ? { required: b.whiteboard.required, requiredWithWork: b.whiteboard.requiredWithWork, optionalWithWork: b.whiteboard.optionalWithWork } : null, helpLikely: b.help?.likely ?? false, helpAnswer: b.help?.answer ?? null, helpFlags: b.help?.flags.length ?? 0 } : null;
  const device = input.device;
  const report = { howWeHelp: input.report?.howWeHelp ?? null, minutes: input.report?.minutes ?? null, device: device ? { deviceClass: device.deviceClass, input: device.input, screenWidth: device.screenWidth, screenHeight: device.screenHeight, browser: device.browser } : null };
  const trace: SignalTrace[] = [];
  const add = (id: SignalId, reliability: Reliability, present: boolean, used: boolean, reason: string) => trace.push({ id, reliability, status: !present ? "missing" : used ? "used" : "not-used", reason: !present ? "not recorded; use the standard book rule" : reason });
  add("S1", "fact", true, true, "school grade bounds weaknesses");
  add("S2", working?.certainty ?? "early-sign", !!working, true, trustedAboveGrade ? "clear, trusted level permits an above-grade start" : "working level with its trust checks");
  add("S3", "fact", working?.atCeiling !== undefined, !!working?.atCeiling, "the start never exceeds the measured level");
  add("S4", strands.every(s => s.certainty === "clear") ? "clear" : "early-sign", strands.length > 0, true, "area status and certainty; secure areas can permit the parent's get-ahead request");
  add("S5", standards.every(s => s.certainty === "clear") ? "clear" : "early-sign", standards.length > 0, true, "only clear secure units can skip first-book teaching");
  add("S6", weak.every(s => s.certainty === "clear") ? "clear" : "early-sign", !!p, weak.length > 0, weak.length ? "weaknesses at or below school grade only" : "no weakness at or below school grade");
  add("S7", "fact", !!a, mistakes.some(m => m.misconceptions.length > 0), "use coded mistakes at or below school grade; never copy answers");
  add("S8", "fact", !!p?.events, (p?.events.counted ?? 0) > 0, "counted learning events; no event identifiers or question text");
  add("S9", "fact", !!section, !!section && section.answered > 0, section?.byFamily ? "per-family accuracy and speed" : "older profile: section result applies only to the families asked");
  add("S10", "fact", !!unknowns, !!unknowns && (unknowns.untested.length + unknowns.checkNext.length > 0), "unmeasured units keep placement checks");
  add("S11", "fact", !!b, rushed, rushed ? "rushing blocks stretch" : "pace alone has no slow norm and changes nothing");
  add("S12", "fact", lateDrop !== null, lateDrop === true, "a measured late drop reduces the required estimate by five minutes");
  add("S13", "fact", behaviour?.readAloud !== null && !!behaviour, (behaviour?.readAloud ?? 0) >= 3, "three or more questions read aloud select short stories");
  add("S14", "fact", !!b?.whiteboard, false, "shown work is for the admin view only");
  add("S15", "fact", !!b?.help, true, "likely help blocks an above-grade start");
  add("S16", "fact", true, false, "answer changes are keystrokes; never read them");
  add("S17", "parent", preferences.styles.length + preferences.interests.length > 0, true, "parent interests choose code nouns; styles change at most one item per page");
  add("S18", "parent", Object.values(parent).some(v => v !== null), true, "parent answers apply within facts and curriculum bounds");
  add("S19", "soft", !!a?.ai, suggested.length > 0, "standard codes may break ties only; ignore prose and percentages");
  add("S20", "soft", !!p?.ai, findings.length > 0, "finding standard codes may break ties only; ignore hypothesis text");
  add("S21", "fact", report.howWeHelp !== null, true, "code howWeHelp is a consistency check; never read summary or comments");
  add("S22", "fact", report.minutes !== null || report.device !== null, false, "test length and device are for the admin view only");
  return { grade, hasAssessment: !!working, working, strands, standards, weak, clearlyWeak: weak.filter(s => s.certainty === "clear"), earlyWeak: weak.filter(s => s.certainty !== "clear"), secure, mistakes, events: p?.events ? { counted: p.events.counted, inAssessmentProfile: p.events.inAssessmentProfile } : null, facts, unknowns, behaviour, preferences, parent, adjustments: { trustedAboveGrade, stretchShift: shift, hardChallenge: shift > 0, picturesThrough: parent.goal === "catch_up" ? 5 : 3, shortStories: (behaviour?.readAloud ?? 0) >= 3, storyShare: (behaviour?.readAloud ?? 0) >= 3 ? 0.2 : null, requiredMinutes, extraChallenge: parent.feeling === "avoids" }, soft, report, trace };
}
