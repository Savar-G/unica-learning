// What is left of a finished turn after its first sentences were said early (D-341). Pure: no clock, no LiveKit.
import type { BoardCue } from "@/lib/board-speech";
import { speechWords } from "@/lib/board-speech";
import { sentencesOf } from "@/lib/maya";
import type { VoiceTurn } from "@/lib/maya-call";

export interface EarlyRest {
  /** The turns with the sentences already said left out (each sentence is said once). */
  turns: VoiceTurn[];
  /** The turns' board cues, as word positions in the rest of their words (`turns`' say joined). */
  cues: BoardCue[];
  /** The turns did not start with the sentences said: they are said from where they differ. */
  differ: boolean;
  /** Sentences said that no turn holds (the call lost its save, or the turns differ). */
  unmatched: string[];
}

/**
 * Leaves out of `turns` the sentences in `said`, in order, from their start, and moves each board cue back by the words
 * left out. A cue counts the words of its own turn (VoiceTurn.boardCues), so it first moves on by the words of the turns
 * before it. A cue inside the words already said is shown at the rest's first word; a cue past the rest's last word, at
 * its last word. With no words left, every cue is at word 1 (the caller shows the batches at once).
 */
export function earlyRest(turns: readonly VoiceTurn[], said: readonly string[]): EarlyRest {
  const unmatched = [...said];
  let skipped = 0;
  let differ = false;
  let offset = 0;
  const cues: BoardCue[] = [];
  const out = turns.map(turn => {
    for (const c of turn.boardCues ?? []) cues.push({ batch: c.batch, word: c.word + offset });
    offset += speechWords(turn.say.join(" ")).length;
    const kept: string[] = [];
    for (const text of turn.say) {
      const rest = sentencesOf(text).filter(sentence => {
        if (!unmatched.length || differ) return true;
        if (unmatched[0] === sentence) { unmatched.shift(); skipped += speechWords(sentence).length; return false; }
        differ = true;
        return true;
      });
      if (rest.length) kept.push(rest.join(" "));
    }
    return { ...turn, say: kept };
  });
  const left = speechWords(out.flatMap(t => t.say).join(" ")).length;
  return {
    turns: out,
    cues: cues.map(c => ({ batch: c.batch, word: Math.min(Math.max(1, c.word - skipped), Math.max(1, left)) })),
    differ,
    unmatched,
  };
}
