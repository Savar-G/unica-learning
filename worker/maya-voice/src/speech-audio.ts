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
          if (!frames) continue;
          current = frames.getReader();
          let durationMs = 0;
          let aligned = "";
          let matchedWords = 0;
          const expectedWords = speechWords(sentence);
          for (;;) {
            const { value: frame, done } = await current.read();
            if (done || abort.signal.aborted) break;
            const times = frame.userdata[USERDATA_TIMED_TRANSCRIPT] as voice.TimedString[] | undefined;
            for (const t of times ?? []) {
              aligned += ` ${t.text.trim()}`;
              const heard = speechKey(aligned);
              const before = matchedWords;
              for (let n = matchedWords + 1; n <= expectedWords.length; n++) {
                const expected = speechKey(expectedWords.slice(0, n).join(" "));
                if (expected && (heard === expected || heard.startsWith(`${expected} `))) matchedWords = n;
              }
              if (matchedWords > before && t.endTime !== undefined) await board.timing(utteranceId, words + matchedWords, offsetMs + t.endTime * 1000, "word");
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
