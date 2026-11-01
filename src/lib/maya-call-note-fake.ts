// A fake AI client for the parent's call notes (#331): no network. Tests and development use it in place of the AI. In
// development, AI_REVIEW_FAKE=sure or unsure (noteAiClient in src/lib/maya-call-note.ts, never in a production
// build) writes the warm sentence from the transcript in the request.
// "sure": a sentence that passes the code check. "unsure": a sentence with a number and a math word, so the check drops
// it and the note is code only.
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";

export const NOTE_FAKE_MODEL = "fake-note";

function answer(request: AiJsonRequest, mode: "sure" | "unsure"): { warm: string } {
  const first = request.content[0];
  const transcript = first?.type === "text" ? first.text : "";
  if (mode === "unsure") return { warm: "{child} added 27 and 39 to get 66 all alone." };
  const asked = /Child: .*\?/.test(transcript);
  return { warm: asked ? "{child} asked good questions and kept trying." : "{child} stayed calm and kept going." };
}

export function fakeNoteAi(mode: "sure" | "unsure" = "sure"): AiClient & { requests: AiJsonRequest[] } {
  return fakeAiClient({ model: NOTE_FAKE_MODEL, answer: (r) => answer(r, mode) });
}
