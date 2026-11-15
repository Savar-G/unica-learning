// The first-week review of Maya's family calls (Savar, 2026-11-15; docs/maya-tutor.md, "First-week review and kill
// switches"). Pure code over the rows the script reads: no network, no clock, no database. It reads the saved trace and
// flags what a person must look at. Every flag is read by code, with no AI. A flag is a review prompt, not a verdict.
//
// The trace is read tolerantly (any version): this module reads only the fields it names and never throws on a shape it
// does not know.

export const FLAG_NAMES = ["overrides", "mathRefusals", "judgments", "help", "safety"] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

/** The judgment words of flag (c). A short fixed list is enough for a review flag. */
export const JUDGMENT_WORDS = ["right", "correct", "yes", "good job", "perfect", "exactly", "great", "well done", "nice", "that's it"] as const;

/** What the script reads for one call. No names, no email. */
export interface ReviewCall {
  id: string;
  startedAt: string | null;
  kind: string;
  mode: string;
  /** "real" or "test" (public.test_accounts). */
  family: "real" | "test";
  /** A short id of the family, never a name. */
  familyShortId: string;
  questionRef: string;
  /** The question's text, to read its answer when the package gave none. */
  questionText: string | null;
  /** The question's right answer, when the script read it from the stored package. */
  answer: number | null;
  /** The saved trace, any version. */
  trace: unknown;
  /** maya_calls.assistance: the help level the call recorded. */
  assistance: string | null;
  /** maya_calls.flag and maya_calls.safety_flag. */
  flag: string | null;
  safetyFlag: boolean;
  /** The parent note's facts, or null when the call has none. */
  note: { finished: string | null; help: string | null; sentences: string[] } | null;
  /** The learning event the call wrote, or null. */
  event: { result: string; hints: number } | null;
  /** maya_call_alerts rows of the call. */
  alerts: { level: string; status: string }[];
}

export interface OverrideFlag { overrides: number; repairs: number; fallbacks: number; kinds: string[] }
export interface MathRefusalFlag { sentence: string; verdict: string; reason: string }
export interface JudgmentFlag { turn: number; sentence: string; word: string }
export interface HelpFlag { why: string[]; saidIn: string; recordedAssistance: string | null; noteFinished: string | null }
export interface SafetyFlag { flag: string | null; alerts: string[] }

export interface CallReview {
  call: ReviewCall;
  path: "tutor" | "controller" | "unknown";
  turns: { child: number; maya: number } | null;
  link: string;
  overrides: OverrideFlag | null;
  mathRefusals: MathRefusalFlag[];
  judgments: JudgmentFlag[];
  help: HelpFlag | null;
  safety: SafetyFlag | null;
  flags: FlagName[];
}

export interface ReviewTotals {
  calls: number;
  real: number;
  test: number;
  tutor: number;
  controller: number;
  unknownPath: number;
  chat: number;
  voice: number;
  flagged: number;
  byFlag: Record<FlagName, number>;
}

export interface FamilyReview {
  from: string;
  to: string;
  hours: number;
  totals: ReviewTotals;
  calls: CallReview[];
}

// ---------- Reading the trace ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const turnsOf = (trace: unknown): Obj[] => (isObj(trace) ? arr(trace.turns).filter(isObj) : []);
const mayaTurns = (trace: unknown): Obj[] => turnsOf(trace).filter((t) => t.kind === "maya");
const attemptsOf = (turn: Obj): Obj[] => arr(turn.attempts).filter(isObj);

/** Whether the call ran on the tutor core or the controller. The tutor writes `mathReviewer`, and its model proposal has a `gate`. */
export function pathOf(trace: unknown): "tutor" | "controller" | "unknown" {
  if (!isObj(trace) || !Array.isArray(trace.turns)) return "unknown";
  if (trace.mathReviewer !== undefined) return "tutor";
  const gate = mayaTurns(trace).some((t) => attemptsOf(t).some((a) => isObj(a.proposal) && "gate" in a.proposal));
  return gate ? "tutor" : "controller";
}

/** Child and Maya turns of the trace, or null when there is no trace. */
export function turnCounts(trace: unknown): { child: number; maya: number } | null {
  if (!isObj(trace) || !Array.isArray(trace.turns)) return null;
  const turns = turnsOf(trace);
  return { child: turns.filter((t) => t.kind === "child").length, maya: turns.filter((t) => t.kind === "maya").length };
}

/** Flag (a): the Maya turns where code changed the model's first words, the repairs and the fallbacks, with their kinds. */
export function overrideFlag(trace: unknown): OverrideFlag | null {
  let overrides = 0, repairs = 0, fallbacks = 0;
  const kinds: string[] = [];
  for (const t of mayaTurns(trace)) {
    const attempts = attemptsOf(t);
    const output = isObj(t.output) ? t.output : null;
    // Code's own safety guidance replaces no model words: it is not an override (as traceCounts counts it).
    const changed = output?.act !== "safety" && attempts.some((a) => a.source !== "controller" && (a.refusal != null || a.source === "fallback" || arr(a.dropped).length > 0));
    if (changed) overrides++;
    for (const a of attempts) {
      if (a.source === "repair") repairs++;
      if (a.source === "fallback") fallbacks++;
      if (isObj(a.refusal)) kinds.push(`refusal:${str(a.refusal.say) || str(a.refusal.code) || "unknown"}`);
      if (a.source === "repair") kinds.push("repair");
      if (a.source === "fallback") kinds.push("fallback");
      if (arr(a.dropped).length > 0) kinds.push("dropped");
    }
  }
  if (overrides === 0 && repairs === 0 && fallbacks === 0) return null;
  return { overrides, repairs, fallbacks, kinds: [...new Set(kinds)].sort() };
}

/** Flag (b): the math-truth reviews whose final result is not "true", with the sentence. */
export function mathRefusals(trace: unknown): MathRefusalFlag[] {
  const out: MathRefusalFlag[] = [];
  for (const t of mayaTurns(trace)) {
    for (const a of attemptsOf(t)) {
      for (const m of arr(a.math).filter(isObj)) {
        if (m.verdict !== "true") out.push({ sentence: str(m.sentence), verdict: str(m.verdict) || "unknown", reason: str(m.reason) });
      }
    }
  }
  return out;
}

/** The words Maya said in a turn: what reached the child. */
const saidIn = (turn: Obj): string[] => (isObj(turn.output) ? arr(turn.output.say).filter((s): s is string => typeof s === "string") : []);

/**
 * Whether the child's turn that this Maya turn answers was wrong: the accepted reading holds a "wrong" verdict and no
 * "right" one, or the count of committed wrong final answers rose (`finalMisses`).
 */
function childWasWrong(turn: Obj, previousMisses: number): boolean {
  const accepted = attemptsOf(turn).at(-1);
  const reading = accepted && isObj(accepted.proposal) && isObj(accepted.proposal.reading) ? accepted.proposal.reading : null;
  const verdicts = reading ? arr(reading.answers).filter(isObj).map((a) => a.verdict) : [];
  const readWrong = verdicts.includes("wrong") && !verdicts.includes("right");
  const misses = typeof turn.finalMisses === "number" ? turn.finalMisses : previousMisses;
  return readWrong || misses > previousMisses;
}

const wordPattern = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['\u2019]");
const JUDGMENT = new RegExp(`\\b(${[...JUDGMENT_WORDS].sort((a, b) => b.length - a.length).map(wordPattern).join("|")})\\b`, "gi");
/** A negation right before the word ("not right", "isn't correct", "not quite right"): a correction, not praise. */
const NEGATED_BEFORE = /(?:\bnot|n['\u2019]t)(?:\s+quite)?\s+$/i;

/** The judgment word a sentence holds, or null. A negated word ("not quite right") is no match. */
export function judgmentWord(sentence: string): string | null {
  for (const m of sentence.matchAll(JUDGMENT)) {
    const before = sentence.slice(0, m.index);
    if (!NEGATED_BEFORE.test(before)) return m[1]!.toLowerCase();
  }
  return null;
}

/** Splits Maya's words into sentences. */
const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/** Flag (c): a Maya sentence after the child's wrong answer that holds a judgment word. */
export function judgmentFlags(trace: unknown): JudgmentFlag[] {
  const out: JudgmentFlag[] = [];
  let misses = 0;
  mayaTurns(trace).forEach((t, i) => {
    const wrong = childWasWrong(t, misses);
    if (typeof t.finalMisses === "number") misses = t.finalMisses;
    if (!wrong) return;
    for (const piece of saidIn(t)) {
      for (const sentence of sentencesOf(piece)) {
        const word = judgmentWord(sentence);
        if (word) out.push({ turn: i + 1, sentence, word });
      }
    }
  });
  return out;
}

// ---------- The help level (flag d) ----------

/** The answer of a "a + b" or "a - b" question text, or null. Only the plain two-number form of the tutor's scope. */
export function answerFromQuestionText(text: string | null): number | null {
  if (!text) return null;
  const m = /(\d{1,6})\s*([+\-\u2212\u2013])\s*(\d{1,6})/.exec(text.replace(/,/g, ""));
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[3]);
  return m[2] === "+" ? a + b : a - b;
}

/** Whether a text holds the number as one whole number (not part of 124, 2.4 or 1,240). */
export function holdsNumber(text: string, n: number): boolean {
  return new RegExp(`(?<![\\d.,])${String(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d]|[.,]\\d)`).test(text);
}

const ORDER = ["independent", "hint", "worked_example", "guided", "answer_given"];

/**
 * Flag (d): Maya's words held the answer value before the child said it, but the record says less than answer_given, or
 * the parent note says the child needed no help. Reads digits only; an answer given in place words is not read here.
 */
export function helpFlag(call: ReviewCall): HelpFlag | null {
  const answer = call.answer ?? answerFromQuestionText(call.questionText);
  if (answer === null) return null;
  let said: string | null = null;
  for (const t of turnsOf(call.trace)) {
    if (t.kind === "child" && holdsNumber(str(t.text), answer)) break;
    if (t.kind === "maya" && said === null) {
      const hit = saidIn(t).find((s) => holdsNumber(s, answer));
      if (hit) said = hit;
    }
  }
  if (said === null) return null;
  const why: string[] = [];
  const level = call.assistance;
  if (level !== "answer_given" && (level === null || ORDER.includes(level))) why.push(`the call records "${level ?? "no help level"}", less than "answer_given"`);
  const finished = call.note?.finished ?? null;
  if (call.note && (finished === "on_own" || call.note.help === "independent" || call.note.sentences.some((s) => /\bno help\b|\bon (?:his|her|their) own\b|\bwithout help\b/i.test(s)))) why.push("the parent note says the child needed no help");
  if (why.length === 0) return null;
  return { why, saidIn: said, recordedAssistance: level, noteFinished: finished };
}

// ---------- One call and the whole window ----------

export function safetyFlag(call: ReviewCall): SafetyFlag | null {
  if (!call.flag && !call.safetyFlag && call.alerts.length === 0) return null;
  return { flag: call.flag, alerts: call.alerts.map((a) => `${a.level} (${a.status})`) };
}

export function reviewCall(call: ReviewCall, origin = "https://unicalearning.com"): CallReview {
  const overrides = overrideFlag(call.trace);
  const math = mathRefusals(call.trace);
  const judgments = judgmentFlags(call.trace);
  const help = helpFlag(call);
  const safety = safetyFlag(call);
  const flags: FlagName[] = [];
  if (overrides) flags.push("overrides");
  if (math.length > 0) flags.push("mathRefusals");
  if (judgments.length > 0) flags.push("judgments");
  if (help) flags.push("help");
  if (safety) flags.push("safety");
  return {
    call, path: pathOf(call.trace), turns: turnCounts(call.trace), link: `${origin}/admin/maya/${call.id}`,
    overrides, mathRefusals: math, judgments, help, safety, flags,
  };
}

export function reviewCalls(calls: ReviewCall[], window: { from: string; to: string; hours: number }, origin?: string): FamilyReview {
  const reviews = [...calls].sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? "")).map((c) => reviewCall(c, origin));
  const byFlag = Object.fromEntries(FLAG_NAMES.map((f) => [f, reviews.filter((r) => r.flags.includes(f)).length])) as Record<FlagName, number>;
  const totals: ReviewTotals = {
    calls: reviews.length,
    real: reviews.filter((r) => r.call.family === "real").length,
    test: reviews.filter((r) => r.call.family === "test").length,
    tutor: reviews.filter((r) => r.path === "tutor").length,
    controller: reviews.filter((r) => r.path === "controller").length,
    unknownPath: reviews.filter((r) => r.path === "unknown").length,
    chat: reviews.filter((r) => r.call.mode !== "voice").length,
    voice: reviews.filter((r) => r.call.mode === "voice").length,
    flagged: reviews.filter((r) => r.flags.length > 0).length,
    byFlag,
  };
  return { ...window, totals, calls: reviews };
}

// ---------- The report ----------

const FLAG_LABEL: Record<FlagName, string> = {
  overrides: "override, repair or fallback",
  mathRefusals: "math-review refusal",
  judgments: "judgment word after a wrong answer",
  help: "help level against Maya's words",
  safety: "safety flag or alert",
};

const shortId = (id: string): string => id.slice(0, 8);
const quote = (s: string): string => `"${s.replace(/\s+/g, " ").trim()}"`;

/** The totals as one line. It holds counts only. */
export function totalsLine(t: ReviewTotals): string {
  const flags = FLAG_NAMES.map((f) => `${f} ${t.byFlag[f]}`).join(", ");
  return `Totals: ${t.calls} calls (${t.real} real, ${t.test} test; ${t.chat} chat, ${t.voice} voice); tutor ${t.tutor}, controller ${t.controller}${t.unknownPath ? `, no trace ${t.unknownPath}` : ""}; flagged ${t.flagged} (${flags}).`;
}

export function renderReport(review: FamilyReview): string {
  const lines: string[] = [];
  lines.push("# Maya family calls: daily review", "");
  lines.push(`Window: ${review.from} to ${review.to} (${review.hours} h). Read only. Every flag is read by code from the saved trace; a flag asks a person to look, it is no verdict.`, "");
  lines.push(totalsLine(review.totals), "");
  const flagged = review.calls.filter((r) => r.flags.length > 0);
  const clean = review.calls.filter((r) => r.flags.length === 0);
  lines.push("## Flagged calls", "");
  if (flagged.length === 0) lines.push("None.", "");
  for (const r of flagged) {
    const c = r.call;
    lines.push(`### ${shortId(c.id)}: ${r.flags.map((f) => FLAG_LABEL[f]).join("; ")}`, "");
    lines.push(`- Started ${c.startedAt ?? "unknown"}; ${c.kind}, ${c.mode}; ${c.family} family ${c.familyShortId}; ${c.questionRef}`);
    lines.push(`- ${r.turns ? `${r.turns.child} child turns, ${r.turns.maya} Maya turns` : "no trace"}; path: ${r.path}; ${r.link}`);
    if (r.overrides) lines.push(`- Overrides ${r.overrides.overrides}, repairs ${r.overrides.repairs}, fallbacks ${r.overrides.fallbacks}; kinds: ${r.overrides.kinds.join(", ") || "none"}`);
    for (const m of r.mathRefusals) lines.push(`- Math review "${m.verdict}": ${quote(m.sentence)}${m.reason ? ` (${quote(m.reason)})` : ""}`);
    for (const j of r.judgments) lines.push(`- Maya turn ${j.turn}, after a wrong answer, said "${j.word}": ${quote(j.sentence)}`);
    if (r.help) lines.push(`- Help level: ${r.help.why.join("; ")}. Maya said ${quote(r.help.saidIn)}`);
    if (r.safety) lines.push(`- Safety: flag ${r.safety.flag ?? "none"}; alerts: ${r.safety.alerts.join(", ") || "none"}`);
    lines.push("");
  }
  lines.push("## Clean calls", "");
  lines.push(clean.length === 0 ? "None." : clean.map((r) => `${shortId(r.call.id)} (${r.path})`).join(", "), "");
  return lines.join("\n");
}
