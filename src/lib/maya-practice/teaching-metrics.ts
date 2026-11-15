// The tutor core's trace metrics (D-345, teaching design section 5): pure code on a saved MayaTrace, no AI, cheap enough
// for every call. Targets from the approved design: an override rate under 5% of Maya's teaching turns, and a longest
// run of Maya turns of 1 (Maya speaks, then the child). The metrics are counted from the trace's turns, not from its
// stored `counts`, so a trace edited after the run does not move them.
import { valuesIn } from "@/lib/maya";
import { traceCounts, type MayaTrace, type TraceTurn } from "@/lib/maya-trace";

/** The design's targets. The override rate is a share of Maya's teaching turns; the run is a count of Maya turns. */
export const OVERRIDE_TARGET = 0.05;
export const LONGEST_RUN_TARGET = 1;

/** A set misconception a simulated child holds, and the value that shows it is fixed. */
export interface Misconception {
  /** The wrong numbers the child says while they hold it (any of them shows the misconception). */
  wrong: readonly number[];
  /** The number the child says once it is fixed (the corrected step or the right answer). */
  right: number;
}

export interface TeachingMetrics {
  /** Maya turns that said something and were not code's own opening or safety line. */
  teachingTurns: number;
  /** Turns where code changed the model's first words (a refusal, a fallback or a dropped sentence). */
  overrides: number;
  /** overrides / teachingTurns; null with no teaching turn. */
  overrideRate: number | null;
  /** The longest run of Maya turns with no child turn between them (the opening counts). */
  longestMayaRun: number;
  /** Maya's words said, and the child's words, over the whole call. */
  mayaWords: number;
  childWords: number;
  /** mayaWords / childWords; null when the child said nothing. */
  wordsPerChildWord: number | null;
  /**
   * The child's first attempt: the first child turn that holds a number or a step and is not a request for help. Null
   * when the child never tried. `mayaTurns` is the Maya turns that said something before it; `seconds` the time from
   * the start of the call to it, by the passed-in clock.
   */
  firstAttempt: { mayaTurns: number; seconds: number } | null;
  /** Whether the child fixed a set misconception; null when the case sets none or the child never held it. */
  misconception: { held: boolean; fixed: boolean } | null;
}

const WORD = /\S+/g;
const wordCount = (text: string) => text.match(WORD)?.length ?? 0;

const NUMBER_WORDS = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/i;
const STEP_WORDS = /\b(?:ones?|tens?|hundreds?|carry|carried|borrow|borrowed|trade|traded|regroup\w*|plus|minus|add|subtract|take away|times|multiply|divided)\b/i;
/**
 * A turn that asks for help or says the child is stuck or cannot start is a request, not an attempt, even when it names the
 * numbers. The one help-request check: the first-attempt metric and the teaching judge's T03 (a child who cannot start) both use it.
 */
const HELP_REQUEST = /\b(?:don'?t|do not|didn'?t|can'?t|cannot)\s+(?:get|know|understand|see|do|start)\b|\bteach me\b|\bhelp\b|\bhow (?:do|to|can)\b|\bstuck\b|\bconfused\b|\bnot sure\b|\bno idea\b|\bwhat (?:is|do|does|are)\b|\bwhy\b/i;

/** Whether a child turn asks for help or says the child cannot start. */
export const isHelpRequest = (text: string) => HELP_REQUEST.test(text);

/** Whether a child turn is an attempt: a number or a step, and not only a request for help. */
export function isAttempt(text: string): boolean {
  if (isHelpRequest(text) && !/\b\d+\s*(?:is|=)\s*\d+/.test(text)) return false;
  return /\d/.test(text) || NUMBER_WORDS.test(text) || STEP_WORDS.test(text);
}

/** The numbers a child turn holds, in digits or words, read by the session's own number reader ("Twenty-four" gives 24). */
export function numbersIn(text: string): number[] {
  return valuesIn(text).flatMap((v) => (v.type === "number" ? [Math.abs(v.value)] : []));
}

/** Maya turns that said something. Code's own lines (the opening, a safety line: source "controller") are not teaching. */
const saidTurns = (turns: readonly TraceTurn[]) => turns.filter((t): t is Extract<TraceTurn, { kind: "maya" }> => t.kind === "maya" && t.output !== null && t.output.say.length > 0);
const isTeaching = (t: Extract<TraceTurn, { kind: "maya" }>) => t.attempts[0]?.source !== "controller";

/**
 * Whether a set misconception was fixed, from the child's turns and the trace's credited answers: the child said a
 * wrong number first, then said the right one in a later turn, and either the call ended solved or the session
 * credited that right answer in Maya's accepted reading (the model's reading is checked by code before it is saved).
 * `held` is false when the child never said a wrong number: the case did not play out, and nothing is claimed.
 */
export function misconceptionFixed(trace: MayaTrace, m: Misconception): { held: boolean; fixed: boolean } {
  const children = trace.turns.flatMap((t, i) => (t.kind === "child" ? [{ i, text: t.text }] : []));
  const wrong = children.find((c) => numbersIn(c.text).some((n) => m.wrong.includes(n)));
  if (!wrong) return { held: false, fixed: false };
  const later = children.find((c) => c.i > wrong.i && numbersIn(c.text).includes(m.right));
  if (!later) return { held: true, fixed: false };
  const credited = trace.turns.some((t, i) => i > later.i && t.kind === "maya" && t.attempts.some((a) => creditsRight(a.proposal, m.right)));
  return { held: true, fixed: trace.outcome?.reason === "solved" || credited };
}

/** Whether a proposal's reading credits `right` as a right answer. */
function creditsRight(proposal: unknown, right: number): boolean {
  const answers = (proposal as { reading?: { answers?: unknown } } | null | undefined)?.reading?.answers;
  if (!Array.isArray(answers)) return false;
  return answers.some((a) => {
    const x = a as { verdict?: unknown; value?: { type?: unknown; value?: unknown } } | null;
    return x?.verdict === "right" && x.value?.type === "number" && x.value.value === right;
  });
}

/** The metrics of one saved trace. `misconception` is the case's set misconception, when it has one. */
export function teachingMetrics(trace: MayaTrace, misconception?: Misconception): TeachingMetrics {
  const counts = traceCounts(trace.turns);
  const said = saidTurns(trace.turns);
  const teaching = said.filter(isTeaching);
  const overrides = counts.overrides ?? 0;
  const mayaWords = said.reduce((n, t) => n + t.output!.say.reduce((k, s) => k + wordCount(s), 0), 0);
  const childWords = trace.turns.reduce((n, t) => n + (t.kind === "child" ? wordCount(t.text) : 0), 0);

  let firstAttempt: TeachingMetrics["firstAttempt"] = null;
  const start = trace.turns[0]?.at ?? 0;
  let mayaBefore = 0;
  for (const t of trace.turns) {
    if (t.kind === "maya" && t.output && t.output.say.length > 0) mayaBefore++;
    else if (t.kind === "child" && isAttempt(t.text)) {
      firstAttempt = { mayaTurns: mayaBefore, seconds: Math.max(0, (t.at - start) / 1000) };
      break;
    }
  }
  return {
    teachingTurns: teaching.length,
    overrides,
    overrideRate: teaching.length > 0 ? overrides / teaching.length : null,
    longestMayaRun: counts.longestMayaRun ?? 0,
    mayaWords,
    childWords,
    wordsPerChildWord: childWords > 0 ? mayaWords / childWords : null,
    firstAttempt,
    misconception: misconception ? misconceptionFixed(trace, misconception) : null,
  };
}

/** Which of the design's targets a call missed (an empty list is a pass). A null rate has no teaching turn to miss. */
export function metricProblems(m: TeachingMetrics): string[] {
  const out: string[] = [];
  if (m.overrideRate !== null && m.overrideRate >= OVERRIDE_TARGET) out.push(`override rate ${(m.overrideRate * 100).toFixed(1)}% is not under ${OVERRIDE_TARGET * 100}%`);
  if (m.longestMayaRun > LONGEST_RUN_TARGET) out.push(`${m.longestMayaRun} Maya turns in a row; the target is ${LONGEST_RUN_TARGET}`);
  if (m.misconception?.held && !m.misconception.fixed) out.push("the child held the set misconception and did not fix it");
  return out;
}
