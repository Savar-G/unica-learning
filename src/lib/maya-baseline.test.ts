import { describe, expect, it } from "vitest";
import { baselineCostReport, baselineReport, complexBudget, readBaselineCost, deviceTurn, readBaselineTurn, type BaselineTurn } from "./maya-baseline";

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
    const turn = deviceTurn({ group, inputEnd: 1000, bursts, answerPlayback: 2280, boardAt: 2600 });
    expect(turn).toMatchObject({ outcome: "completed", ms: { deviceFirstSound: 1300, deviceUseful: 1300, deviceBoard: 1600 } });
    expect(readBaselineTurn(turn)).toEqual(turn);
  });

  it("keeps a turn without an answer as a timeout and gives it no useful time", () => {
    const turn = deviceTurn({ group, inputEnd: 5000, bursts, answerPlayback: null, boardAt: null });
    expect(turn.outcome).toBe("timeout");
    expect(turn.ms).toEqual({ deviceFirstSound: 4000 });
  });

  it("measures the stop from the interruption onset to the end of the sound it cut", () => {
    const turn = deviceTurn({ group, inputEnd: 1000, bursts, answerPlayback: 2280, boardAt: null, interruptionAt: 3000 });
    expect(turn.ms.deviceInterruptionStop).toBe(1100);
    expect(deviceTurn({ group, inputEnd: 1000, bursts, answerPlayback: 2280, boardAt: null, interruptionAt: 5000 }).ms.deviceInterruptionStop).toBeUndefined();
  });
});

describe("#1139 complex-explanation budget", () => {
  const row = (ms: number | null, teaching: BaselineTurn["teaching"] = "existing", turnType: BaselineTurn["turnType"] = "complex"): BaselineTurn => ({
    v: 1, evidence: "device", mode: "voice", turnType, provider: "p", teaching, device: "d", network: "loopback", concurrency: 1,
    outcome: ms === null ? "timeout" : "completed", ms: ms === null ? {} : { deviceUseful: ms }, counts: {},
  });

  it("sets the budget from complex device turns of the existing path, rounded up, with failures counted", () => {
    const turns = [2010, 2290, 2550, 3120, 3990, null, 1100].map(ms => row(ms));
    const budget = complexBudget([...turns, row(400, "checked-exchange"), row(300, "existing", "routine")]);
    expect(budget).toEqual({ ok: true, n: 7, completed: 6, failed: 1, p50Ms: 2300, p95Ms: 4000 });
  });

  it("uses one-call runs only and leaves out rows that never measured useful output", () => {
    const turns = [2010, 2290, 2550, 3120, 3990].map(ms => row(ms));
    const parallel = { ...row(9000), concurrency: 8 };
    const firstSoundOnly: BaselineTurn = { ...row(null), outcome: "completed", ms: { deviceFirstSound: 1100 } };
    expect(complexBudget([...turns, parallel, firstSoundOnly])).toEqual({ ok: true, n: 5, completed: 5, failed: 0, p50Ms: 2600, p95Ms: 4000 });
  });

  it("refuses a budget from too few completed samples", () => {
    expect(complexBudget([row(2000), row(2100), row(null)])).toEqual({ ok: false, n: 3, completed: 2, failed: 1, reason: "needs at least 5 completed complex device turns" });
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
});
