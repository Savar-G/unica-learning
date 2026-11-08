import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ACTS, INTERRUPTS, MAIN_STATES, type Act, type SessionState } from "@/lib/maya";
import { BEHAVIOURS, PENDING } from "./behaviours";
import { fixtureProblems } from "./fixtures";
import { judgeSaved, runGateBehaviour } from "./call";
import { callKey, flagLevelsOf, HARD_FAILURES, memoryTraceStore, runsOnCall, type SavedCall, type Verdict } from "./gate";

vi.mock("server-only", () => ({}));

// The scripted behaviour gate (#324): every behaviour of the teaching research runs through Maya's text adapter with a
// scripted fake model; each run saves its trace and every check and count is read back from the saved trace. Any hard
// failure (HARD_FAILURES, docs/maya-gate.md) fails this file. The safety behaviours run through the saved call, with the
// in-memory alert ledger and mail transport (#395). No network and no email; the clock and seed are passed in.
// MAYA_GATE_TRACES=<dir> also writes each saved trace there, to read.

const store = memoryTraceStore();
const verdicts = new Map<string, Verdict>();
const errors = new Map<string, unknown>();
let ms = 0;

beforeAll(async () => {
  const t0 = performance.now();
  for (const b of BEHAVIOURS) errors.set(b.id, (await runGateBehaviour(b, store)).error);
  for (const b of BEHAVIOURS) verdicts.set(b.id, judgeSaved(b, store));
  ms = performance.now() - t0;
  const dir = process.env.MAYA_GATE_TRACES;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    for (const id of store.ids()) writeFileSync(join(dir, `${id}.json`), store.load(id)!);
  }
  // Every behaviour runs here, once: a fixed amount of work that takes more than the default 10 s on a busy machine.
}, 120_000);

const RESEARCH_IDS = Array.from({ length: 40 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`);
const baseId = (id: string) => id.replace(/[a-z]$/, "");

describe("the behaviour gate", () => {
  it("runs on checked fixtures: A to F pass the package check, the bad key does not", () => {
    expect(fixtureProblems()).toEqual([]);
  });

  it.each(BEHAVIOURS.map((b) => [b.id, b.title] as const))("%s: %s", (id) => {
    expect(errors.get(id) ?? null).toBeNull();
    const v = verdicts.get(id)!;
    expect(v.failures, JSON.stringify(v.failures, null, 2)).toEqual([]);
  });

  it("saves one trace per run and counts the runs from the saved traces", () => {
    const traces = store.ids().filter((id) => !id.endsWith(".call"));
    expect(traces.sort()).toEqual(BEHAVIOURS.map((b) => b.id).sort());
    const saved = traces.map((id) => JSON.parse(store.load(id)!) as { outcome: unknown; callId: string });
    expect(saved.every((t) => t.outcome !== null)).toBe(true);
    expect(new Set(saved.map((t) => t.callId)).size).toBe(BEHAVIOURS.length);
  });

  it("accounts for every research behaviour: run, or pending with a reason; never both, never dropped", () => {
    const run = new Set(BEHAVIOURS.map((b) => baseId(b.id)).filter((id) => RESEARCH_IDS.includes(id)));
    const pending = new Set(PENDING.map((p) => p.id).filter((id) => RESEARCH_IDS.includes(id)));
    for (const id of RESEARCH_IDS) expect(run.has(id) !== pending.has(id), id).toBe(true);
    expect(new Set(BEHAVIOURS.map((b) => b.id)).size).toBe(BEHAVIOURS.length);
    for (const p of PENDING) expect(p.reason.length).toBeGreaterThan(20);
    for (const b of BEHAVIOURS) expect(b.status === "partial", b.id).toBe(Boolean(b.pending));
  });

  it("covers every branch of the controller the text adapter can reach: states, acts and timed events", () => {
    const all = [...verdicts.values()];
    const states = new Set<SessionState>(all.flatMap((v) => v.states));
    // READY is before the first Maya turn.
    const unreachable: SessionState[] = ["READY"];
    for (const s of [...MAIN_STATES, ...INTERRUPTS].filter((x) => !unreachable.includes(x))) expect(states.has(s), s).toBe(true);
    const acts = new Set<Act | null>(all.flatMap((v) => v.acts));
    for (const a of ACTS) expect(acts.has(a), a).toBe(true);
    const kinds = new Set(all.flatMap((v) => v.trace!.turns.map((t) => (t.kind === "writing" ? `writing:${t.status}` : t.kind))));
    for (const k of ["start", "child", "tick", "writing:started", "writing:done", "technical", "maya", "partial", "maya_said", "content_problem"]) expect(kinds.has(k), k).toBe(true);
    const reasons = new Set(all.map((v) => v.trace!.outcome!.reason));
    expect([...reasons].sort()).toEqual(["child_stopped", "content_issue", "no_response", "safety", "solved", "technical_issue", "time_limit"]);
    const sources = new Set(all.flatMap((v) => v.trace!.turns.flatMap((t) => (t.kind === "maya" ? t.attempts.map((a) => a.source) : []))));
    expect([...sources].sort()).toEqual(["controller", "fallback", "model", "repair"]);
  });

  it("records the voice agent's inputs in the saved trace (#396), with whether each stopped Maya's output", () => {
    const inputs = (id: string) => verdicts.get(id)!.trace!.turns.flatMap((t, i, all) =>
      t.kind === "partial" || t.kind === "maya_said" || t.kind === "content_problem" ? [{ kind: t.kind, cancelled: t.cancelled, before: all[i - 1]?.kind === "maya" ? all[i - 1] : null }] : []);
    expect(inputs("C15").map(({ kind, cancelled }) => [kind, cancelled])).toEqual([["partial", true]]);
    expect(inputs("V2").map(({ kind, cancelled }) => [kind, cancelled])).toEqual([["maya_said", true]]);
    expect(inputs("V2b").map(({ kind, cancelled }) => [kind, cancelled])).toEqual([["maya_said", false]]);
    expect(inputs("V3").map(({ kind, cancelled }) => [kind, cancelled])).toEqual([["content_problem", true]]);
    // V3b: the problem arrives during the safety proposal. Receipt precedes delivery.
    const [held] = inputs("V3b");
    expect(held).toMatchObject({ kind: "content_problem", cancelled: true });
    const trace = verdicts.get("V3b")!.trace!;
    const receipt = trace.turns.findIndex((t) => t.kind === "content_problem");
    expect(trace.turns.slice(receipt + 1).flatMap((t) => t.kind === "maya" && t.output ? [t.output.act] : [])).toEqual(["safety", "close"]);
    expect(verdicts.get("V2")!.states).toContain("REPAIR_MAYA");
    expect(verdicts.get("V3")!.states).toContain("CONTENT_HOLD");
  });

  it("totals the counts from the saved traces", () => {
    const total = (k: keyof NonNullable<Verdict["counts"]>) => [...verdicts.values()].reduce((n, v) => n + (v.counts?.[k] ?? 0), 0);
    expect(total("outputs")).toBeGreaterThan(150);
    expect(total("refusals")).toBeGreaterThanOrEqual(15);
    expect(total("fallbacks")).toBeGreaterThanOrEqual(2);
    expect(total("boardBatches")).toBeGreaterThanOrEqual(2);
    expect(total("safetyMessages")).toBe(BEHAVIOURS.filter((b) => b.expect.safety).length);
  });

  it("runs every flagged call through the saved call, with one alert for its flag (#395)", () => {
    for (const b of BEHAVIOURS) {
      const levels = flagLevelsOf(verdicts.get(b.id)!.trace!);
      // A run that raises a flag must be a call run, so its alert is judged; a disclosure expects a safety flag.
      // V3b injects content during a provider call. The call API has no content event.
      // Its text policy is checked here; C30 checks the same concern alert through the call API.
      if (levels.length > 0 && b.id !== "V3b") expect(runsOnCall(b), b.id).toBe(true);
      if (b.expect.safety && b.id !== "V3b") expect(b.expect.flag, b.id).toMatch(/^safety_/);
      if (!runsOnCall(b)) continue;
      const call = JSON.parse(store.load(callKey(b.id))!) as SavedCall;
      expect(call.flag?.level, b.id).toBe(levels.at(-1));
      expect(call.next.filter((a) => a.level === call.flag!.level), b.id).toHaveLength(1);
    }
    expect(BEHAVIOURS.filter(runsOnCall).map((b) => b.id)).toEqual(expect.arrayContaining(["C29", "C29b", "C30", "C31", "C32", "C33", "V1", "V1b"]));
  });

  it("runs fast enough for npm test", () => {
    expect(ms).toBeLessThan(30_000);
  });

  it("keeps docs/maya-gate.md in step: every hard failure, behaviour and pending item, with its status", () => {
    const doc = readFileSync(join(process.cwd(), "docs/maya-gate.md"), "utf8");
    for (const code of Object.keys(HARD_FAILURES)) expect(doc, code).toContain(`\`${code}\``);
    for (const b of BEHAVIOURS) expect(doc, b.id).toMatch(new RegExp(`^\\| ${b.id} \\| ${b.fixture === "A_BAD_KEY" ? "A \\(bad key\\)" : b.fixture} \\| ${b.status} \\|`, "m"));
    for (const p of PENDING) expect(doc, p.id).toMatch(new RegExp(`^\\| ${p.id} \\| pending \\|`, "m"));
  });
});
