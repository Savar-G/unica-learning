// A backchannel while Maya speaks (#1147, Savar's decision of 2026-11-20): a child's final transcript that is only "mm",
// "mm-hmm", "uh-huh", "okay" or "yeah" does not stop her. LiveKit has paused her for the sound; with no words to read,
// it resumes her, and the board plan goes on. Anything else ("wait", "stop", "no", "okay I get it", "Okay, 4", a second
// word) interrupts as before. Outside Maya's speech these words are an ordinary child turn (agent.ts, `sttNode`).
import { normalizeTranscript, UNSURE_CONFIDENCE, type Heard } from "@/lib/maya-voice";

/** "mm", "mmm"; "mm hmm", "mm hm", "mhm"; "uh huh"; "okay", "ok"; "yeah" (after normalization: a hyphen is a space). */
const BACKCHANNEL = /^(?:m+|m+ ?h+m+|uh ?huh|okay|ok|yeah)$/;

/** True when the transcript is one backchannel and nothing else. Letters and numbers are kept: "Okay, 4." is not one. */
export function isBackchannel(text: string): boolean {
  return BACKCHANNEL.test(normalizeTranscript(text));
}

/**
 * True only for a sure, lone backchannel: its confidence is at least UNSURE_CONFIDENCE (or not given) and every other
 * reading the speech-to-text offered is a backchannel too. An unsure or conflicting transcript goes on to the session's
 * hearing and safety checks, which can ask the child what they said.
 */
export function clearBackchannel(alternatives: readonly Heard[]): boolean {
  const [best, ...others] = alternatives;
  if (!best || !isBackchannel(best.text)) return false;
  if (typeof best.confidence === "number" && best.confidence < UNSURE_CONFIDENCE) return false;
  return others.every((a) => !a.text.trim() || isBackchannel(a.text));
}
