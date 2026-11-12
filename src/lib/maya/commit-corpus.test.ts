// The commit-rule corpus gate (2026-11-12, approved by Savar): real child turns from the failed chat pass of 2026-11-12
// (traces/maya-practice/2026-11-12T16-17-39-955Z), extracted by scripts/maya-commit-corpus.mjs. Free: no model call.
// POSITIVE: turns the model read with every value right and code refused with answer_not_committed. Each must be credited
// (each named step done, a named final answer accepted), on the model's reading and on code's fallback alike.
// NEGATIVE: turns read wrong, guesses, hedges, requests, and the positives with a true blocker. None may be credited.
// Each turn runs on a fresh call of its question, with every step before it done (the probe pattern, through the text
// adapter and the scripted model, as the behaviour gate runs).
import { appendFileSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { CHILD_MS, GATE_T0, scenarioModel, type Plan, type Read } from "@/lib/maya-gate/gate";
import { PRACTICE_CASES } from "@/lib/maya-practice/cases";
import { valuesIn } from "@/lib/maya/numbers";
import type { AnswerValue, QuestionPackage, WorkedStep } from "@/lib/question-package";

interface CorpusAnswer { value: AnswerValue; step: string; verdict: "right" | "wrong"; problem?: string }
interface CorpusTurn {
  run: string; case: string; question: string; turn: number; text: string; answers: CorpusAnswer[]; code: string | null;
  doneBefore: string[]; shownBefore: string[]; why?: string; blocked?: string[];
}
interface Corpus { runs: number; turns: CorpusTurn[]; moved?: { run: string; turn: number; text: string; reason: string }[]; review?: CorpusTurn[] }
const load = (name: string) => JSON.parse(readFileSync(new URL(`./commit-corpus/${name}.json`, import.meta.url), "utf8")) as Corpus;
const POSITIVE = load("positive");
/** COMMIT_CORPUS_REPORT=<file> also writes each summary there (vitest hides the console of a passing test). */
const report = (text: string) => {
  console.log(text);
  if (process.env.COMMIT_CORPUS_REPORT) appendFileSync(process.env.COMMIT_CORPUS_REPORT, `${text}\n`);
};
const NEGATIVE = load("negative");

/** The question each run worked on: its practice case's own package, or the case's fixture. */
function packageFor(t: CorpusTurn): QuestionPackage | null {
  const c = PRACTICE_CASES.find((x) => x.id === t.case);
  const pkg = c ? (c.package ?? FIXTURES[c.fixture]) : Object.values(FIXTURES).find((f) => f.id === t.question);
  return pkg && pkg.id === t.question ? pkg : null;
}

/** The step's own simplest value: what a child says alone to do it ("16." for 7 + 9). */
function plainValue(st: WorkedStep): number | null {
  switch (st.kind) {
    case "add-column": return st.total;
    case "subtract-column": return st.top - (st.lent ? 1 : 0) + (st.regrouped ? 10 : 0) - (st.bottom ?? 0);
    case "multiply-digit": return st.total;
    case "partial-product": case "place-point": return st.value;
    case "divide-digit": return st.quotient;
    case "combine-numerators": return st.numerator;
    default: return null;
  }
}

/** The step's right values, by the package's own math (for a reading the model called wrong). */
function rightValues(pkg: QuestionPackage, step: string): number[] {
  if (step === "result") return pkg.answer?.value.type === "number" ? [pkg.answer.value.value] : [];
  const st = pkg.steps.find((x) => x.id === step);
  if (!st) return [];
  const v = plainValue(st);
  return [...(v === null ? [] : [v]), ...("write" in st && typeof st.write === "number" ? [st.write] : [])];
}

const asRead = (answers: CorpusAnswer[]): Read => ({ answers: answers.map((a) => [a.value, a.step, a.verdict, ...(a.problem ? [a.problem] : [])] as never) });
const THROWS: Plan[] = [{ throws: true }];

interface Played { before: string[]; done: string[]; solved: boolean; setupOk: boolean }

/**
 * A fresh call on `pkg`: the open, each `setup` step said as its plain value and read right, an optional show of `show`
 * (H3), then `text` read as `answers` (or, with `answers` null, a failed model call: code's fallback decides).
 */
async function play(pkg: QuestionPackage, setup: WorkedStep[], text: string, answers: CorpusAnswer[] | null, show: string | null): Promise<Played> {
  let now = GATE_T0;
  const model = scenarioModel("corpus");
  const call = createTextSession({ callId: "corpus", package: pkg, model, clock: () => now, random: 1, grade: 4, freeTalk: false });
  model.next([], undefined);
  await call.start();
  for (const st of setup) {
    const v = plainValue(st);
    if (v === null) break;
    now += CHILD_MS;
    model.next([], { answers: [[v, st.id, "right"]] });
    await call.child(`${v}.`);
  }
  if (show) {
    now += CHILD_MS;
    model.next([{ act: "guide", step: show, level: 3, lines: ["step.show"] }], { help: "show" });
    await call.child(`Show me the ${show}.`);
  }
  const before = [...call.session.done];
  const setupOk = setup.every((st) => before.includes(st.id)) && call.session.solved === null && !call.ended;
  now += CHILD_MS;
  model.next(answers === null ? THROWS : [], answers === null ? undefined : asRead(answers));
  await call.child(text);
  const s = call.session;
  return { before, done: [...s.done], solved: s.solved !== null, setupOk };
}

const order = (pkg: QuestionPackage) => pkg.steps.filter((s) => s.kind !== "result");
/** The steps done before this turn: every step before the first one it names; for a final answer alone, those the call had done. */
function setupFor(pkg: QuestionPackage, t: CorpusTurn): WorkedStep[] {
  const steps = order(pkg);
  const named = t.answers.filter((a) => !a.problem).map((a) => steps.findIndex((s) => s.id === a.step)).filter((i) => i >= 0);
  if (named.length > 0) return steps.slice(0, Math.min(...named));
  const had = t.doneBefore.map((id) => steps.findIndex((s) => s.id === id)).filter((i) => i >= 0);
  return steps.slice(0, had.length ? Math.max(...had) + 1 : 0);
}

/** Every step the model read right, with a value the child said, is credited, and a right final answer is accepted. */
const creditedAll = (t: CorpusTurn, p: Played) =>
  t.answers.filter((a) => !a.problem && a.verdict === "right" && valuesIn(t.text).some((v) => JSON.stringify(v) === JSON.stringify(a.value)))
    .every((a) => (a.step === "result" ? p.solved : p.done.includes(a.step)));

/** Nothing new is credited at or after the first step this turn says wrong (or at all, for a guess, hedge or request). */
function creditedWrongly(pkg: QuestionPackage, t: CorpusTurn, p: Played): string[] {
  const steps = order(pkg).map((s) => s.id);
  const gained = p.done.filter((id) => !p.before.includes(id));
  if (t.blocked) return [...gained.filter((id) => t.blocked!.includes(id)), ...(p.solved && t.blocked.includes("result") ? ["result"] : [])];
  const wrong = t.answers.filter((a) => !a.problem && a.verdict === "wrong");
  if (wrong.length === 0 || /^(?:moved|review)/.test(t.why ?? "") || /hedge|request/.test(t.why ?? "")) return [...gained, ...(p.solved ? ["result"] : [])];
  const first = Math.min(...wrong.map((a) => (a.step === "result" ? steps.length : steps.indexOf(a.step))));
  return [...gained.filter((id) => steps.indexOf(id) >= first), ...(p.solved && wrong.some((a) => a.step === "result") ? ["result"] : [])];
}

/** A model reading of "wrong" for a value that the package's math makes right: the model misread, not the child. */
const misread = (pkg: QuestionPackage, t: CorpusTurn) =>
  t.answers.some((a) => !a.problem && a.verdict === "wrong" && a.value.type === "number" && rightValues(pkg, a.step).includes((a.value as { value: number }).value));

describe("the commit-rule corpus (practice pass 2026-11-12T16-17-39-955Z)", () => {
  it("credits at least 95% of the positive turns on both paths, and lists every one still refused", async () => {
    const refused: string[] = [];
    let n = 0;
    for (const t of POSITIVE.turns) {
      const pkg = packageFor(t);
      if (!pkg) continue;
      n += 1;
      const setup = setupFor(pkg, t);
      const named = await play(pkg, setup, t.text, t.answers, null);
      const down = await play(pkg, setup, t.text, null, null);
      expect(named.setupOk && down.setupOk, `setup for ${t.run}#${t.turn}`).toBe(true);
      const paths = [!creditedAll(t, named) && "model", !creditedAll(t, down) && "fallback"].filter(Boolean);
      if (paths.length > 0) refused.push(`${t.run}#${t.turn} [${paths.join(",")}] ${t.answers.map((a) => `${a.step}=${JSON.stringify(a.value.type === "number" ? (a.value as { value: number }).value : a.value)}`).join(" ")}: ${t.text}`);
    }
    const share = (n - refused.length) / n;
    report(`POSITIVE credited ${n - refused.length}/${n} (${(share * 100).toFixed(1)}%)\n${refused.join("\n")}`);
    expect(n).toBeGreaterThan(0);
    expect(share).toBeGreaterThanOrEqual(0.95);
  }, 600_000);

  it("credits none of the negative turns on either path", async () => {
    const credited: string[] = [];
    const skipped: string[] = [];
    let n = 0;
    // The extracted turns, then the hand-added review set (review of 1b5c3b50).
    for (const t of [...NEGATIVE.turns, ...(NEGATIVE.review ?? [])]) {
      const pkg = packageFor(t);
      if (!pkg) continue;
      // Only a turn read wrong and nothing else: a hedge or a request is refused whatever the model read.
      if (t.why === "read wrong" && misread(pkg, t)) {
        skipped.push(`${t.run}#${t.turn}: ${t.text}`);
        continue;
      }
      n += 1;
      const setup = setupFor(pkg, t);
      // An echo after a show: Maya shows the step first, as she did in the run before this turn.
      const show = t.blocked?.[0] ?? null;
      const named = await play(pkg, setup, t.text, t.answers.length ? t.answers : [], show);
      const down = await play(pkg, setup, t.text, null, show);
      expect(named.setupOk && down.setupOk, `setup for ${t.run}#${t.turn}`).toBe(true);
      const bad = [...creditedWrongly(pkg, t, named).map((x) => `model:${x}`), ...creditedWrongly(pkg, t, down).map((x) => `fallback:${x}`)];
      if (bad.length > 0) credited.push(`${t.run}#${t.turn} (${t.why}) [${bad.join(",")}]: ${t.text}`);
    }
    report(`NEGATIVE refused ${n - credited.length}/${n} (${(((n - credited.length) / n) * 100).toFixed(1)}%); skipped as model misreads: ${skipped.length}\n${credited.join("\n")}\nSKIPPED\n${skipped.join("\n")}`);
    expect(n).toBeGreaterThan(0);
    expect(credited).toEqual([]);
  }, 600_000);
});
