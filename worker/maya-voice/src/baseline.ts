import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import type { BaselineGroup, BaselineTurn } from "@/lib/maya-baseline";
import type { CueMeasurement } from "@/lib/board-speech";
import type { CallTelemetry } from "./telemetry";
import type { VoiceTurnSample } from "./turn-timing";

const observed = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
function span(record: Record<string, unknown> | undefined | null, from: string, to: string) {
  const start = observed(record?.[from]);
  const end = observed(record?.[to]);
  return start === undefined || end === undefined ? undefined : observed(end - start);
}

/** Project the existing worker marks. Omit a phase when its endpoints are unavailable or out of order. */
export function voiceBaselineTurn(group: BaselineGroup, sample: VoiceTurnSample, clock: ReturnType<CallTelemetry["turnClock"]>, cues?: readonly CueMeasurement[]): BaselineTurn {
  const requests = clock && !clock.requestDetailsEvicted ? clock.requests : undefined;
  const request = (source: "model" | "repair" | "review") => requests?.find(r => r.source === source);
  const requestCount = (source: "model" | "repair" | "review") => requests?.filter(r => r.source === source).length;
  const utterances = clock && !clock.utteranceDetailsEvicted ? clock.utterances : undefined;
  const answer = utterances?.find(u => u.kind === "answer" && observed(u.playbackStarted) !== undefined);
  const outcome = sample.outcome === "answered" ? "completed" : sample.outcome === "no_words" ? "no_output" : sample.outcome;
  const firstShown = cues?.filter(c => c.state === "shown" || c.state === "presented")
    .reduce<CueMeasurement | undefined>((first, cue) => !first || cue.acknowledgedAt < first.acknowledgedAt ? cue : first, undefined);
  return {
    v: 1,
    ...group,
    outcome,
    ms: {
      speechEndToFinal: observed(sample.sttWaitMs),
      finalToTurn: observed(sample.finalToTurnMs),
      admission: observed(clock?.admissionMs),
      firstCheckedSentence: span(clock, "turnStart", "firstSentence"),
      modelFirstChunk: span(request("model"), "sent", "firstBodyChunk"),
      workerReply: observed(sample.waitMs),
      turnToWorkerReply: observed(sample.turnToAnswerMs),
      workerFiller: sample.ackHeard ? observed(sample.firstSoundMs) : undefined,
      synthesisFirstFrame: span(answer, "ttsRequest", "ttsFirstFrame"),
      frameToWorkerPlayout: span(answer, "ttsFirstFrame", "playbackStarted"),
      boardPlanReady: observed(sample.stageMs),
      boardCueAcknowledgement: observed(firstShown?.acknowledgementMs),
      requestModel: span(request("model"), "sent", "end"),
      requestRepair: span(request("repair"), "sent", "end"),
      requestReview: span(request("review"), "sent", "end"),
    },
    counts: {
      model: requestCount("model"),
      repair: requestCount("repair"),
      talkReview: requests?.filter(r => r.reviewKind === "talk").length,
      mathReview: requests?.filter(r => r.reviewKind === "math").length,
      reviewUnclassified: requests?.filter(r => r.source === "review" && !r.reviewKind).length,
      requestFailed: requests?.filter(r => r.outcome === "error" || r.status === "4xx" || r.status === "5xx").length,
      requestTimeout: requests?.filter(r => r.timedOut).length,
      requestAborted: requests?.filter(r => r.outcome === "aborted").length,
      requestUnfinished: requests?.filter(r => r.outcome === null).length,
      discardedPreparation: clock && !clock.preparationDetailsEvicted ? clock.preparations.filter(p => p.status === "discarded").length : undefined,
      ttsRequests: utterances?.reduce((n, u) => n + u.ttsRequests, 0),
      boardCues: cues?.length,
    },
  };
}

/** Process-wide figures for an opt-in run. GC and other work can overlap the response phases. */
export function startVoiceBaselineProfile() {
  const start = performance.now();
  const cpuStart = process.cpuUsage();
  const memoryStart = process.memoryUsage();
  const delay = monitorEventLoopDelay({ resolution: 10 });
  const pauses = { n: 0, totalMs: 0, maxMs: null as number | null };
  const recordPause = (duration: number) => {
    pauses.n++;
    pauses.totalMs += duration;
    pauses.maxMs = Math.max(pauses.maxMs ?? 0, duration);
  };
  const gc = new PerformanceObserver(list => { for (const entry of list.getEntries()) recordPause(entry.duration); });
  gc.observe({ entryTypes: ["gc"] });
  delay.enable();
  return () => {
    delay.disable();
    for (const entry of gc.takeRecords()) recordPause(entry.duration);
    gc.disconnect();
    const cpu = process.cpuUsage(cpuStart);
    const memoryEnd = process.memoryUsage();
    return {
      elapsedMs: performance.now() - start,
      cpuMs: { user: cpu.user / 1000, system: cpu.system / 1000 },
      loopDelay: { n: delay.count, p95Ms: delay.count ? delay.percentile(95) / 1e6 : null },
      gc: pauses,
      heapBytes: { start: memoryStart.heapUsed, end: memoryEnd.heapUsed },
      rssBytes: { start: memoryStart.rss, end: memoryEnd.rss },
    };
  };
}
