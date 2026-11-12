import { describe, expect, it } from "vitest";
import { HEALTH_KEYS, healthMeasures, healthSummary, readHealthRows, type HealthRow } from "@/lib/admin-health";

const NOW = new Date("2026-11-12T12:00:00Z");
const row = (key: HealthRow["key"], o: Partial<HealthRow> = {}): HealthRow => ({ key, n7: 0, d7: 0, n30: 0, d30: 0, at: null, ...o });
const get = (rows: HealthRow[], key: HealthRow["key"]) => healthMeasures(rows, NOW).find((m) => m.key === key)!;

describe("What to fix: the measures", () => {
  it("lists every measure, even with no rows", () => {
    expect(healthMeasures([], NOW).map((m) => m.key).sort()).toEqual([...HEALTH_KEYS].sort());
    expect(get([], "runs_failed").tone).toBe("muted");
  });

  it("calls a high rate of the last 7 days bad, and a low one worth a look", () => {
    expect(get([row("runs_failed", { n7: 3, d7: 5, n30: 3, d30: 5 })], "runs_failed")).toMatchObject({ tone: "bad", rate7: 60, text7: "3 of 5 runs" });
    expect(get([row("email_failed", { n7: 1, d7: 100, n30: 2, d30: 400 })], "email_failed").tone).toBe("warn");
    expect(get([row("email_failed", { n7: 0, d7: 20, n30: 0, d30: 80 })], "email_failed").tone).toBe("ok");
  });

  it("shows no rate and never calls it bad below 5 counted", () => {
    const m = get([row("photo_refused", { n7: 2, d7: 3, n30: 2, d30: 3 })], "photo_refused");
    expect(m.rate7).toBeNull();
    expect(m.tone).toBe("warn");
  });

  it("calls it bad when 3 or more were counted in 7 days and every one failed, even below 5 counted", () => {
    expect(get([row("runs_failed", { n7: 4, d7: 4, n30: 4, d30: 4 })], "runs_failed")).toMatchObject({ tone: "bad", rate7: null });
    expect(get([row("runs_failed", { n7: 2, d7: 2, n30: 2, d30: 2 })], "runs_failed").tone).toBe("warn");
    expect(get([row("runs_failed", { n7: 3, d7: 4, n30: 3, d30: 4 })], "runs_failed").tone).toBe("warn");
  });

  it("calls any safety flag or missing report of the last 7 days bad", () => {
    expect(get([row("maya_flagged", { n7: 1, d7: 40, n30: 1, d30: 40 })], "maya_flagged").tone).toBe("bad");
    expect(get([row("report_missing", { n7: 0, d7: 4, n30: 1, d30: 10 })], "report_missing").tone).toBe("warn");
  });

  it("judges what waits by the age of the oldest, and shows no rate", () => {
    const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
    expect(get([row("marking_waiting", { n7: 2, d7: 30, n30: 2, d30: 30, at: at(1) })], "marking_waiting")).toMatchObject({ tone: "ok", rate7: null, text7: "2 waiting" });
    expect(get([row("marking_waiting", { n7: 2, d7: 30, n30: 2, d30: 30, at: at(20) })], "marking_waiting").tone).toBe("warn");
    expect(get([row("marking_waiting", { n7: 2, d7: 30, n30: 2, d30: 30, at: at(60) })], "marking_waiting").tone).toBe("bad");
    expect(get([row("feedback_new", { n7: 1, d7: 1, n30: 1, d30: 1, at: at(24 * 8) })], "feedback_new").tone).toBe("bad");
  });

  it("sorts the worst first: bad, then warn, then ok, then nothing; inside a tone by the 7 day rate", () => {
    const rows = [
      row("runs_failed", { n7: 1, d7: 10, n30: 1, d30: 10 }),
      row("gate_flags", { n7: 9, d7: 10, n30: 9, d30: 10 }),
      row("photo_refused", { n7: 4, d7: 10, n30: 4, d30: 10 }),
      row("email_failed", { n7: 0, d7: 30, n30: 0, d30: 30 }),
    ];
    const order = healthMeasures(rows, NOW).map((m) => m.key);
    expect(order.slice(0, 3)).toEqual(["gate_flags", "photo_refused", "runs_failed"]);
    const tones = healthMeasures(rows, NOW).map((m) => m.tone);
    expect(tones.indexOf("ok")).toBeLessThan(tones.indexOf("muted"));
    expect(order.indexOf("email_failed")).toBeLessThan(order.indexOf("fit_failed"));
  });

  it("summarizes the counts of bad and warn, and the oldest waiting answer", () => {
    const old = "2026-11-10T00:00:00Z";
    const s = healthSummary(healthMeasures([row("maya_flagged", { n7: 1, d7: 3, n30: 1, d30: 3 }), row("marking_waiting", { n7: 1, d7: 3, n30: 1, d30: 3, at: old })], NOW));
    expect(s).toEqual({ bad: 2, warn: 0, oldestWaiting: old });
    expect(healthSummary(healthMeasures([], NOW)).oldestWaiting).toBeNull();
  });

  it("reads database rows with bigint as text and leaves out an unknown key", () => {
    expect(readHealthRows([{ key: "runs_failed", n7: "3", d7: 5, n30: 3, d30: "5", at: null }, { key: "other", n7: 1, d7: 1, n30: 1, d30: 1, at: null }])).toEqual([row("runs_failed", { n7: 3, d7: 5, n30: 3, d30: 5 })]);
  });
});
