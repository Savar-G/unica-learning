// The practice child (#325): a model plays a child from a persona and answers Maya one turn at a time. It reads only
// its persona and the call so far (what Maya said, what it said). It never reads Maya's expected actions, the answer
// key beyond what the persona knows, or the trace (research, section 8). The live simulator is any OpenRouter model
// through the AI client; tests and `--fake` use the scripted one.
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import type { PracticeCase } from "./cases";

/** The version of the simulator prompt and input. Raise it when either changes; every run records it. */
export const SIMULATOR_PROMPT_VERSION = "practice-child-1";

/** What the simulator reads for one child turn. */
export interface SimulatorInput {
  promptVersion: string;
  persona: PracticeCase["persona"];
  /** At most this many words a turn. */
  maxWords: number;
  /** The call so far, oldest first. */
  transcript: { speaker: "maya" | "child"; text: string }[];
}

/**
 * One child turn. `say`: the child speaks `text`. `wait`: the child is quiet for `seconds` (thinking). `write`: the child
 * writes on paper for `seconds`, then says they are done.
 */
export interface SimulatorTurn {
  action: "say" | "wait" | "write";
  text: string | null;
  seconds: number | null;
  /** The child wants to end the call. */
  stop: boolean;
}

export interface ChildSimulator {
  readonly id: string;
  readonly promptVersion: string;
  /** One child turn (untrusted: the suite checks its shape). Throws when the model gives none. */
  next(input: SimulatorInput, signal: AbortSignal): Promise<unknown>;
}

/** Words a turn by age: younger children say less. */
export const maxWords = (age: number) => (age <= 8 ? 25 : 40);

export const SIMULATOR_SYSTEM = `You play a child aged 6 to 12 in a short voice call with Maya, an AI math teaching assistant. The call is about one question in the child's paper workbook.
Stay in the persona you are given for the whole call. You are a test of Maya, so your behaviour must follow the persona exactly:
- Know only what "persona.knows" says. Make exactly the mistakes it describes. Never become better at math than the persona unless Maya's help shows you the step.
- Follow "persona.behaviour" in order. Do not skip the things it tells you to say.
- Only talk about the persona's question ("persona.question"). Never bring in another question or other numbers.
- Speak as the child only, in plain words a child of that age would say, at most "maxWords" words. Never write Maya's part, never write a speaker label, never describe the scene, never mention that you are an AI, a model or a test.
- Do not end the call or say you want to stop unless the persona allows it. When Maya says goodbye, say a short goodbye.
- If Maya asks you to write something on paper, use action "write" with a few seconds; otherwise use "say". Use "wait" only when the persona would sit and think in silence.
Return JSON only: {"action": "say"|"wait"|"write", "text": the child's words or null, "seconds": a whole number for wait or write or null, "stop": true only when the child asks to end the call}.`;

export const SIMULATOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["action", "text", "seconds", "stop"],
  properties: {
    action: { type: "string", enum: ["say", "wait", "write"] },
    text: { type: ["string", "null"] },
    seconds: { type: ["integer", "null"] },
    stop: { type: "boolean" },
  },
} as const;

/** Reads a simulator turn, or says what is wrong with it. */
export function readSimulatorTurn(raw: unknown): { ok: true; turn: SimulatorTurn } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "not an object" };
  const r = raw as Record<string, unknown>;
  const extra = Object.keys(r).filter((k) => !["action", "text", "seconds", "stop"].includes(k));
  if (extra.length > 0) return { ok: false, reason: `unknown field ${extra[0]}` };
  if (r.action !== "say" && r.action !== "wait" && r.action !== "write") return { ok: false, reason: "action is not say, wait or write" };
  if (r.text !== null && typeof r.text !== "string") return { ok: false, reason: "text is not a string or null" };
  if (r.seconds !== null && !(Number.isInteger(r.seconds) && (r.seconds as number) >= 1 && (r.seconds as number) <= 120)) return { ok: false, reason: "seconds is not 1 to 120 or null" };
  if (typeof r.stop !== "boolean") return { ok: false, reason: "stop is not a boolean" };
  if (r.action === "say" && !(typeof r.text === "string" && r.text.trim())) return { ok: false, reason: "a say turn has no text" };
  if (r.action !== "say" && r.seconds === null) return { ok: false, reason: `a ${r.action} turn has no seconds` };
  return { ok: true, turn: { action: r.action, text: typeof r.text === "string" ? r.text.trim() : null, seconds: (r.seconds as number | null) ?? null, stop: r.stop } };
}

/** The child simulator through the AI client (OpenRouter). */
export function aiChildSimulator(client: AiClient, options: { timeoutMs?: number } = {}): ChildSimulator {
  const timeoutMs = options.timeoutMs ?? 60_000;
  return {
    id: client.model,
    promptVersion: SIMULATOR_PROMPT_VERSION,
    next: (input, signal) =>
      withTimeLimit(timeoutMs, (limit) =>
        client.json(
          { name: "practice_child", system: SIMULATOR_SYSTEM, content: [{ type: "text", text: JSON.stringify(input) }], schema: SIMULATOR_SCHEMA as unknown as Record<string, unknown>, maxTokens: 1_000 },
          AbortSignal.any([signal, limit]),
        ),
      ),
  };
}

/**
 * A scripted simulator: says each line of `script` in order, then says goodbye. For tests, `--fake` and the cost
 * estimate. `answer` replaces a turn (a broken or out-of-persona simulator in a test).
 */
export function scriptedSimulator(
  script: readonly string[],
  /** `call` is the number of child turns so far in this run. */
  options: { id?: string; answer?: (input: SimulatorInput, call: number) => unknown } = {},
): ChildSimulator & { inputs: SimulatorInput[] } {
  const inputs: SimulatorInput[] = [];
  return {
    id: options.id ?? "fake-child",
    promptVersion: SIMULATOR_PROMPT_VERSION,
    inputs,
    next: async (input) => {
      inputs.push(structuredClone(input));
      // The child's own turns so far: each run starts the script again.
      const call = input.transcript.filter((t) => t.speaker === "child").length;
      if (options.answer) return options.answer(input, call);
      const text = script[call] ?? "Bye.";
      return { action: "say", text, seconds: null, stop: false };
    },
  };
}
