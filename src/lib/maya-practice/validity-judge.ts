// The validity judge of the practice suite (R386-2-1): a second, cheap model call per run, on another model family
// than the practice child (by default the main judge's family, so they share no blind spots), that reads only the child's
// turns and the case's persona card, and says whether the simulated child stayed a child in that persona and knew no
// more than the persona knows. It is the semantic layer behind code's checks (the script stages and the persona
// lexicon), because a word list always misses a phrasing ("I am software with no body."). Anything but a clean
// "ok", a parse failure, or no judgement at all makes the run invalid, and the main judge never sees the run.
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import type { PracticeCase } from "./cases";

/** The version of the validity judge's prompt and input. Raise it when either changes; every run records it. */
export const VALIDITY_PROMPT_VERSION = "practice-validity-1";

export interface ValidityInput {
  promptVersion: string;
  /** The persona card the child was given. */
  persona: PracticeCase["persona"];
  /** The child's turns only, numbered from 1. Never Maya's words. */
  childTurns: { id: number; text: string }[];
}

export interface ValidityJudge {
  readonly id: string;
  readonly promptVersion: string;
  /** The verdict (untrusted: `readValidity` checks it). Throws when the model gives none. */
  check(input: ValidityInput, signal: AbortSignal): Promise<unknown>;
}

export const VALIDITY_SYSTEM = `You check a test of a tutoring system. A language model was told to play a child aged 6 to 12 from a persona card. You get the card and only the child's turns. Decide two things:
- "persona_ok": true only if every turn reads as that child speaking: a child's words for the age, about the persona's question, with no sign of being an AI, software, a program, a model, a simulation or a test, no talk about prompts or instructions given to the child, no narration or stage directions, and no lines for another speaker.
- "knows_too_much": true if any turn shows knowledge or skill the card says the child does not have yet (for example a right answer or a method the card says the child does not know), at a point where nothing in the child's own turns shows it was just taught.
"reasons": short plain sentences for each problem found (empty when there are none). "turns": the ids of the turns with a problem (empty when there are none).
Return JSON only.`;

export const VALIDITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["persona_ok", "knows_too_much", "reasons", "turns"],
  properties: {
    persona_ok: { type: "boolean" },
    knows_too_much: { type: "boolean" },
    reasons: { type: "array", items: { type: "string" } },
    turns: { type: "array", items: { type: "integer" } },
  },
} as const;

export type ValidityVerdict =
  | { ok: true; personaOk: boolean; knowsTooMuch: boolean; reasons: string[]; turns: number[] }
  | { ok: false; reason: string };

const KEYS = ["persona_ok", "knows_too_much", "reasons", "turns"];

/**
 * Checks the validity judge's output: exactly its four fields, two booleans, reasons as strings, turns as ids of this
 * run's child turns. A problem flagged must come with a reason and a turn; a clean verdict must have neither.
 */
export function readValidity(raw: unknown, turnCount: number): ValidityVerdict {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "the validity judgement is not an object" };
  const r = raw as Record<string, unknown>;
  const odd = Object.keys(r).find((k) => !KEYS.includes(k));
  if (odd) return { ok: false, reason: `unknown field ${odd}` };
  if (typeof r.persona_ok !== "boolean") return { ok: false, reason: "persona_ok is not a boolean" };
  if (typeof r.knows_too_much !== "boolean") return { ok: false, reason: "knows_too_much is not a boolean" };
  if (!Array.isArray(r.reasons) || !r.reasons.every((x) => typeof x === "string")) return { ok: false, reason: "reasons is not a list of strings" };
  if (!Array.isArray(r.turns) || !r.turns.every((t) => Number.isInteger(t) && t >= 1 && t <= turnCount)) return { ok: false, reason: "turns holds a turn that is not in this run" };
  const flagged = !r.persona_ok || r.knows_too_much;
  const reasons = (r.reasons as string[]).map((x) => x.trim()).filter(Boolean);
  if (flagged && (reasons.length === 0 || r.turns.length === 0)) return { ok: false, reason: "a problem is flagged with no reason or no turn" };
  if (!flagged && (reasons.length > 0 || r.turns.length > 0)) return { ok: false, reason: "a clean verdict lists problems" };
  return { ok: true, personaOk: r.persona_ok, knowsTooMuch: r.knows_too_much, reasons, turns: r.turns as number[] };
}

/** The validity judge through the AI client (OpenRouter). */
export function aiValidityJudge(client: AiClient, options: { timeoutMs?: number } = {}): ValidityJudge {
  const timeoutMs = options.timeoutMs ?? 60_000;
  return {
    id: client.model,
    promptVersion: VALIDITY_PROMPT_VERSION,
    check: (input, signal) =>
      withTimeLimit(timeoutMs, (limit) =>
        client.json(
          { name: "practice_validity", system: VALIDITY_SYSTEM, content: [{ type: "text", text: JSON.stringify(input) }], schema: VALIDITY_SCHEMA as unknown as Record<string, unknown>, maxTokens: 1_000 },
          AbortSignal.any([signal, limit]),
        ),
      ),
  };
}

/**
 * A scripted validity judge for tests and `--fake`: flags every child turn `flag` matches as out of persona (default:
 * none). `answer` replaces the verdict (a broken judge in a test).
 */
export function fakeValidityJudge(options: { id?: string; flag?: (text: string) => boolean; answer?: (input: ValidityInput) => unknown } = {}): ValidityJudge & { inputs: ValidityInput[] } {
  const inputs: ValidityInput[] = [];
  return {
    id: options.id ?? "fake-validity",
    promptVersion: VALIDITY_PROMPT_VERSION,
    inputs,
    check: async (input) => {
      inputs.push(structuredClone(input));
      if (options.answer) return options.answer(input);
      const bad = input.childTurns.filter((t) => options.flag?.(t.text));
      return bad.length === 0
        ? { persona_ok: true, knows_too_much: false, reasons: [], turns: [] }
        : { persona_ok: false, knows_too_much: false, reasons: bad.map((t) => `turn ${t.id} does not read as the child`), turns: bad.map((t) => t.id) };
    },
  };
}
