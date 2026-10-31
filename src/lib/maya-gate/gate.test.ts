import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ACTS, INTERRUPTS, MAIN_STATES, type Act, type SessionState } from "@/lib/maya";
import { BEHAVIOURS, PENDING } from "./behaviours";
import { fixtureProblems } from "./fixtures";
import { HARD_FAILURES, judge, memoryTraceStore, runBehaviour, type Verdict } from "./gate";

// The scripted behaviour gate (#324): every behaviour of the teaching research runs through Maya's text adapter with a
// scripted fake model; each run saves its trace and every check and count is read back from the saved trace. Any hard
// failure (HARD_FAILURES, docs/maya-gate.md) fails this file. No network; the clock and seed are passed in.
// MAYA_GATE_TRACES=<dir> also writes each saved trace there, to read.

const store = memoryTraceStore();
const verdicts = new Map<string, Verdict>();
const errors = new Map<string, unknown>();
let ms = 0;

beforeAll(async () => {
  const t0 = performance.now();
  for (const b of BEHAVIOURS) errors.set(b.id, (await runBehaviour(b, store)).error);
  for (const b of BEHAVIOURS) verdicts.set(b.id, judge(b, store.load(b.id)));
  ms = performance.now() - t0;
  const dir = process.env.MAYA_GATE_TRACES;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    for (const id of store.ids()) writeFileSync(join(dir, `${id}.json`), store.load(id)!);
  }
});

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
    expect(store.ids().sort()).toEqual(BEHAVIOURS.map((b) => b.id).sort());
    const saved = store.ids().map((id) => JSON.parse(store.load(id)!) as { outcome: unknown; callId: string });
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
    // READY is before the first Maya turn; REPAIR_MAYA needs what Maya said (pending V2).
    const unreachable: SessionState[] = ["READY", "REPAIR_MAYA"];
    for (const s of [...MAIN_STATES, ...INTERRUPTS].filter((x) => !unreachable.includes(x))) expect(states.has(s), s).toBe(true);
    // "repair" answers REPAIR_MAYA (pending V2).
    const acts = new Set<Act | null>(all.flatMap((v) => v.acts));
    for (const a of ACTS.filter((x) => x !== "repair")) expect(acts.has(a), a).toBe(true);
    const kinds = new Set(all.flatMap((v) => v.trace!.turns.map((t) => (t.kind === "writing" ? `writing:${t.status}` : t.kind))));
    for (const k of ["start", "child", "tick", "writing:started", "writing:done", "technical", "maya"]) expect(kinds.has(k), k).toBe(true);
    const reasons = new Set(all.map((v) => v.trace!.outcome!.reason));
    expect([...reasons].sort()).toEqual(["child_stopped", "content_issue", "no_response", "safety", "solved", "technical_issue", "time_limit"]);
    const sources = new Set(all.flatMap((v) => v.trace!.turns.flatMap((t) => (t.kind === "maya" ? t.attempts.map((a) => a.source) : []))));
    expect([...sources].sort()).toEqual(["fallback", "model", "repair"]);
  });

  it("totals the counts from the saved traces", () => {
    const total = (k: keyof NonNullable<Verdict["counts"]>) => [...verdicts.values()].reduce((n, v) => n + (v.counts?.[k] ?? 0), 0);
    expect(total("outputs")).toBeGreaterThan(150);
    expect(total("refusals")).toBeGreaterThanOrEqual(15);
    expect(total("fallbacks")).toBeGreaterThanOrEqual(2);
    expect(total("boardBatches")).toBeGreaterThanOrEqual(2);
    expect(total("safetyMessages")).toBe(BEHAVIOURS.filter((b) => b.expect.safety).length);
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
