// Maya's instant acknowledgement in a voice call (#532): a few code-written words the voice worker says when a child's
// turn is not ready within a short limit, so the child does not hear silence while the model and the free-talk review
// run. It is not a turn: the controller (src/lib/maya) never sees it, no model writes or picks it, and it never stages a
// board batch. It sits outside the controller so the D-195 rule holds by construction: this bank has no math in it, and
// `acknowledgementProblem` is the gate check that keeps it so. It lives in src/lib, not in the worker, because CI runs
// `npm test` and not `npm run voice:test`.
//
// New wording goes in docs/maya-practice-lines.md for Savar's reading.
import { workProblem } from "@/lib/maya";

/**
 * The worker having the child's turn to the acknowledgement, when Maya's first sentence has not come by then and her reply
 * can stream (D-341). MAYA_ACK_LIMIT_MS replaces it. 2600 ms (1500 before 2026-11-13): on real calls the first streamed
 * sentence came 1.6 to 2.2 s after the child stopped, so a phrase at 1.5 s played just before it and held the answer back
 * 1 to 1.4 s (the answer at 3.0 to 3.8 s with the phrase, 2.0 to 2.6 s without). It counts from the turn reaching the
 * worker, not from the child's end of speech: a turn the speech-to-text held long would otherwise start its phrase at
 * once, and the answer would then wait for the phrase.
 */
export const ACK_LIMIT_MS = 2600;
/**
 * The same, for a turn code knows will not stream before any model call (a request for help, a stop, feelings, off-topic
 * talk: `streamRules` is null). Its reply takes 2 to 5 s, so the phrase comes at once.
 */
export const ACK_NOT_STREAMED_MS = 0;
/**
 * An ordinary answer waits for a phrase to finish, because cutting a phrase of a few words sounds worse than a short
 * wait. This is the limit from the moment the phrase is queued, if its audio never reports an end: the longest phrase is
 * about 1.5 s at a calm pace, and the rest is for the voice's first sound. Safety guidance and the deadline close do not
 * wait at all.
 */
export const ACK_HOLD_LIMIT_MS = 3000;

export interface Acknowledgement {
  id: string;
  text: string;
}

/**
 * Every word here is said to a child aged 6 to 12 with no check by a model. "Mm-hm" and "Okay" are left out on purpose:
 * after "Is it 56?" they sound like "yes" before the line that checks the answer. "Let me look" is left out because
 * "look" is one of the work words of `workProblem`. "I'm thinking" is left out because it claims a state of mind for an AI.
 */
export const ACK_PHRASES: readonly Acknowledgement[] = [
  { id: "ack.think.hmm", text: "Hmm, let me think." },
  { id: "ack.see.plain", text: "Let me see." },
  { id: "ack.moment.plain", text: "Just a moment." },
  { id: "ack.think.this", text: "Let me think about this." },
  { id: "ack.see.hmm", text: "Hmm, let me see." },
  { id: "ack.think.plain", text: "Let me think." },
  { id: "ack.moment.hmm", text: "Hmm, just a moment." },
  { id: "ack.see.here", text: "Let me see here." },
];

/** One sentence in one of these shapes. Anything else could be an instruction, so it is refused. */
const SHAPE = /^(?:hmm, )?(?:let me (?:think|see)|just a moment)(?: about this| here)?\.$/i;
/** Words that sound like a verdict on what the child just said, or speak to the child. */
const VERDICT = /\b(?:yes|yeah|yep|ok|okay|good|great|nice|sure|perfect|mm|hm|mhm|you|your)\b/i;

/** Why a line cannot be an acknowledgement, or null: a number, place, operation or work word, a verdict, or another shape. */
export function acknowledgementProblem(text: string): string | null {
  const work = workProblem(text);
  if (work !== null) return work;
  const verdict = VERDICT.exec(text);
  if (verdict) return `a verdict or a word to the child: ${verdict[0]}`;
  return SHAPE.test(text) ? null : "not one of the allowed shapes";
}

/** The next phrase this call has not said, or null when the bank is used: then Maya stays silent, and never repeats. */
export function nextAcknowledgement(callId: string, used: readonly string[]): Acknowledgement | null {
  // Each call starts at another place in the bank, so a child does not hear the same first phrase in every call.
  const start = [...callId].reduce((sum, c) => sum + c.charCodeAt(0), 0) % ACK_PHRASES.length;
  for (let i = 0; i < ACK_PHRASES.length; i++) {
    const phrase = ACK_PHRASES[(start + i) % ACK_PHRASES.length];
    if (!used.includes(phrase.id)) return phrase;
  }
  return null;
}
