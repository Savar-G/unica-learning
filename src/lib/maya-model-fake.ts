// Fake Maya models for the text adapter (#322): no network. `fakeMayaModel` answers each request with what a test
// gives it and records the requests. `ruleMayaModel` is a small rule player for the command line (`--model fake`): it
// reads the offers and picks a line the way a careful model would, so a whole call runs with no AI. It is not a
// teacher; the session still checks every proposal it makes.
import { readNumbers, PROPOSAL_VERSION, type Act } from "@/lib/maya";
import { valueText } from "@/lib/question-package";
import { PROMPT_VERSION, type ActOffer, type MayaModel, type ModelInput } from "@/lib/maya-model";

export function fakeMayaModel({
  id = "fake",
  answer,
}: {
  id?: string;
  /** The proposal for a request (`call` counts from 0); throw to act as a failed model call. */
  answer: (input: ModelInput, call: number) => unknown;
}): MayaModel & { requests: ModelInput[] } {
  const requests: ModelInput[] = [];
  return {
    id,
    promptVersion: PROMPT_VERSION,
    requests,
    propose: async (input) => {
      requests.push(structuredClone(input));
      return answer(input, requests.length - 1);
    },
  };
}

const ORDER: readonly Act[] = [
  "safety", "repair", "accept_answer", "ask_write", "close", "example_step", "try_target", "guide", "give_answer", "clarify",
  "confirm", "check_in", "wait", "redirect", "offer_other_input", "open",
];
/** The warm group the rule player uses for an act. */
const WARM_FOR: Partial<Record<Act, string>> = { open: "opening", close: "closing", confirm: "hearing", wait: "pacing", check_in: "checkin", give_answer: "empathy" };
const has = (text: string, words: RegExp) => words.test(text.toLowerCase());
const fullSlots = (slots: Record<string, unknown>) => ({ step: null, sentence: null, heard: null, other: null, ...slots });

/** The rule player: deterministic, reads only its input. */
export function ruleMayaModel(): MayaModel {
  return fakeMayaModel({ id: "fake", answer: (input) => rulePropose(input) });
}

function rulePropose(input: ModelInput): unknown {
  const text = input.childTurn ?? "";
  const answer = input.question?.answer ?? null;
  const read = readNumbers(text);
  const last = read.values.at(-1);
  // The child's answer: the right one if they said it anywhere, else their last number.
  // A number in an explanation ("so I carried a ten") is not an answer: only a short turn or "I got ..." gives one.
  const answerish = text.trim().split(/\s+/).length <= 4 || has(text, /\b(got|is it|answer|it'?s|i think)\b/);
  const said = answerish ? read.values.find((v) => valueText(v) === answer) ?? last : undefined;
  const answers = said && answer ? [{ value: said, step: "result", problem: "target", verdict: valueText(said) === answer ? "right" : "wrong" }] : [];
  const right = answers.some((a) => a.verdict === "right");
  const reading = input.childTurn === null ? null : {
    safety: null,
    stop: has(text, /\b(stop|bye|goodbye|i'?m done with this)\b/) || null,
    unclear: read.unreadable || null,
    writing: has(text, /\b(wait|writing|hold on)\b/) || null,
    offTopic: null,
    help: has(text, /\b(show me)\b/) ? "show" : has(text, /\b(help|hint)\b/) ? "more" : null,
    start: has(text, /\b(don'?t know|no idea|can'?t start|not sure how)\b/) ? "no_start" : read.values.length > 0 ? "has_work" : null,
    answers: answers.length > 0 ? answers : null,
    paper: has(text, /\b(wrote|written|done)\b/) ? "written" : has(text, /\b(no|won'?t|don'?t want)\b/) ? "declined" : null,
    correctsHearing: has(text, /\bi said\b/) || null,
  };
  // Asked again: another allowed act than the refused one when there is one, and more help than last time.
  const refused = input.repair?.proposal as { act?: Act; level?: number | null } | undefined;
  const inAllowed = input.repair ? input.offers.filter((o) => input.repair!.refusal.allowed.includes(o.act)) : input.offers;
  const others = inAllowed.filter((o) => o.act !== refused?.act || input.repair?.refusal.code === "same_hint_again");
  const allowed = others.length > 0 ? others : inAllowed;
  const minLevel = input.repair?.refusal.code === "same_hint_again" && typeof refused?.level === "number" ? refused.level + 1 : 0;
  const usable = (o: ActOffer) => o.lines.filter((l) => !l.requires || (l.requires.step === "result" && l.requires.answer === (right ? "right" : "wrong") && answers.length > 0));
  const byOrder = [...allowed].sort((a, b) => ORDER.indexOf(a.act) - ORDER.indexOf(b.act));
  const pick =
    (reading?.unclear ? byOrder.find((o) => o.act === "confirm") : undefined) ??
    (right ? byOrder.find((o) => o.act === "accept_answer") : undefined) ??
    byOrder.find((o) => o.act !== "accept_answer" && (usable(o).length > 0 || o.act === "safety" || o.act === "close" || o.act === "wait" || o.act === "check_in")) ??
    byOrder[0];
  if (!pick) return { version: PROPOSAL_VERSION, act: "close", parts: [] };
  const lines = usable(pick);
  const heard = said ? valueText(said) : null;
  // A step line when the act has one (the gentlest first), with the example's intro before the first example step.
  const line =
    (pick.act === "confirm" ? lines.find((l) => l.slots.heard === heard) : undefined) ??
    [...lines]
      .filter((l) => (typeof l.slots.step === "string" || lines.every((x) => typeof x.slots.step !== "string")) && (l.level ?? 0) >= minLevel)
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))[0];
  const intro = pick.act === "example_step" ? lines.find((l) => l.line.endsWith(".intro")) : undefined;
  const warm = pick.warm.find((w) => w.group === WARM_FOR[pick.act]) ?? pick.warm.find((w) => w.group === "encourage") ?? pick.warm[0];
  const parts = [
    ...(warm && !input.repair ? [{ warm: warm.group, echo: null, pick: null }] : []),
    ...(intro && intro !== line ? [{ line: intro.line, slots: fullSlots(intro.slots) }] : []),
    ...(line ? [{ line: line.line, slots: fullSlots(line.slots) }] : []),
  ];
  // A line's own board offer only with that line; other offers draw the problem.
  const draw = pick.draw.find((d) => !d.id.startsWith("line.") || (line && d.id === `line.${line.line}`));
  return {
    version: PROPOSAL_VERSION,
    act: pick.act,
    parts,
    reading,
    step: line && typeof line.slots.step === "string" ? line.slots.step : null,
    level: pick.act === "guide" ? line?.level ?? 0 : null,
    understanding: pick.act === "ask_write" ? (!input.repair && has(text, /\b(because|carr|ten|ones)\b/) ? "evidence_observed" : "uncertain") : null,
    draw: !input.repair && draw ? [{ offer: draw.id, place: null }] : null,
    board: null,
  };
}
