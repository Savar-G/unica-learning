#!/usr/bin/env node
// The commit-rule corpus (2026-11-12): child turns from one saved practice pass, for the free corpus gate in npm test
// (src/lib/maya/commit-corpus.test.ts). Reads <traces>/runs/*.trace.json and writes two fixture files:
// - positive.json: every child turn the model read with every value right, where code refused the model's reading with
//   answer_not_committed. A turn with a true blocker of the commit rule (a hedge, the value only in a question, a value
//   check after it, another person's number, an echo of a step Maya showed) moves to the negative set with its reason.
// - negative.json: every child turn the model read with any value wrong, every guess or hedge, and every request (help,
//   show me, just tell me, stop, and act_not_allowed cases).
// Usage: node scripts/maya-commit-corpus.mjs <traces dir> <out dir> [--only C,F]
// No model call and no network: it only reads the saved traces.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [dir, out, ...rest] = process.argv.slice(2);
if (!dir || !out) {
  console.error("Usage: node scripts/maya-commit-corpus.mjs <traces dir> <out dir> [--only C,F]");
  process.exit(2);
}
const onlyAt = rest.indexOf("--only");
const only = onlyAt >= 0 ? rest[onlyAt + 1].split(",") : null;

const HEDGE = /\b(?:i think|think|thought|maybe|guess|guessed|guessing|probably|perhaps|i believe|not sure|might be|kind of|kinda|or something)\b/i;
const OR = /\bor\b/i;
const OTHER_PERSON = /\b(?:my (?:mom|mum|dad|teacher|brother|sister|friend|grandma|grandpa|aunt|uncle|cousin|parents?|tutor|class)|mom|mum|dad|teacher|she|he|they|her|his|their|someone|somebody)\b/i;
const ECHO = /\b(?:you said|like you said|you showed|like you showed|you told|you did|your example|like you did)\b/i;
const REQUEST = /\b(?:help|show me|tell me|just tell|give me|explain|stop|can you|can we|could you|i quit|i want to stop|i don't want)\b/i;
const NEXT_QUESTION = /^(?:(?:so|okay|ok|um|uh|oh|and|but|then|now)\b[,\s]*)*(?:what do (?:i|we) do (?:with|about|next|now)|where (?:does|do|should) |do (?:i|we) (?:write|put|carry|keep) |how do (?:i|we) write |what happens to |what about )/;
const VALUE_CHECK = /\b(?:is (?:that|it|this) (?:right|correct)|am i right|right\?|correct\?|did i get it right|did i do it right)/i;

const num = (v) => (v && v.type === "number" ? v.value : v && v.type === "fraction" ? `${v.numerator}/${v.denominator}` : JSON.stringify(v));

const positive = [];
const negative = [];
const moved = [];
const files = readdirSync(join(dir, "runs")).filter((f) => f.endsWith(".trace.json")).sort();
let runs = 0;
let childTurns = 0;
for (const file of files) {
  const run = file.replace(/\.trace\.json$/, "");
  const caseId = run.replace(/-r\d+$/, "");
  if (only && !only.some((p) => caseId.startsWith(p) && !/^(?:OT|PTP)/.test(caseId))) continue;
  runs += 1;
  const trace = JSON.parse(readFileSync(join(dir, "runs", file), "utf8"));
  const turns = trace.turns;
  const done = new Set();
  const shown = new Set();
  let lastMaya = null;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.kind === "maya" && t.output) {
      const p = t.attempts.at(-1).proposal ?? {};
      for (const a of p.reading?.answers ?? []) if (a.verdict === "right" && (a.problem ?? "target") === "target") done.add(a.step);
      if (p.act === "guide" && (p.level ?? 0) >= 3 && p.step) shown.add(p.step);
      lastMaya = { act: t.output.act, say: t.output.say.join(" ") };
      continue;
    }
    if (t.kind !== "child") continue;
    childTurns += 1;
    const next = turns.slice(i + 1).find((x) => x.kind === "maya" || x.kind === "child");
    if (!next || next.kind !== "maya") continue;
    const model = next.attempts.find((a) => a.source === "model");
    const reading = model?.proposal?.reading ?? null;
    const answers = (reading?.answers ?? []).map((a) => ({ value: a.value, step: a.step, verdict: a.verdict, ...(a.problem && a.problem !== "target" ? { problem: a.problem } : {}) }));
    const code = model?.refusal?.code ?? null;
    const text = t.text;
    const base = {
      run, case: caseId, question: trace.question.id, turn: i, text,
      answers: answers.map((a) => ({ ...a, value: a.value })),
      code, doneBefore: [...done], shownBefore: [...shown], lastMaya,
    };
    const target = answers.filter((a) => !a.problem);
    if (target.length > 0 && target.every((a) => a.verdict === "right") && answers.every((a) => a.verdict === "right") && code === "answer_not_committed") {
      // True blockers move the turn to the negative set.
      const values = target.map((a) => String(num(a.value)));
      const parts = text.split(/(?<=[.!?])\s+/);
      const holds = (x) => values.some((v) => new RegExp(`(?:^|[^\\d/.])${v.replace(/[/.]/g, "\\$&")}(?![\\d/])`).test(x));
      const inQuestion = parts.some((q) => q.trim().endsWith("?") && holds(q)) && !parts.some((q) => !q.trim().endsWith("?") && holds(q));
      // A question that holds the value and is not about the next step ("Is it 66?", not "What do I do with the 16?").
      const asksIt = parts.some((q) => q.trim().endsWith("?") && holds(q) && !NEXT_QUESTION.test(q.trim().toLowerCase()));
      const steps = target.map((a) => a.step);
      let reason = null;
      if (HEDGE.test(text)) reason = "hedge";
      else if (OR.test(text)) reason = "hedge (or)";
      else if (inQuestion) reason = "value only in a question";
      else if (VALUE_CHECK.test(text)) reason = "value check after the value";
      else if (asksIt) reason = "a question about the value";
      else if (OTHER_PERSON.test(text)) reason = "another person";
      else if (ECHO.test(text) && steps.some((s) => shown.has(s))) reason = "echo after a show";
      if (reason) {
        moved.push({ ...base, reason });
        // An echo after a show blocks only the steps Maya showed; the other steps of the turn may stand.
        const blocked = reason === "echo after a show" ? { blocked: steps.filter((s) => shown.has(s)) } : {};
        negative.push({ ...base, why: `moved from positive: ${reason}`, ...blocked });
      } else positive.push(base);
      continue;
    }
    const wrong = answers.some((a) => a.verdict === "wrong");
    const hedged = HEDGE.test(text) || reading?.start === "guess";
    // A request in the child's own words (help, show me, just tell me, stop), whatever the refusal (act_not_allowed too).
    const request = REQUEST.test(text);
    const why = [wrong && "read wrong", hedged && "guess or hedge", request && "request"].filter(Boolean);
    if (why.length > 0) negative.push({ ...base, why: why.join(", ") });
  }
}

mkdirSync(out, { recursive: true });
const meta = { source: dir.replace(/^.*\/traces\//, "traces/"), runs, childTurns, generated: "scripts/maya-commit-corpus.mjs" };
writeFileSync(join(out, "positive.json"), `${JSON.stringify({ ...meta, moved: moved.map(({ run, turn, text, reason }) => ({ run, turn, text, reason })), turns: positive }, null, 1)}\n`);
writeFileSync(join(out, "negative.json"), `${JSON.stringify({ ...meta, turns: negative }, null, 1)}\n`);
console.log(`runs ${runs}, child turns ${childTurns}: positive ${positive.length}, moved ${moved.length}, negative ${negative.length}`);
