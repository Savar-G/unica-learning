import { ReadableStream } from "node:stream/web";
import { USERDATA_TIMED_TRANSCRIPT, voice } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import { speechKey } from "@/lib/maya/speech";
import { SPEECH_SCOPE_DATA, speechSentences, speechWords, type BoardSpeech, type SpeechScope } from "@/lib/board-speech";

/**
 * Passes text to the voice provider and its audio back, and tells `count` the text once when audio came back, also when
 * the speech is cut later. Failed output counts nothing. The count never holds the audio back, and its failure is ignored.
 */
export async function countedSynthesis(
  text: ReadableStream<string> | AsyncIterable<string>,
  synthesize: (text: ReadableStream<string>) => Promise<ReadableStream<AudioFrame> | null>,
  count: (text: string) => void,
): Promise<ReadableStream<AudioFrame> | null> {
  let sent = "";
  const chunks = text[Symbol.asyncIterator]();
  const frames = await synthesize(new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await chunks.next();
      if (done) return controller.close();
      sent += value;
      controller.enqueue(value);
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

/** Synthesize separate sentences so a provider without word times still has real sentence audio boundaries. */
export function boardAudio(
  text: ReadableStream<string> | AsyncIterable<string>,
  synthesize: (text: ReadableStream<string>) => Promise<ReadableStream<AudioFrame> | null>,
  board: BoardSpeech,
  scope: SpeechScope,
): ReadableStream<AudioFrame> {
  const abort = new AbortController();
  let current: ReadableStreamDefaultReader<AudioFrame> | null = null;
  return new ReadableStream<AudioFrame>({
    async start(controller) {
      const stale = () => {
        if (abort.signal.aborted) return true;
        if (board.owns(scope)) return false;
        controller.close();
        return true;
      };
      try {
        if (stale()) return;
        let full = "";
        for await (const chunk of text) { if (stale()) return; full += chunk; }
        let offsetMs = 0;
        let words = 0;
        for (const sentence of speechSentences(full)) {
          if (stale()) return;
          const input = new ReadableStream<string>({ start(c) { c.enqueue(sentence); c.close(); } });
          const frames = await synthesize(input);
          if (stale()) {
            // A provider can return after cancellation. Retire its stream without touching a newer board plan.
            void frames?.cancel(scope).catch(() => {});
            return;
          }
          if (!frames) { await board.interrupt(scope); if (!abort.signal.aborted) controller.close(); return; }
          const reader = frames.getReader();
          current = reader;
          let durationMs = 0;
          const alignment = new Map<string, voice.TimedString>();
          const expectedWords = speechWords(sentence);
          const prefixes = expectedWords.map((_, i) => speechKey(expectedWords.slice(0, i + 1).join(" ")));
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
                    const expected = prefixes[n - 1];
                    if (expected && (heard === expected || heard.startsWith(`${expected} `))) matchedWords = n;
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
      }
    },
    async cancel() { abort.abort(); await current?.cancel(scope).catch(() => {}); },
  });
}
