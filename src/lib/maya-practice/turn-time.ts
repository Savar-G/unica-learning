// How long Maya's model and the free-talk review took in a practice run (#532), so two turn models can be compared on
// time as well as on the report (`--maya-model`, docs/maya-practice.md). The run's own clock is simulated, so its traces
// hold no real durations; this reads the real clock around each call. It is not part of the run's saved, hashed files
// and not a gate result. No network or clock of its own: the clock is passed in.
import type { MayaModel } from "@/lib/maya-model";
import type { TalkReviewer } from "@/lib/maya-talk-review";

export interface CallTimes {
  id: string;
  calls: number;
  failed: number;
  p50Ms: number | null;
  p95Ms: number | null;
}
export interface TurnTimeReport {
  maya: CallTimes;
  review: CallTimes | null;
}

function recorder(id: string, now: () => number) {
  const times: number[] = [];
  let failed = 0;
  return {
    timed: async <T>(call: () => Promise<T>): Promise<T> => {
      const start = now();
      try { return await call(); }
      catch (error) { failed++; throw error; }
      finally { times.push(now() - start); }
    },
    report: (): CallTimes => {
      const sorted = [...times].sort((a, b) => a - b);
      const at = (p: number) => (sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null);
      return { id, calls: sorted.length, failed, p50Ms: at(0.5), p95Ms: at(0.95) };
    },
  };
}

/** The same model and review, with the same ids and answers, timed. A failed or abandoned call counts too. */
export function timedTurns(maya: MayaModel, reviewer: TalkReviewer | null, now: () => number) {
  const m = recorder(maya.id, now);
  const r = reviewer ? recorder(reviewer.id, now) : null;
  return {
    maya: { id: maya.id, promptVersion: maya.promptVersion, ...(maya.output ? { output: maya.output } : {}), propose: (input, signal) => m.timed(() => maya.propose(input, signal)) } as MayaModel,
    reviewer: reviewer && r ? { id: reviewer.id, promptVersion: reviewer.promptVersion, review: (input, signal) => r.timed(() => reviewer.review(input, signal)) } as TalkReviewer : null,
    report: (): TurnTimeReport => ({ maya: m.report(), review: r?.report() ?? null }),
  };
}

export function turnTimeMarkdown(report: TurnTimeReport, mode: string): string {
  const row = (name: string, t: CallTimes) => `| ${name} | ${t.id} | ${t.calls} | ${t.failed} | ${t.p50Ms ?? "-"} | ${t.p95Ms ?? "-"} |`;
  return [
    "# Maya practice: call times (not a gate result)", "",
    "| Call | Model | Calls | Failed | p50 ms | p95 ms |", "|---|---|---|---|---|---|",
    row("Maya", report.maya), ...(report.review ? [row("Free-talk review", report.review)] : []), "",
    `Mode: ${mode}. Times are from this machine, with the run's other calls going on at the same time. They do not include speech-to-text or the voice.${mode === "subscription" ? " On the subscription each call also starts a process, about 3 s, so these times say little about the API." : ""}`,
  ].join("\n");
}
