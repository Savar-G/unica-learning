// The teaching judge of the practice suite (D-345, teaching design section 5; research `2-ai-tutors-and-maya-rules.md`
// A4): scores each Maya teaching turn of one saved call on ten dimensions, T01 to T10, 0 to 3, with a short reason.
// It sits beside the older judge (J01 to J09, judge.ts): that one scores a whole call; this one scores each turn, and
// the report keeps the worst and the median of each dimension per call.
//
// Code, not the judge, decides which dimensions apply to a turn (`teachingPlan`): T06 (the child gets a turn) is scored
// by code alone from the trace; T03 applies only after a child turn that asks for help or cannot start; T04 and T08 do not
// apply to a closing turn; T10 needs two teaching turns. The judge may mark only T02 (finds the stuck point) "n/a", when
// the child had no stuck point. The reader (`readTeachingJudgement`) refuses any answer outside the schema. The judge
// never sees model names. Its model must be another family than Maya's (`judgeFamilyProblem`).
//
// D-345 lifted the answer rule: Maya may tell a step or the answer. T07 therefore asks whether the child still does or
// explains the next part, not whether Maya withheld.
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import { stepText, valueText, type QuestionPackage } from "@/lib/question-package";
import type { MayaTrace } from "@/lib/maya-trace";
import { judgeTurns, type JudgeTurn } from "./judge";
import { isAttempt } from "./teaching-metrics";

/** Raise it when the prompt, the rubric or the input changes; every run records it. */
export const TEACHING_JUDGE_PROMPT_VERSION = "teaching-judge-1";

export const TEACHING_IDS = ["T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09", "T10"] as const;
export type TeachingId = (typeof TEACHING_IDS)[number];
/** The dimensions the judge scores: every one except T06, which code scores from the trace. */
export const JUDGED_IDS = TEACHING_IDS.filter((id) => id !== "T06") as Exclude<TeachingId, "T06">[];
export type JudgedId = (typeof JUDGED_IDS)[number];

/** Each dimension: its name and its four levels (0 to 3). From research A4, with level 1 written between 0 and 2. */
export const TEACHING_DIMENSIONS: Record<TeachingId, { name: string; levels: readonly [string, string, string, string] }> = {
  T01: {
    name: "answers what the child said",
    levels: [
      "Ignores what the child said, or answers something else.",
      "Touches what the child said but goes on with its own plan.",
      "Answers what the child said, then goes on.",
      "Answers it in the child's own words and numbers, even when speech-to-text garbled them (\"2 minus 8\" in 52 - 28 is the ones step: never penalise it).",
    ],
  },
  T02: {
    name: "finds the stuck point",
    levels: [
      "Gives no diagnosis of what is wrong or missing.",
      "Says something is wrong without saying where.",
      "Names the stuck step.",
      "Names the exact mistake or gap and where it is, in one plain sentence.",
    ],
  },
  T03: {
    name: "explains when the child cannot start",
    levels: [
      "Only asks a question, or works an example about another problem with no link to this one.",
      "Gives an idea, but not in the child's words or not tied to this problem.",
      "Gives the key idea in child words, then asks.",
      "Gives the key idea with the child's own numbers, then one tiny action.",
    ],
  },
  T04: {
    name: "one clear next action",
    levels: [
      "No next action, or a vague one (\"try again\").",
      "A next action, but unclear.",
      "A question, but with several things to do.",
      "Exactly one small thing to say or do.",
    ],
  },
  T05: {
    name: "chunk size",
    levels: [
      "More than 3 ideas, or more than 45 words.",
      "3 ideas, or 30 to 45 words.",
      "2 ideas, under 30 words.",
      "1 or 2 ideas, under 25 words, the question last.",
    ],
  },
  T06: {
    name: "the child gets a turn",
    levels: [
      "3 or more Maya turns in a row with no child turn.",
      "(not used)",
      "2 Maya turns in a row.",
      "The child speaks after every Maya turn.",
    ],
  },
  T07: {
    name: "the child does the thinking",
    levels: [
      "Maya does the whole task: she tells the step or the answer and leaves the child nothing to do or explain, or she closes on a stuck child.",
      "Maya tells it, and the child only repeats it back.",
      "Maya may tell a step with its reason, and the child still does the next part.",
      "Maya lets the child try first, gives the reason, and when she tells a step or the answer she has the child do or explain the next part, or a twin question.",
    ],
  },
  T08: {
    name: "checks understanding",
    levels: [
      "Never asks the child to do or explain anything.",
      "Asks only yes or no, or \"okay?\".",
      "Asks the child to do the step.",
      "Asks the child to do or explain the step in their own words.",
    ],
  },
  T09: {
    name: "tone",
    levels: [
      "Cold, scolding, or empty praise.",
      "Flat, or praise with nothing behind it (\"Great job!\").",
      "Neutral and warm.",
      "Specific praise of the child's effort, no generic praise, no hype.",
    ],
  },
  T10: {
    name: "natural and non-repeating",
    levels: [
      "Scripted, or repeats a sentence it already said.",
      "Stock phrases, or a repeated opening.",
      "Mostly natural.",
      "Varied, and sounds like a person.",
    ],
  },
};

/** What Maya's turn is judged on, and how. One entry per Maya teaching turn. */
export interface TeachingTurnPlan {
  /** The turn's id in the numbered turns the judge reads. */
  turn: number;
  /** The words of the turn, and its length. */
  words: number;
  /** The judged dimensions that apply to this turn. The others must come back "n/a". */
  score: JudgedId[];
  /** Of those, the ones the judge may mark "n/a" (T02: the child had no stuck point). */
  mayBeNotApplicable: JudgedId[];
  /** T06, scored by code: 3, 2 or 0 by how many Maya turns ran in a row. */
  code: { T06: 0 | 2 | 3 };
}

/** What the judge reads. */
export interface TeachingJudgeInput {
  promptVersion: string;
  channel: "voice" | "chat";
  question: { text: string; answer: string | null; steps: string[] };
  child: { age: number };
  /** Every turn of the call, numbered, with the board events. */
  turns: JudgeTurn[];
  /** The Maya turns to score, with the dimensions to score on each. */
  score: { turn: number; words: number; dimensions: JudgedId[]; mayBeNotApplicable: JudgedId[] }[];
  rubric: { id: JudgedId; name: string; levels: readonly string[] }[];
}

export interface TeachingJudge {
  readonly id: string;
  readonly promptVersion: string;
  /** The judgement (untrusted: `readTeachingJudgement` checks it). Throws when the model gives none. */
  judge(input: TeachingJudgeInput, signal: AbortSignal): Promise<unknown>;
}

/** A child turn that asks for help or says the child cannot start: T03 applies to the reply. */
const CANNOT_START = /\b(?:don'?t|do not|didn'?t|can'?t|cannot)\s+(?:get|know|understand|see|do|start)\b|\bteach me\b|\bhelp\b|\bhow (?:do|to|can)\b|\bstuck\b|\bconfused\b|\bnot sure\b|\bno idea\b/i;
export const cannotStart = (text: string) => CANNOT_START.test(text) && !isAttempt(text);

const wordCount = (text: string) => text.match(/\S+/g)?.length ?? 0;

/**
 * The plan for one saved trace: which Maya turns are teaching turns, which dimensions apply to each, and T06 by code.
 * Code's own lines (the opening, a safety line: the first attempt's source is "controller") are not judged.
 */
export function teachingPlan(trace: MayaTrace): TeachingTurnPlan[] {
  const numbered = judgeTurns(trace);
  const mayaIds = numbered.filter((t) => t.speaker === "maya").map((t) => t.id);
  const out: TeachingTurnPlan[] = [];
  let run = 0;
  let said = 0;
  let prevChild: string | null = null;
  const total = trace.turns.filter((t) => t.kind === "maya" && t.output && t.output.say.length > 0 && t.attempts[0]?.source !== "controller").length;
  for (const t of trace.turns) {
    if (t.kind === "child") {
      run = 0;
      prevChild = t.text;
    } else if (t.kind === "maya" && t.output && t.output.say.length > 0) {
      run++;
      const turn = mayaIds[said++];
      if (t.attempts[0]?.source === "controller") continue;
      const closing = t.output.act === "close";
      const score = JUDGED_IDS.filter((id) => {
        if (id === "T01") return prevChild !== null;
        if (id === "T03") return prevChild !== null && cannotStart(prevChild);
        if (id === "T04" || id === "T08") return !closing;
        if (id === "T10") return total >= 2;
        return true;
      });
      out.push({
        turn, words: t.output.say.reduce((n, s) => n + wordCount(s), 0), score,
        mayBeNotApplicable: score.filter((id) => id === "T02"),
        code: { T06: run >= 3 ? 0 : run === 2 ? 2 : 3 },
      });
    }
  }
  return out;
}

/** The judge input for one case's trace. */
export function teachingJudgeInput(pkg: QuestionPackage, age: number, trace: MayaTrace, channel: "voice" | "chat", childName: string): TeachingJudgeInput {
  const op = pkg.operation;
  const plan = teachingPlan(trace);
  const used = new Set(plan.flatMap((p) => p.score));
  return {
    promptVersion: TEACHING_JUDGE_PROMPT_VERSION,
    channel,
    question: { text: pkg.text, answer: pkg.answer ? valueText(pkg.answer.value) : null, steps: op ? pkg.steps.map((s) => stepText(s, op)) : [] },
    child: { age },
    // The trace writes the child's name as {name}; the child heard it said, so the judge reads the name.
    turns: judgeTurns(trace).map((t) => ({ ...t, text: t.text.replace(/\{name\}/g, childName) })),
    score: plan.map((p) => ({ turn: p.turn, words: p.words, dimensions: p.score, mayBeNotApplicable: p.mayBeNotApplicable })),
    rubric: JUDGED_IDS.filter((id) => used.has(id)).map((id) => ({ id, name: TEACHING_DIMENSIONS[id].name, levels: TEACHING_DIMENSIONS[id].levels })),
  };
}

export const TEACHING_JUDGE_SYSTEM = `You review one tutoring session between Maya, an AI math tutor, and a child aged 5 to 14, about one question. The channel is chat or voice through the text adapter. You get the question with its checked answer and steps, every numbered turn of the call (the board events are turns too), the Maya turns to score, and the rubric.
Maya is a tutor: she may tell a step or the answer. Score each Maya turn listed in "score", one by one, on the dimensions listed for that turn. Do not score any other turn, and score no dimension that is not listed for the turn.
For each dimension of a turn:
- "status": "scored" with "score" 0, 1, 2 or 3 by the rubric levels (the level whose description fits best; 2 is adequate), or "n/a" with "score" null. Use "n/a" only for a dimension in that turn's "mayBeNotApplicable" (the child had no stuck point to find), and for every dimension that is not listed for the turn.
- "reason": one plain sentence that says why, citing what Maya said. Empty only for "n/a".
Judge Maya's turn, not the child. Read the child's words as the child meant them: speech-to-text can drop digits, so "2 minus 8" in 52 - 28 is the ones step, and answering it in those numbers is right. Judge the turn against what the child said just before it and against the earlier turns (repeats, praise, and whether the child has done anything yet). Do not reward a long turn, a right final answer, or a worked example about another problem. Do not penalise Maya for telling a step or the answer: judge whether the child still does or explains the next part (T07).
The "words" of each Maya turn is its length in words: use it for T05.
Return JSON only: "turns" lists every Maya turn of "score", in order, each with "turn" and one entry for each judged dimension (T01, T02, T03, T04, T05, T07, T08, T09, T10).`;

const dimensionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "score", "reason"],
  properties: {
    status: { type: "string", enum: ["scored", "n/a"] },
    score: { type: ["integer", "null"] },
    reason: { type: "string" },
  },
} as const;

/** The judge's output schema: a list of Maya turns, each with the nine judged dimensions. */
export function teachingJudgeSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["turns"],
    properties: {
      turns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["turn", ...JUDGED_IDS],
          properties: { turn: { type: "integer" }, ...Object.fromEntries(JUDGED_IDS.map((id) => [id, dimensionSchema])) },
        },
      },
    },
  };
}

/** One scored dimension of one Maya turn. */
export interface TeachingScore {
  score: 0 | 1 | 2 | 3;
  reason: string;
}
/** One Maya turn's scores: the judge's, and T06 from code. */
export interface TeachingTurnScores {
  turn: number;
  scores: Partial<Record<TeachingId, TeachingScore>>;
}

export type TeachingJudgement =
  | { ok: true; turns: TeachingTurnScores[]; problems: [] }
  | { ok: false; reason: string; turns: TeachingTurnScores[]; problems: string[] };

/**
 * Checks a judge's output against the plan. Every refusal is recorded and the turns that pass their check are still
 * returned. A refused output is unjudgeable. The rules:
 * - the output is `{ turns }`, one entry for each planned turn, in order, none twice, none extra;
 * - each entry has exactly `turn` and the nine judged dimensions, each with exactly status, score and reason;
 * - a listed dimension is "scored" (a score 0 to 3 and a reason) or, only when the plan allows it, "n/a" (a null score);
 * - a dimension the plan does not list must be "n/a" with a null score;
 * - T06 is code's: it is added from the plan, and a judge that returns it is refused.
 */
export function readTeachingJudgement(raw: unknown, plan: readonly TeachingTurnPlan[]): TeachingJudgement {
  const turns: TeachingTurnScores[] = [];
  const problems: string[] = [];
  const done = (): TeachingJudgement => (problems.length === 0 ? { ok: true, turns, problems: [] } : { ok: false, reason: problems.join("; "), turns, problems });
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    problems.push("the judgement is not an object");
    return done();
  }
  const odd = Object.keys(raw).filter((k) => k !== "turns");
  if (odd.length > 0) problems.push(`unknown field ${odd.join(", ")}`);
  const list = (raw as { turns?: unknown }).turns;
  if (!Array.isArray(list)) {
    problems.push("the judgement has no list of turns");
    return done();
  }
  if (list.length !== plan.length) problems.push(`the judgement has ${list.length} turns, the plan ${plan.length}`);
  for (const [i, p] of plan.entries()) {
    const entry = list[i];
    const scores: Partial<Record<TeachingId, TeachingScore>> = { T06: { score: p.code.T06, reason: `${p.code.T06 === 3 ? "the child spoke after this turn" : p.code.T06 === 2 ? "two Maya turns in a row" : "three or more Maya turns in a row"} (code)` } };
    const bad = (why: string) => problems.push(`turn ${p.turn}: ${why}`);
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      bad("missing");
      turns.push({ turn: p.turn, scores });
      continue;
    }
    const e = entry as Record<string, unknown>;
    const before = problems.length;
    if (e.turn !== p.turn) bad(`the entry is for turn ${JSON.stringify(e.turn)}, expected ${p.turn}`);
    for (const k of Object.keys(e).filter((k) => k !== "turn" && !(JUDGED_IDS as readonly string[]).includes(k))) bad(k === "T06" ? "T06 is scored by code, not by the judge" : `unknown field ${k}`);
    for (const id of JUDGED_IDS) {
      const problem = readOne(id, e[id], p, scores);
      if (problem) bad(problem);
    }
    // A turn that failed any check keeps no judged score, so a refused turn never counts as scored.
    if (problems.length > before) for (const id of JUDGED_IDS) delete scores[id];
    turns.push({ turn: p.turn, scores });
  }
  return done();
}

const KEYS = ["status", "score", "reason"];

function readOne(id: JudgedId, d: unknown, p: TeachingTurnPlan, scores: Partial<Record<TeachingId, TeachingScore>>): string | null {
  if (typeof d !== "object" || d === null || Array.isArray(d)) return `${id} is missing`;
  const x = d as Record<string, unknown>;
  const odd = Object.keys(x).find((k) => !KEYS.includes(k));
  if (odd) return `${id}: unknown field ${odd}`;
  const applies = p.score.includes(id);
  if (x.status === "n/a") {
    if (x.score !== null) return `${id}: "n/a" must have a null score`;
    if (applies && !p.mayBeNotApplicable.includes(id)) return `${id} applies to this turn and cannot be "n/a"`;
    return null;
  }
  if (!applies) return `${id} does not apply to this turn, but it has ${JSON.stringify(x).slice(0, 80)}`;
  if (x.status !== "scored") return `${id}: the status is ${JSON.stringify(x.status)}`;
  if (!(x.score === 0 || x.score === 1 || x.score === 2 || x.score === 3)) return `${id}: the score is not 0 to 3`;
  if (typeof x.reason !== "string" || x.reason.trim() === "") return `${id}: no reason`;
  scores[id] = { score: x.score, reason: x.reason.trim() };
  return null;
}

/** A dimension over a whole call: its worst and median turn score, with the number of turns scored. */
export interface TeachingDimensionSummary {
  id: TeachingId;
  name: string;
  scored: number;
  worst: number | null;
  median: number | null;
}

/** The score a dimension's median must reach, and the lowest a single turn may score, for a call to pass. */
export const TEACHING_MEDIAN_PASS = 2;
export const TEACHING_WORST_PASS = 1;

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** The worst and the median per dimension over a call's turns. */
export function summarizeTeaching(turns: readonly TeachingTurnScores[]): TeachingDimensionSummary[] {
  return TEACHING_IDS.map((id) => {
    const xs = turns.flatMap((t) => (t.scores[id] ? [t.scores[id]!.score] : []));
    return { id, name: TEACHING_DIMENSIONS[id].name, scored: xs.length, worst: xs.length ? Math.min(...xs) : null, median: median(xs) };
  });
}

/** The dimensions that miss the pass rule: a median under 2, or a turn under 1 (a 0). */
export function teachingProblems(summary: readonly TeachingDimensionSummary[]): string[] {
  return summary.flatMap((d) => {
    if (d.median === null || d.worst === null) return [];
    const out: string[] = [];
    if (d.median < TEACHING_MEDIAN_PASS) out.push(`${d.id} ${d.name}: median ${d.median} is under ${TEACHING_MEDIAN_PASS}`);
    if (d.worst < TEACHING_WORST_PASS) out.push(`${d.id} ${d.name}: a turn scored ${d.worst}`);
    return out;
  });
}

/** The vendor of a model id: "openai/gpt-5.4" and "gpt-5.4" read as openai; "claude-opus-5-5" as anthropic. */
export function modelFamily(model: string): string {
  const id = model.toLowerCase();
  const vendor = id.includes("/") ? id.split("/")[0] : "";
  if (vendor) return vendor;
  if (/^claude/.test(id)) return "anthropic";
  if (/^(gpt|o\d|chatgpt)/.test(id)) return "openai";
  if (/^gemini/.test(id)) return "google";
  return id.split("-")[0];
}

/** Why a judge model may not judge Maya's model: the same family shares her blind spots. Null when it may. */
export function judgeFamilyProblem(maya: string, judge: string): string | null {
  return modelFamily(maya) === modelFamily(judge) ? `the teaching judge (${judge}) is the same model family as Maya (${maya}); the judge must be another family` : null;
}

/** The teaching judge through the AI client. */
export function aiTeachingJudge(client: AiClient, options: { timeoutMs?: number } = {}): TeachingJudge {
  const timeoutMs = options.timeoutMs ?? 120_000;
  return {
    id: client.model,
    promptVersion: TEACHING_JUDGE_PROMPT_VERSION,
    judge: (input, signal) =>
      withTimeLimit(timeoutMs, (limit) =>
        client.json({ name: "teaching_judgement", system: TEACHING_JUDGE_SYSTEM, content: [{ type: "text", text: JSON.stringify(input) }], schema: teachingJudgeSchema(), effort: "medium", maxTokens: 8_000 }, AbortSignal.any([signal, limit])),
      ),
  };
}

/**
 * A fake teaching judge: scores every listed dimension of every listed turn `score` (default 3), or "n/a" for the ones
 * not listed. `answer` replaces the whole judgement.
 */
export function fakeTeachingJudge(options: { id?: string; score?: number; answer?: (input: TeachingJudgeInput) => unknown } = {}): TeachingJudge & { inputs: TeachingJudgeInput[] } {
  const inputs: TeachingJudgeInput[] = [];
  return {
    id: options.id ?? "fake-teaching-judge",
    promptVersion: TEACHING_JUDGE_PROMPT_VERSION,
    inputs,
    judge: async (input) => {
      inputs.push(structuredClone(input));
      if (options.answer) return options.answer(input);
      return {
        turns: input.score.map((s) => ({
          turn: s.turn,
          ...Object.fromEntries(JUDGED_IDS.map((id) => [id, s.dimensions.includes(id) ? { status: "scored", score: options.score ?? 3, reason: "fake judgement" } : { status: "n/a", score: null, reason: "" }])),
        })),
      };
    },
  };
}
