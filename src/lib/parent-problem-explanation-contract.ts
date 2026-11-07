export interface Explanation { steps: string[]; say: string }
export type ExplanationResult = { status: "ready"; explanation: Explanation; correctAnswer: string; context: string }
  | { status: "refused" | "unavailable" | "busy" | "retry" | "cap" };

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const plain = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max
  && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]|https?:|www\.|\]\(/i.test(v);
/** No output HTML or links. Model text can never replace the separate code-owned stored answer. */
export function explanationOutput(value: unknown): Explanation | null {
  if (!object(value) || Object.keys(value).sort().join() !== "say,steps" || !Array.isArray(value.steps)
    || value.steps.length < 1 || value.steps.length > 4 || !value.steps.every(s => plain(s, 240)) || !plain(value.say, 300)) return null;
  return { steps: value.steps.map(s => s.trim()), say: value.say.trim() };
}
