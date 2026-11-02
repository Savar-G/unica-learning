// A fake AI client for the parent's call notes (#331): no network. Tests and development use it in place of the AI. In
// development, AI_REVIEW_FAKE=sure or unsure (noteAiClient in src/lib/maya-call-note.ts, never in a production
// build) picks the warm sentence from the ids the request's schema offers.
// "sure": the first offered id. "unsure": a sentence of its own in place of an id, so
// code drops it and the note is code only.
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";

export const NOTE_FAKE_MODEL = "fake-note";

/** The ids the request's schema allows, in order ("none" last). */
export function offeredIds(request: AiJsonRequest): string[] {
  const schema = request.schema as { properties?: { pick?: { enum?: unknown } } };
  const ids = schema.properties?.pick?.enum;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
}

function answer(request: AiJsonRequest, mode: "sure" | "unsure"): { pick: string } {
  if (mode === "unsure") return { pick: "{child} added 27 and 39 to get 66 all alone." };
  const ids = offeredIds(request);
  return { pick: ids[0] ?? "none" };
}

export function fakeNoteAi(mode: "sure" | "unsure" = "sure"): AiClient & { requests: AiJsonRequest[] } {
  return fakeAiClient({ model: NOTE_FAKE_MODEL, answer: (r) => answer(r, mode) });
}
