import { ServerOptions } from "@livekit/agents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baselineAgentName, baselineCostReport, baselineReport, complexBudget, prepareBaselineEnv, readBaselineCost, deviceTurn, plannedTurns, readBaselineTurn, receiptCost, requestEffort, speechCosts, type BaselineTurn } from "./maya-baseline";

describe("#1139 baseline report", () => {
  it("separates matched measurements by the active teaching settings", () => {
    const base = {
      v: 1, evidence: "device", mode: "voice", turnType: "complex", provider: "same-providers",
      device: "same-device", network: "loopback", concurrency: 1, outcome: "completed", counts: {},
    } as const;
    const report = baselineReport([
      readBaselineTurn({ ...base, teaching: "existing", ms: { deviceUseful: 2600 } }),
      readBaselineTurn({ ...base, teaching: "checked-exchange+checked-routine", ms: { deviceUseful: 1100 } }),
      readBaselineTurn({ ...base, ms: { deviceUseful: 1700 } }),
    ]);
    expect(report.map(({ group, ms }) => [group.teaching, ms.deviceUseful])).toEqual([
      ["existing", { n: 1, p50: 2600, p95: 2600 }],
      ["checked-exchange+checked-routine", { n: 1, p50: 1100, p95: 1100 }],
      [undefined, { n: 1, p50: 1700, p95: 1700 }],
    ]);
    expect(() => readBaselineTurn({ ...base, teaching: "arbitrary text", ms: {} })).toThrow("Invalid Maya baseline turn");
  });

  it("keeps failed turns in the group and leaves unobserved device output empty", () => {
    const group = { evidence: "simulated", mode: "voice", turnType: "routine", provider: "fake", device: "none", network: "in-process", concurrency: 2 } as const;
    const base: BaselineTurn = { v: 1, ...group, outcome: "completed", ms: {}, counts: {} };
    const report = baselineReport([
      { ...base, ms: { workerReply: 25, workerFiller: 1 }, counts: { model: 1 } },
      { ...base, ms: { workerReply: 51 }, counts: { model: 1, mathReview: 1 } },
      { ...base, outcome: "timeout", counts: { model: 1, requestTimeout: 1 } },
      { ...base, evidence: "device", ms: { deviceUseful: 78 } },
    ]);
    expect(report).toHaveLength(2);
    const simulated = report.find(r => r.group.evidence === "simulated");
    expect(simulated).toMatchObject({
      turns: 3, outcomes: { completed: 2, timeout: 1 },
      ms: {
        workerReply: { n: 2, p50: 25, p95: 51 },
        workerFiller: { n: 1, p50: 1, p95: 1 },
        deviceUseful: { n: 0, p50: null, p95: null },
      },
      counts: { model: { n: 3, total: 3 }, mathReview: { n: 1, total: 1 }, requestTimeout: { n: 1, total: 1 } },
    });
  });
});

describe("#1139 device turns on one machine clock", () => {
  const group = { evidence: "device", mode: "voice", turnType: "routine", provider: "p", device: "node-loopback", network: "loopback", concurrency: 2 } as const;
  const bursts = [{ start: 900, end: 1500 }, { start: 2300, end: 4100 }, { start: 9000, end: 9400 }];

  it("measures useful output from the answer's playout, not from the filler", () => {
    const turn = deviceTurn({ group, inputEnd: 1000, bursts, answerPlayback: 2280, otherPlayouts: [{ start: 880, end: 1450 }], boardAt: 2600 });
    expect(turn).toMatchObject({ outcome: "completed", ms: { deviceFirstSound: 1300, deviceUseful: 1300, deviceBoard: 1600 } });
    expect(readBaselineTurn(turn)).toEqual(turn);
  });

  it("marks a sound that starts before the answer's playout as ambiguous, never as useful", () => {
    // A filler-only sound from 1,970 to 2,150 ms around an answer mark at 2,000 ms: its part after the mark could be either.
    const turn = deviceTurn({ group, inputEnd: 1000, bursts: [{ start: 1970, end: 2150 }], answerPlayback: 2000, otherPlayouts: [{ start: 1400, end: 1990 }], boardAt: null });
    expect(turn).toMatchObject({ outcome: "ambiguous", ms: { deviceFirstSound: 970 } });
    expect(turn.ms.deviceUseful).toBeUndefined();
    // The same when the filler runs into the answer as one sound.
    expect(deviceTurn({ group, inputEnd: 1000, bursts: [{ start: 1340, end: 5200 }], answerPlayback: 2100, otherPlayouts: [{ start: 1300, end: 2050 }], boardAt: null }).outcome).toBe("ambiguous");
  });

  it("counts a short answer heard just after its playout mark when no other playout can reach it", () => {
    // The filler played from 1,200 to 1,600 ms and was heard from 1,230 ms: transit is at most 30 ms.
    const filler = { start: 1230, end: 1630 };
    const turn = deviceTurn({ group, inputEnd: 1000, bursts: [filler, { start: 2020, end: 2090 }], answerPlayback: 2000, otherPlayouts: [{ start: 1200, end: 1600 }], boardAt: null });
    expect(turn).toMatchObject({ outcome: "completed", ms: { deviceFirstSound: 230, deviceUseful: 1020 } });
    expect(deviceTurn({ group, inputEnd: 1000, bursts: [{ start: 2020, end: 2090 }], answerPlayback: 2000, otherPlayouts: [], boardAt: null }))
      .toMatchObject({ outcome: "completed", ms: { deviceUseful: 1020 } });
  });

  it("marks a sound after the mark as ambiguous when another playout's sound could still be arriving", () => {
    // No onset bounds the transit here, so the filler that ended at 1,990 ms could still be heard at 2,020 ms.
    expect(deviceTurn({ group, inputEnd: 1000, bursts: [{ start: 2020, end: 2090 }], answerPlayback: 2000, otherPlayouts: [{ start: 1400, end: 1990 }], boardAt: null }).outcome).toBe("ambiguous");
  });

  it("bounds the transit per playout, never from a later unrelated playout", () => {
    // The filler played 1,800 to 1,990 ms and was heard 2,015 to 2,180 ms; the answer marked at 2,000 ms was not heard.
    // A later playout heard 20 ms after its start says nothing about how late the filler's sound arrived.
    const turn = deviceTurn({ group, inputEnd: 1000, bursts: [{ start: 2015, end: 2180 }, { start: 2520, end: 3000 }], answerPlayback: 2000,
      otherPlayouts: [{ start: 1800, end: 1990 }, { start: 2500, end: 2900 }], boardAt: null });
    expect(turn.outcome).toBe("ambiguous");
    expect(turn.ms.deviceUseful).toBeUndefined();
  });

  it("matches a sound by its onset, so a second answer merged into it does not make it ambiguous", () => {
    // The first answer played at 2,000 ms and was heard from 2,020 ms; a second answer started at 2,200 ms and the
    // receiver merged both into one sound across the short gap.
    const turn = deviceTurn({ group, inputEnd: 1000, bursts: [{ start: 2020, end: 2600 }], answerPlayback: 2000, otherPlayouts: [{ start: 2200, end: 2560 }], boardAt: null });
    expect(turn).toMatchObject({ outcome: "completed", ms: { deviceUseful: 1020 } });
  });

  it("counts ambiguous turns in the report and keeps them out of the percentiles", () => {
    const rows = [
      deviceTurn({ group, inputEnd: 1000, bursts: [{ start: 1970, end: 2150 }], answerPlayback: 2000, otherPlayouts: [], boardAt: null }),
      deviceTurn({ group, inputEnd: 1000, bursts: [{ start: 2500, end: 3000 }], answerPlayback: 2400, otherPlayouts: [], boardAt: null }),
    ].map(readBaselineTurn);
    expect(baselineReport(rows)[0]).toMatchObject({ turns: 2, outcomes: { completed: 1, ambiguous: 1 }, ms: { deviceUseful: { n: 1, p50: 1500, p95: 1500 } } });
  });

  it("keeps a turn without an answer as a timeout and gives it no useful time", () => {
    const turn = deviceTurn({ group, inputEnd: 5000, bursts, answerPlayback: null, otherPlayouts: [], boardAt: null });
    expect(turn.outcome).toBe("timeout");
    expect(turn.ms).toEqual({ deviceFirstSound: 4000 });
  });

  it("measures the stop from the interruption onset to the end of the sound it cut", () => {
    const turn = deviceTurn({ group, inputEnd: 1000, bursts, answerPlayback: 2280, otherPlayouts: [], boardAt: null, interruptionAt: 3000 });
    expect(turn.ms.deviceInterruptionStop).toBe(1100);
    expect(deviceTurn({ group, inputEnd: 1000, bursts, answerPlayback: 2280, otherPlayouts: [], boardAt: null, interruptionAt: 5000 }).ms.deviceInterruptionStop).toBeUndefined();
  });
});

describe("#1139 planned turns", () => {
  const group = { evidence: "device", mode: "voice", provider: "model+stt+tts", teaching: "existing", device: "d", network: "loopback", concurrency: 1 } as const;
  const planned = ["routine", "complex", "routine"] as const;

  it("records every planned turn once as a failure under the run's own provider when nothing was observed", () => {
    const rows = plannedTurns(group, planned, []);
    expect(rows.map(r => [r.turnType, r.outcome, r.provider])).toEqual([
      ["routine", "failed", "model+stt+tts"], ["complex", "failed", "model+stt+tts"], ["routine", "failed", "model+stt+tts"],
    ]);
    expect(baselineReport(rows).map(g => g.outcomes.failed)).toEqual([2, 1]);
  });

  it("keeps observed turns in place and fills only the turns the call never reached", () => {
    const seen: BaselineTurn = { v: 1, ...group, turnType: "routine", outcome: "completed", ms: { deviceUseful: 2000 }, counts: {} };
    expect(plannedTurns(group, planned, [seen]).map(r => r.outcome)).toEqual(["completed", "failed", "failed"]);
    expect(() => plannedTurns(group, planned, [seen, seen, seen, seen])).toThrow("more observed turns than planned");
  });
});

describe("#1139 complex-explanation budget", () => {
  const cohort = { provider: "p", device: "d", network: "loopback" };
  const row = (ms: number | null, teaching: BaselineTurn["teaching"] = "existing", turnType: BaselineTurn["turnType"] = "complex"): BaselineTurn => ({
    v: 1, evidence: "device", mode: "voice", turnType, provider: "p", teaching, device: "d", network: "loopback", concurrency: 1,
    outcome: ms === null ? "timeout" : "completed", ms: ms === null ? {} : { deviceUseful: ms }, counts: {},
  });

  it("sets the budget from complex device turns of the existing path, rounded up, with failures counted", () => {
    const turns = [2010, 2290, 2550, 3120, 3990, null, 1100].map(ms => row(ms));
    const budget = complexBudget([...turns, row(400, "checked-exchange"), row(300, "existing", "routine")]);
    expect(budget).toEqual({ ok: true, cohort, n: 7, completed: 6, failed: 1, ambiguous: 0, p50Ms: 2300, p95Ms: 4000 });
  });

  it("uses one-call runs only and leaves out rows that never measured useful output", () => {
    const turns = [2010, 2290, 2550, 3120, 3990].map(ms => row(ms));
    const parallel = { ...row(9000), concurrency: 8 };
    const firstSoundOnly: BaselineTurn = { ...row(null), outcome: "completed", ms: { deviceFirstSound: 1100 } };
    expect(complexBudget([...turns, parallel, firstSoundOnly])).toEqual({ ok: true, cohort, n: 5, completed: 5, failed: 0, ambiguous: 0, p50Ms: 2600, p95Ms: 4000 });
  });

  it("keeps a cohort that cannot measure useful output out of the denominator", () => {
    const turns = [2010, 2290, 2550, 3120, 3990].map(ms => row(ms));
    // A hosted call has no answer playout mark: its timeouts and first sounds say nothing about useful output.
    const hosted = (outcome: BaselineTurn["outcome"]): BaselineTurn => ({ ...row(null), outcome, provider: "production", device: "macbook-aside", network: "home-wifi", ms: outcome === "completed" ? { deviceFirstSound: 1100 } : {} });
    expect(complexBudget([...turns, hosted("timeout"), hosted("completed")])).toEqual({ ok: true, cohort, n: 5, completed: 5, failed: 0, ambiguous: 0, p50Ms: 2600, p95Ms: 4000 });
    const other = { provider: "p2", device: "d", network: "loopback" };
    const both = [...turns, ...turns.map(t => ({ ...t, ...other }))];
    expect(complexBudget(both)).toMatchObject({ ok: false, reason: "several cohorts measure useful output; name one" });
    expect(complexBudget([...both, { ...row(null), ...other }], other)).toEqual({ ok: true, cohort: other, n: 6, completed: 5, failed: 1, ambiguous: 0, p50Ms: 2600, p95Ms: 4000 });
    expect(complexBudget([hosted("timeout")])).toMatchObject({ ok: false, reason: "no cohort measures useful output" });
  });

  it("keeps a named cohort even when none of its turns measured useful output", () => {
    const failed = [row(null), row(null), row(null)];
    expect(complexBudget([...failed, ...[2010, 2290].map(ms => ({ ...row(ms), provider: "p2" }))], cohort))
      .toEqual({ ok: false, cohort, n: 3, completed: 0, failed: 3, ambiguous: 0, reason: "needs at least 5 completed complex device turns" });
  });

  it("counts ambiguous turns apart from completed and failed ones", () => {
    const turns = [2010, 2290, 2550, 3120, 3990].map(ms => row(ms));
    const ambiguous: BaselineTurn = { ...row(null), outcome: "ambiguous", ms: { deviceFirstSound: 900 } };
    expect(complexBudget([...turns, ambiguous, row(null)])).toEqual({ ok: true, cohort, n: 7, completed: 5, failed: 1, ambiguous: 1, p50Ms: 2600, p95Ms: 4000 });
  });

  it("refuses a budget from too few completed samples", () => {
    expect(complexBudget([row(2000), row(2100), row(null)])).toEqual({ ok: false, cohort, n: 3, completed: 2, failed: 1, ambiguous: 0, reason: "needs at least 5 completed complex device turns" });
  });
});

describe("#1139 cost report", () => {
  it("adds calls and spend by work, model, effort and basis, and keeps unknown cost apart from zero", () => {
    const base = { v: 1, mode: "voice", teaching: "existing", concurrency: 1 } as const;
    const rows = [
      { ...base, work: "model", model: "anthropic/claude-sonnet-5.5", effort: "low", basis: "provider", calls: 1, usd: 0.02 },
      { ...base, work: "model", model: "anthropic/claude-sonnet-5.5", effort: "low", basis: "provider", calls: 2, usd: 0.0125 },
      { ...base, work: "review", model: "anthropic/claude-haiku-5.5", effort: "unknown", basis: "unknown", calls: 1, usd: null },
      { ...base, work: "review", model: "anthropic/claude-haiku-5.5", effort: "unknown", basis: "provider", calls: 1, usd: 0 },
      { ...base, work: "stt", model: "assemblyai/universal-3-6-pro", effort: "none", basis: "estimate", calls: 1, usd: 0.005, quantity: { unit: "minutes", value: 0.5 } },
    ].map(readBaselineCost);
    expect(baselineCostReport(rows)).toEqual([
      { mode: "voice", teaching: "existing", concurrency: 1, work: "model", model: "anthropic/claude-sonnet-5.5", effort: "low", basis: "provider", calls: 3, usd: 0.0325 },
      { mode: "voice", teaching: "existing", concurrency: 1, work: "review", model: "anthropic/claude-haiku-5.5", effort: "unknown", basis: "unknown", calls: 1, usd: null },
      { mode: "voice", teaching: "existing", concurrency: 1, work: "review", model: "anthropic/claude-haiku-5.5", effort: "unknown", basis: "provider", calls: 1, usd: 0 },
      { mode: "voice", teaching: "existing", concurrency: 1, work: "stt", model: "assemblyai/universal-3-6-pro", effort: "none", basis: "estimate", calls: 1, usd: 0.005, quantity: { unit: "minutes", value: 0.5 } },
    ]);
    expect(() => readBaselineCost({ ...rows[0], basis: "guess" })).toThrow("Invalid Maya baseline cost");
  });

  const base = { v: 1, mode: "voice", teaching: "existing", concurrency: 1 } as const;
  it("keeps each receipt's request role and the effort it asked for", () => {
    const receipt = { feature: "maya", model: "anthropic/claude-sonnet-5.5", cost_usd: 0.01, cost_basis: "provider" as const, calls: 1 };
    expect(receiptCost({ ...receipt, role: "repair", effort: "low" }, base)).toMatchObject({ work: "repair", effort: "low" });
    expect(receiptCost({ ...receipt, role: "prepared_expected", effort: "low" }, base)).toMatchObject({ work: "model" });
    expect(receiptCost({ ...receipt, feature: "maya_review", role: "review", effort: "medium" }, base)).toMatchObject({ work: "review", effort: "medium" });
    // A receipt from before the role was recorded: its feature decides, and the effort is not invented.
    expect(receiptCost(receipt, base)).toMatchObject({ work: "model", effort: "unknown", basis: "provider", usd: 0.01 });
    expect(receiptCost({ ...receipt, cost_usd: null }, base)).toMatchObject({ basis: "unknown", usd: null });
  });

  it("reads the effort from the request body", () => {
    expect(requestEffort(JSON.stringify({ model: "m", reasoning: { effort: "minimal", exclude: true } }))).toBe("minimal");
    expect(requestEffort(JSON.stringify({ model: "m" }))).toBe("none");
    expect(requestEffort("not json")).toBe("unknown");
    expect(requestEffort(undefined)).toBe("unknown");
  });

  it("names the speech providers that the run resolved", () => {
    const rows = speechCosts(base, { stt: { provider: "assemblyai", model: "universal-3-6-pro" }, tts: { provider: "inworld", model: "inworld-tts-2" } }, 2.5, { stt: 0.02, tts: 0.03 });
    expect(rows.map(r => [r.work, r.model, r.basis, r.usd])).toEqual([
      ["stt", "assemblyai/universal-3-6-pro", "estimate", 0.02], ["tts", "inworld/inworld-tts-2", "estimate", 0.03], ["transport", "livekit-server-dev", "unknown", null],
    ]);
    expect(speechCosts(base, { stt: { provider: "inference", model: "assemblyai/universal-3-6-pro" }, tts: { provider: "inference", model: "cartesia/sonic-3.6" } }, 1, null)
      .map(r => [r.model, r.basis])).toEqual([["inference/assemblyai/universal-3-6-pro", "unknown"], ["inference/cartesia/sonic-3.6", "unknown"], ["livekit-server-dev", "unknown"]]);
    rows.forEach(r => readBaselineCost(r));
  });
});

describe("#1139 run environment", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("strips the hosted database settings and the agent name override before the worker starts", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    vi.stubEnv("SUPABASE_URL", "https://db.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example");
    vi.stubEnv("LIVEKIT_AGENT_NAME_OVERRIDE", "maya-voice");
    vi.stubEnv("MAYA_STT", "fake");
    const options = () => new ServerOptions({ agent: "agent.mjs", agentName: "maya-baseline" });
    // The pinned SDK lets the override win over the name the runner gives.
    expect(options().agentName).toBe("maya-voice");
    expect(() => baselineAgentName(options(), "maya-baseline")).toThrow("maya-voice");
    expect(prepareBaselineEnv(process.env)).toEqual(expect.arrayContaining(["LIVEKIT_AGENT_NAME_OVERRIDE", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_URL"]));
    expect(Object.keys(process.env).filter(k => k.includes("SUPABASE"))).toEqual([]);
    expect(process.env.MAYA_STT).toBe("fake");
    expect(baselineAgentName(options(), "maya-baseline")).toBe("maya-baseline");
  });
});
