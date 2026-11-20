// A backchannel while Maya speaks (#1147, Savar's decision of 2026-11-20): a child's final transcript that is only "mm",
// "mm-hmm", "uh-huh", "okay" or "yeah" does not stop her. LiveKit has paused her for the sound; with no words to read,
// it resumes her, and the board plan goes on. Anything else ("wait", "stop", "no", "okay I get it", a second word)
// interrupts as before. Outside Maya's speech these words are an ordinary child turn (agent.ts, `sttNode`).

/** "mm", "mmm"; "mm-hmm", "mm-hm", "mhm", "mm hmm"; "uh-huh", "uh huh"; "okay", "ok"; "yeah". */
const BACKCHANNEL = /^(?:m+|m+[- ]?h+m+|uh[- ]?huh|okay|ok|yeah)$/;

/** True when the transcript is one backchannel and nothing else (case and punctuation aside). */
export function isBackchannel(text: string): boolean {
  const words = text.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
  return BACKCHANNEL.test(words);
}
