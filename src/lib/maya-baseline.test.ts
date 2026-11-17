import { describe, expect, it } from "vitest";
import { baselineReport, type BaselineTurn } from "./maya-baseline";

describe("#1139 baseline report", () => {
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
