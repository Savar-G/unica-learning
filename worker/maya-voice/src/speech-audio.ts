import { ReadableStream } from "node:stream/web";
import { USERDATA_TIMED_TRANSCRIPT, voice } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import { speechKey } from "@/lib/maya/speech";
import { SPEECH_SCOPE_DATA, speechSentences, speechWords, type BoardSpeech, type SpeechScope } from "@/lib/board-speech";
import { spokenStream, spokenWords } from "@/lib/maya-voice-spoken";

/**
 * Passes text to the voice provider and its audio back, and tells `count` the text once when audio came back, also when
 * the speech is cut later. Failed output counts nothing. The count never holds the audio back, and its failure is ignored.
 * Every line Maya says reaches the provider here, so here its math signs become words (`spokenMath`, a sentence at a
 * time): "52 − 28" goes to the provider as "52 minus 28". `count` gets that spoken text, which is what the provider
 * receives and bills. Text that is already spoken (from `boardAudio`) does not change again.
 */
export async function countedSynthesis(
  text: ReadableStream<string> | AsyncIterable<string>,
  synthesize: (text: ReadableStream<string>) => Promise<ReadableStream<AudioFrame> | null>,
  count: (text: string) => void,
): Promise<ReadableStream<AudioFrame> | null> {
  let sent = "";
  const chunks = text[Symbol.asyncIterator]();
  const spoken = spokenStream();
  const frames = await synthesize(new ReadableStream<string>({
    async pull(controller) {
      for (;;) {
        const { value, done } = await chunks.next();
        const said = done ? spoken.end() : spoken.push(value);
        if (said) {
          sent += said;
          controller.enqueue(said);
        }
        if (done) return controller.close();
        if (said) return;
      }
    },
    async cancel() { await chunks.return?.(); },
  }));
  if (!frames) return null;
  const reader = frames.getReader();
  let heard = false;
  let counted = false;
  const charge = () => {
    if (!heard || counted) return;
    counted = true;
    try { count(sent); } catch { /* The words are already said. */ }
  };
  return new ReadableStream<AudioFrame>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) { charge(); return controller.close(); }
        heard = true;
        controller.enqueue(value);
      } catch (e) {
        charge();
        controller.error(e);
      }
    },
    async cancel(reason) {
      charge();
      await reader.cancel(reason);
    },
  });
}

/**
 * Synthesize separate sentences so a provider without word times still has real sentence audio boundaries. The next
 * sentence is synthesized while the current one plays, so the voice does not stop between sentences for the provider's
 * first-audio delay. No frame plays before the plan's batches are on the receiver (`board.sent`): the text goes to the
 * voice while the plan goes out, and a cue word can never be heard before its batch is staged.
 */
export function boardAudio(
  text: ReadableStream<string> | AsyncIterable<string>,
  synthesize: (text: ReadableStream<string>) => Promise<ReadableStream<AudioFrame> | null>,
  board: BoardSpeech,
  scope: SpeechScope,
): ReadableStream<AudioFrame> {
  const abort = new AbortController();
  let current: ReadableStreamDefaultReader<AudioFrame> | null = null;
  /** The next sentence's synthesis, started early. It is retired with this stream. */
  let ahead: Promise<ReadableStream<AudioFrame> | null> | null = null;
  const retireAhead = () => {
    const next = ahead;
    ahead = null;
    void next?.then(frames => frames?.cancel(scope)).catch(() => {});
  };
  return new ReadableStream<AudioFrame>({
    async start(controller) {
      const stale = () => {
        if (abort.signal.aborted) return true;
        if (board.owns(scope)) return false;
        controller.close();
        return true;
      };
      const synthesizeSentence = (spoken: string) => synthesize(new ReadableStream<string>({ start(c) { c.enqueue(spoken); c.close(); } }));
      try {
        if (stale()) return;
        let full = "";
        for await (const chunk of text) { if (stale()) return; full += chunk; }
        let offsetMs = 0;
        let words = 0;
        const sentences = speechSentences(full);
        // What the provider says for each word of the text, read with the whole text around it (a sentence break can
        // fall between a sign and its number: "? − 28 = 24"). Entry n is the spoken form of word n.
        const spokenAll = spokenWords(full);
        let first = 0;
        const spokenSentences = sentences.map(sentence => {
          const count = speechWords(sentence).length;
          const said = spokenAll.slice(first, first + count);
          first += count;
          return said.length === count ? said : spokenWords(sentence);
        });
        let gated = false;
        for (const [index, sentence] of sentences.entries()) {
          if (stale()) return;
          const pending = ahead ?? synthesizeSentence(spokenSentences[index].join(" "));
          ahead = null;
          const frames = await pending;
          if (stale()) {
            // A provider can return after cancellation. Retire its stream without touching a newer board plan.
            void frames?.cancel(scope).catch(() => {});
            return;
          }
          if (!frames) { await board.interrupt(scope); if (!abort.signal.aborted) controller.close(); return; }
          if (!gated) {
            gated = true;
            // The voice has the words already; its audio waits until the plan is on the child's screen. A plan that
            // could not be sent has no audio: the call's own handler ends the call for that failure.
            let failed = false;
            try { await board.sent(scope); } catch { failed = true; }
            if (failed || stale()) {
              void frames.cancel(scope).catch(() => {});
              if (failed && !abort.signal.aborted) controller.close();
              return;
            }
          }
          // The next sentence's audio is made while this one is read out.
          if (index + 1 < sentences.length) {
            ahead = synthesizeSentence(spokenSentences[index + 1].join(" "));
            // Its failure is read when its turn comes (below), not as an unhandled rejection while this one plays.
            void ahead.catch(() => {});
          }
          const reader = frames.getReader();
          current = reader;
          let durationMs = 0;
          const alignment = new Map<string, voice.TimedString>();
          // A cue counts the words of Maya's own text, but the provider times the words it said ("three quarters" for
          // "3/4"). Word n is reached when what was heard covers the spoken form of words 1 to n (or their written form,
          // for a provider that reports the text it was given).
          const expectedWords = speechWords(sentence);
          const spokenSentence = spokenSentences[index];
          const prefixes = expectedWords.map((_, i) => [
            speechKey(spokenSentence.slice(0, i + 1).join(" ")),
            speechKey(expectedWords.slice(0, i + 1).join(" ")),
          ]);
          try {
            for (;;) {
              const { value: frame, done } = await reader.read();
              if (stale()) { void reader.cancel(scope).catch(() => {}); return; }
              if (done) break;
              const times = frame.userdata[USERDATA_TIMED_TRANSCRIPT] as voice.TimedString[] | undefined;
              let changed = false;
              for (const t of times ?? []) {
                if (t.endTime === undefined || !Number.isFinite(t.endTime) || t.endTime <= 0) continue;
                const key = JSON.stringify([t.startTime, t.endTime, speechKey(t.text)]);
                if (!alignment.has(key)) { alignment.set(key, t); changed = true; }
              }
              if (changed) {
                let aligned = "";
                let matchedWords = 0;
                const ordered = [...alignment.values()].sort((a, b) => (a.startTime ?? a.endTime!) - (b.startTime ?? b.endTime!) || a.endTime! - b.endTime!);
                for (const t of ordered) {
                  aligned += ` ${t.text.trim()}`;
                  const heard = speechKey(aligned);
                  const before = matchedWords;
                  for (let n = matchedWords + 1; n <= expectedWords.length; n++) {
                    if (prefixes[n - 1].some(expected => expected && (heard === expected || heard.startsWith(`${expected} `)))) matchedWords = n;
                  }
                  if (matchedWords > before) {
                    await board.timing(scope, words + matchedWords, offsetMs + t.endTime! * 1000, "word");
                    if (stale()) { void reader.cancel(scope).catch(() => {}); return; }
                  }
                }
              }
              if (times?.length) frame.userdata[USERDATA_TIMED_TRANSCRIPT] = times.map(t => voice.createTimedString({ ...t,
                startTime: t.startTime === undefined ? undefined : t.startTime + offsetMs / 1000,
                endTime: t.endTime === undefined ? undefined : t.endTime + offsetMs / 1000,
              }));
              durationMs += frame.samplesPerChannel / frame.sampleRate * 1000;
              frame.userdata[SPEECH_SCOPE_DATA] = scope;
              controller.enqueue(frame);
            }
          } finally {
            reader.releaseLock();
            if (current === reader) current = null;
          }
          if (stale()) return;
          if (durationMs <= 0) {
            // The sentence was never spoken. Only this stream's current plan can be retired.
            await board.interrupt(scope);
            if (!abort.signal.aborted) controller.close();
            return;
          }
          words += speechWords(sentence).length;
          offsetMs += durationMs;
          // If timestamps were missing, or incomplete, use this sentence's generated audio end.
          await board.timing(scope, words, offsetMs, "sentence");
          if (stale()) return;
        }
        if (!abort.signal.aborted) controller.close();
      } catch (e) {
        if (!abort.signal.aborted) {
          if (board.owns(scope)) controller.error(e);
          else controller.close();
        }
      } finally {
        // Every way out, a stale plan or a cut included, retires the sentence made ahead: it is never read.
        retireAhead();
      }
    },
    async cancel() { abort.abort(); retireAhead(); await current?.cancel(scope).catch(() => {}); },
  });
}
