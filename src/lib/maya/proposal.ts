// The model's proposal (#321, #372): Maya's next act, what she says, what she read in the child's turn and what she
// draws. Untrusted: the session checks every field. Since #372 the model never writes math: Maya's words are parts, each
// a line code writes (an id and its slots, from the lines the session offers now) or warm talk with no math in it.
// Version 2 replaced the free-text `say` of version 1. Warm talk follows D-196: bank phrases (`warm`) in a turn with
// math, the model's own words (`talk`) only in a turn without. The text adapter (#322) gives the model PROPOSAL_SCHEMA for
// structured output.
import type { AnswerValue } from "@/lib/question-package";
import { LINE_IDS, type LineChoice } from "./lines";
import { PHRASE_GROUPS, type PhraseGroup } from "./phrases";

/** The version of the proposal shape. Raise it when a field or its meaning changes. */
export const PROPOSAL_VERSION = 2;

/** Maya's acts: one per turn. The model names one; the session allows it or refuses it. */
export const ACTS = [
  "open", "clarify", "example_step", "try_target", "guide", "accept_answer", "give_answer", "ask_write", "close",
  "safety", "confirm", "offer_other_input", "wait", "check_in", "redirect", "repair",
] as const;
export type Act = (typeof ACTS)[number];

/** H0 invite, H1 point, H2 give the operation, H3 demonstrate the step, H4 give the result with a short reason. */
export type HintLevel = 0 | 1 | 2 | 3 | 4;
export type Severity = "concern" | "immediate";

/** At most this many parts in one turn, and this many characters in one part of warm talk (FREE_TALK_LIMITS is lower). */
export const PART_LIMITS = { parts: 6, talkChars: 400 } as const;

/**
 * The model's own warm words (D-196 rule B): read only when the session's `freeTalk` flag is on (off by default), only
 * in a turn with no math line, and checked by the guards in phrases.ts. Otherwise they are replaced by a bank phrase.
 */
export interface Talk {
  talk: string;
}
/**
 * Warm talk from the code-written bank (D-196): the model names the purpose; code picks the phrase. `echo` is 1 to 3
 * words copied exactly from the child's last turn ("Biscuit", "my grandma"), for a frame such as "{echo} is a great
 * name!"; code checks them and picks a frame with no slot when they fail.
 */
export interface Warm {
  warm: PhraseGroup;
  echo?: string;
  /**
   * The phrase that fits, by its number in the group (1 = the first of PHRASES[warm]). Code says it when its slot can
   * be filled; else, and without a pick, code picks the one the child heard least lately.
   */
  pick?: number;
}
/**
 * One part of what Maya says, in order: a code-written line, a bank phrase or the model's own warm words. In a turn
 * with a math line, warm talk comes from the bank and before the math, so the math line is said last.
 */
export type Part = LineChoice | Warm | Talk;

/**
 * An answer the model read in the child's turn: the value, the step it answers (a worked step id, or "result"), and the
 * model's verdict. Code checks that the child said it and kept it, and that the verdict is right.
 */
export interface ChildAnswer {
  /** A number, fraction or remainder value; the session refuses any other kind. */
  value: AnswerValue;
  step: string;
  problem?: "target" | "example";
  verdict: "right" | "wrong";
}

/** What the model understood from the child's latest turn. */
export interface Reading {
  /** A possible harm or danger disclosure. Raises the safety flag even when the proposal is refused. */
  safety?: Severity;
  /** The child asks to stop. Kept until the call closes, even when the proposal is refused or malformed. */
  stop?: boolean;
  /** The words or a number are unclear: confirm before judging. Kept for this turn even when the proposal is refused or malformed. */
  unclear?: boolean;
  /** The child is writing or asks for more time. */
  writing?: boolean;
  /** A harmless off-topic request, or a request for another question. */
  offTopic?: boolean;
  /** An explicit request for more help, or for Maya to show the step. */
  help?: "more" | "show";
  /** At the opening: the child has work to show, or has not started (then the easier example comes first). */
  start?: "has_work" | "no_start";
  answers?: ChildAnswer[];
  /** The child says they wrote the answer on paper, or will not. Maya never sees the paper. */
  paper?: "written" | "declined";
  /** The child says Maya heard them wrong ("no, I said fifteen"). */
  correctsHearing?: boolean;
}

/**
 * A model proposal, version 2. `parts` is what Maya says, in order: lines the session offers for this act (see
 * lineOffers) and warm talk. For `safety`, code speaks the safety guidance and the parts are not used; for
 * `give_answer`, code adds the answer and the request to write it on paper after the parts.
 */
export interface Proposal {
  version: typeof PROPOSAL_VERSION;
  act: Act;
  parts: Part[];
  reading?: Reading;
  /** For guide and example_step: the step this turn is about. */
  step?: string;
  /** For guide: the hint level. */
  level?: HintLevel;
  /** For ask_write from CHECK: what the check showed. */
  understanding?: "evidence_observed" | "uncertain";
  /**
   * Board offers to draw, by id (R374-6-1): code builds each command from the checked worked step. `place` is one of
   * the places code offers ("main", "below:question" ...). The only way to draw with the freeTalk flag off.
   */
  draw?: { offer: string; place?: string }[];
  /**
   * Board commands the model built (the board core's vocabulary). Read only with the freeTalk flag on; refused
   * (`board_not_code`) with it off.
   */
  board?: unknown[];
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const answerValue = {
  anyOf: [
    { type: "object", additionalProperties: false, required: ["type", "value"], properties: { type: { const: "number" }, value: { type: "number" } } },
    { type: "object", additionalProperties: false, required: ["type", "numerator", "denominator"], properties: { type: { const: "fraction" }, numerator: { type: "integer" }, denominator: { type: "integer" } } },
    { type: "object", additionalProperties: false, required: ["type", "quotient", "remainder"], properties: { type: { const: "remainder" }, quotient: { type: "integer" }, remainder: { type: "integer" } } },
  ],
};

/**
 * The proposal as a JSON schema, for the model's structured output. Every field is required and an unused one is null,
 * as strict structured output asks; the session reads a null field as a missing one. Board commands are the board
 * protocol's (#328) and are checked by the board core, so here they are objects with an `op`.
 */
export const PROPOSAL_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Maya proposal",
  type: "object",
  additionalProperties: false,
  required: ["version", "act", "parts", "reading", "step", "level", "understanding", "draw", "board"],
  properties: {
    version: { const: PROPOSAL_VERSION },
    act: { enum: [...ACTS] },
    parts: {
      type: "array",
      maxItems: PART_LIMITS.parts,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["line", "slots"],
            properties: {
              line: { enum: [...LINE_IDS] },
              slots: {
                type: "object",
                additionalProperties: false,
                required: ["step", "sentence", "heard", "other"],
                properties: {
                  step: nullable({ type: "string" }),
                  sentence: nullable({ type: "integer", minimum: 0 }),
                  heard: nullable({ type: "string" }),
                  other: nullable({ type: "string" }),
                },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["warm", "echo", "pick"],
            properties: { warm: { enum: [...PHRASE_GROUPS] }, echo: nullable({ type: "string", maxLength: 40 }), pick: nullable({ type: "integer", minimum: 1 }) },
          },
          { type: "object", additionalProperties: false, required: ["talk"], properties: { talk: { type: "string", maxLength: PART_LIMITS.talkChars } } },
        ],
      },
    },
    reading: nullable({
      type: "object",
      additionalProperties: false,
      required: ["safety", "stop", "unclear", "writing", "offTopic", "help", "start", "answers", "paper", "correctsHearing"],
      properties: {
        safety: nullable({ enum: ["concern", "immediate"] }),
        stop: nullable({ type: "boolean" }),
        unclear: nullable({ type: "boolean" }),
        writing: nullable({ type: "boolean" }),
        offTopic: nullable({ type: "boolean" }),
        help: nullable({ enum: ["more", "show"] }),
        start: nullable({ enum: ["has_work", "no_start"] }),
        answers: nullable({
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["value", "step", "problem", "verdict"],
            properties: { value: answerValue, step: { type: "string" }, problem: nullable({ enum: ["target", "example"] }), verdict: { enum: ["right", "wrong"] } },
          },
        }),
        paper: nullable({ enum: ["written", "declined"] }),
        correctsHearing: nullable({ type: "boolean" }),
      },
    }),
    step: nullable({ type: "string" }),
    level: nullable({ enum: [0, 1, 2, 3, 4] }),
    understanding: nullable({ enum: ["evidence_observed", "uncertain"] }),
    draw: nullable({
      type: "array",
      maxItems: 4,
      items: { type: "object", additionalProperties: false, required: ["offer", "place"], properties: { offer: { type: "string" }, place: nullable({ type: "string" }) } },
    }),
    board: nullable({ type: "array", items: { type: "object", required: ["op"], properties: { op: { type: "string" } } } }),
  },
} as const;

/**
 * A proposal from structured output, with every null field left out, so the session reads it like a hand-written one.
 * Board commands are the board core's to read and stay as they are.
 */
export function withoutNulls(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(withoutNulls);
  if (typeof raw !== "object" || raw === null) return raw;
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null).map(([k, v]) => [k, k === "board" ? v : withoutNulls(v)]));
}
