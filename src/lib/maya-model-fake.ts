// Fake Maya models for the text adapter (#322): no network. `fakeMayaModel` answers each request with what a test
// gives it and records the requests. `ruleMayaModel` is a small rule player for the command line (`--model fake`): it
// reads the offers and picks a line the way a careful model would, so a whole call runs with no AI. It is not a
// teacher; the session still checks every proposal it makes.
import { readNumbers, PROPOSAL_VERSION, type Act } from "@/lib/maya";
import { valueText } from "@/lib/question-package";
import { CONVERSATION_PROMPT_VERSION, PROMPT_VERSION, type ActOffer, type MayaModel, type ModelInput, type TurnBrief } from "@/lib/maya-model";

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
  // In a fraction call the child's spoken fractions are read, as the session reads them (D-204); in a clock-time call
  // (an answer written as a clock time, C3c) its times are read in their exact forms, as the session reads them.
  const read = readNumbers(text, { fractions: true, operands: true, ...(/^\d{2}:\d{2}$/.test(answer ?? "") ? { times: true } : {}) });
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
    // Semantic classifications of this scripted player only. The production controller never scans topic words.
    outsideScope: has(text, /\b(?:homework|schoolwork|worksheet|essay|ignore your rules|hidden instructions)\b/) ? "outside_work"
      : has(text, /\b(?:sister|brother|sibling)'?s?\b.*\b(?:question|workbook|help)\b/) ? "other_person"
      : has(text, /\b(?:science|capital|chat about games)\b/) ? "other_topic" : null,
    noBoard: has(text, /\b(?:can'?t|cannot|can not|don'?t|do not) see (?:the )?(?:whiteboard|board)\b/) || null,
    shorter: has(text, /\b(?:talk too much|too many words|talk less|shorter|forgot)\b/) || null,
    aboutMaya: has(text, /\b(?:secret|only me|only friend|exclusive)\b/) ? "secret_friend" : has(text, /\b(?:real person|an? ai|are you real)\b/) ? "identity" : null,
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
  // Never a written digit: this player does not track the board, and a digit written twice is refused.
  const draw = pick.draw.find((d) => !d.id.startsWith("question.write.") && (!d.id.startsWith("line.") || (line && d.id === `line.${line.line}`)));
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

// ---------- Version 3 (D-341) ----------

/** A version 3 reply with every reading field at its default, for tests and scripted fakes. */
export function reply(say: string, act: Act, extra: { step?: string; level?: number; reading?: Record<string, unknown>; draw?: { offer: string; place: string }[] } = {}) {
  return {
    say, act, step: extra.step ?? "", level: extra.level ?? 0,
    reading: {
      answers: [], help: "none", unclear: false, stop: false, safety: "none", writing: false, offTopic: false, mathClaim: false, mathRequests: [],
      outsideScope: "none", scopeSkill: "", unsafeRequest: false, noBoard: false, shorter: false, aboutMaya: "none", start: "none", paper: "none",
      correctsHearing: false, ...(extra.reading ?? {}),
    },
    draw: extra.draw ?? [],
  };
}

/** A fake conversational model (D-341): answers each brief with what a test gives it, and records the briefs. */
export function conversationalFake({
  id = "fake-v3",
  answer,
}: {
  id?: string;
  /** The reply for a brief (`call` counts from 0); throw to act as a failed model call. */
  answer: (brief: TurnBrief, call: number) => unknown | Promise<unknown>;
}): MayaModel & { briefs: TurnBrief[] } {
  const briefs: TurnBrief[] = [];
  return {
    id,
    promptVersion: CONVERSATION_PROMPT_VERSION,
    output: 3,
    briefs,
    propose: async (input) => {
      const brief = structuredClone(input) as unknown as TurnBrief;
      briefs.push(brief);
      return answer(brief, briefs.length - 1);
    },
  };
}

/**
 * A small deterministic conversational player (D-341) for the command line and the practice suite's --fake run: it
 * reads the brief's facts and help levels and writes a plain `say` from them. It is not a teacher; the session checks
 * every reply it makes, and refuses what breaks the limits.
 */
export function ruleConversationalModel(): MayaModel {
  return conversationalFake({ id: "fake", answer: (brief) => ruleReply(brief) });
}

function ruleReply(brief: TurnBrief): unknown {
  const text = brief.childTurn ?? "";
  const lower = text.toLowerCase();
  const answers: Record<string, unknown>[] = [];
  let rightFinal = false;
  for (const fact of brief.facts) {
    const final = /^(.+?) is the right final answer\.$/.exec(fact);
    const step = /^(.+?) is right for the step "([^"]+)"\.$/.exec(fact);
    const value = Number((final ?? step)?.[1]);
    if (final && Number.isFinite(value)) { answers.push({ value: { type: "number", value }, step: "result", problem: "target", verdict: "right" }); rightFinal = true; }
    else if (step && Number.isFinite(value)) answers.push({ value: { type: "number", value }, step: step[2], problem: "target", verdict: "right" });
  }
  const reading = {
    answers,
    stop: /\b(stop|bye|goodbye)\b/.test(lower),
    writing: /\b(wait|writing|hold on)\b/.test(lower),
    help: /\b(help|stuck|show me|don'?t know|dont know)\b/.test(lower) ? "more" : "none",
    paper: /\b(wrote it|i wrote|written)\b/.test(lower) ? "written" : "none",
    start: /\b(how to start|can'?t start)\b/.test(lower) ? "no_start" : "none",
  };
  const acts = brief.acts;
  const has = (a: Act) => acts.includes(a);
  const levels = brief.help.levels;
  if (reading.stop && has("close")) return reply("Okay, we can stop here. Bye for now.", "close", { reading });
  if (reading.writing && has("wait")) return reply("Take your time.", "wait", { reading });
  if (rightFinal && has("accept_answer")) return reply("Yes, that's right. How did you work it out?", "accept_answer", { reading });
  const stands = brief.notes.some((n) => n.startsWith("The child's answer stands"));
  if ((reading.paper === "written" || /\b(i'?m done|done)\b/.test(lower)) && has("close")) return reply("Thanks for writing it. Bye for now.", "close", { reading });
  if (has("ask_write") && (stands || !has("guide"))) return reply("Please write your answer on your paper.", "ask_write", { reading });
  const example = brief.notes.find((n) => n.startsWith("If you work the easier example now"));
  if (has("example_step") && (reading.start === "no_start" || !has("guide")) && example) {
    return reply(example.replace(/^If you work the easier example now, say its next step: /, "").replace(/ Say first that it is a new, easier problem\.$/, ""), "example_step", { reading });
  }
  if (has("guide")) {
    const want = reading.help === "more" ? brief.help.levelNow + 1 : 0;
    const pick = levels.find((l) => l.level >= want) ?? levels.at(-1);
    const lead = brief.facts.some((f) => /not right|smaller digit|leaves out/.test(f)) ? "Not quite. " : "";
    return reply(`${lead}${pick?.mayShow.split(" / ")[0] ?? "Let's look at the next step."}`, "guide", { level: pick?.level ?? 0, reading });
  }
  if (has("close")) return reply("Thanks for working with me. Bye for now.", "close", { reading });
  if (has("try_target")) return reply("Now try our question.", "try_target", { reading });
  if (has("redirect")) return reply("Let's get back to our question.", "redirect", { reading });
  return reply("Let's keep going.", acts[0] ?? "close", { reading });
}
