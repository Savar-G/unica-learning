import { ReadableStream } from "node:stream/web";
import { USERDATA_TIMED_TRANSCRIPT, voice } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import { speechKey } from "@/lib/maya/speech";
import { speechSentences, speechWords, type BoardSpeech } from "@/lib/board-speech";

/** Synthesize separate sentences so a provider without word times still has real sentence audio boundaries. */
export function boardAudio(
  text: ReadableStream<string> | AsyncIterable<string>,
  synthesize: (text: ReadableStream<string>) => Promise<ReadableStream<AudioFrame> | null>,
  board: BoardSpeech,
  utteranceId: string,
): ReadableStream<AudioFrame> {
  const abort = new AbortController();
  let current: ReadableStreamDefaultReader<AudioFrame> | null = null;
  return new ReadableStream<AudioFrame>({
    async start(controller) {
      try {
        let full = "";
        for await (const chunk of text) { if (abort.signal.aborted) return; full += chunk; }
        let offsetMs = 0;
        let words = 0;
        for (const sentence of speechSentences(full)) {
          if (abort.signal.aborted) return;
          const input = new ReadableStream<string>({ start(c) { c.enqueue(sentence); c.close(); } });
          const frames = await synthesize(input);
          if (!frames) { await board.interrupt(); controller.close(); return; }
          current = frames.getReader();
          let durationMs = 0;
          const alignment = new Map<string, voice.TimedString>();
          const expectedWords = speechWords(sentence);
          const prefixes = expectedWords.map((_, i) => speechKey(expectedWords.slice(0, i + 1).join(" ")));
          for (;;) {
            const { value: frame, done } = await current.read();
            if (done || abort.signal.aborted) break;
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
                if (matchedWords > before) await board.timing(utteranceId, words + matchedWords, offsetMs + t.endTime! * 1000, "word");
              }
            }
            if (times?.length) frame.userdata[USERDATA_TIMED_TRANSCRIPT] = times.map(t => voice.createTimedString({ ...t,
              startTime: t.startTime === undefined ? undefined : t.startTime + offsetMs / 1000,
              endTime: t.endTime === undefined ? undefined : t.endTime + offsetMs / 1000,
            }));
            durationMs += frame.samplesPerChannel / frame.sampleRate * 1000;
            controller.enqueue(frame);
          }
          current.releaseLock();
          current = null;
          if (durationMs <= 0) {
            // The sentence was never spoken. Retire its whole plan rather than borrowing a later sentence's boundary.
            await board.interrupt();
            if (!abort.signal.aborted) controller.close();
            return;
          }
          words += speechWords(sentence).length;
          offsetMs += durationMs;
          // If timestamps were missing, or incomplete, use this sentence's generated audio end.
          await board.timing(utteranceId, words, offsetMs, "sentence");
        }
        if (!abort.signal.aborted) controller.close();
      } catch (e) { if (!abort.signal.aborted) controller.error(e); }
    },
    async cancel() { abort.abort(); await current?.cancel().catch(() => {}); },
  });
}
