import { describe, expect, it } from "vitest";
import { SAFETY_GUIDANCE } from "@/lib/maya";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, type SavedTextSession, type TextOutput, type TextSession } from "@/lib/maya-text";
import { checkTrace, traceCounts, type MayaTrace, type TraceObligation } from "@/lib/maya-trace";

const T0 = Date.UTC(2026, 10, 1);
const pkg = SAMPLE_PACKAGES["add-27-39"];
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const safety = (severity: "concern" | "immediate") => ({ version: 2, act: "safety", parts: [], reading: { safety: severity } });
const close = { version: 2, act: "close", parts: [{ warm: "closing" }] };
const accept = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [{ value: { type: "number", value: 66 }, step: "result", verdict: "right" }] } };

// Expected work comes only from the test's input schedule and the provider readings it supplies.
// No obligation, state transition, allowed act, fallback or controller helper creates an expectation.
type Input = { kind: "start" | "child" | "partial" | "repair" | "content" | "technical" | "stop"; text?: string; at?: number } | { kind: "safety"; severity: "concern" | "immediate"; at?: number };
class InputOracle {
  inputs: Input[] = [];
  add(input: Input) { this.inputs.push(input); }
  assert(trace: MayaTrace, settled = true) {
    const expected: { kind: TraceObligation["kind"]; text?: string; inputIndex?: number }[] = [];
    for (const [inputIndex, input] of this.inputs.entries()) {
      if (input.kind === "start" && !expected.length) expected.push({ kind: "start_pending" }, { kind: "opening_due" });
      if (input.kind === "child") expected.push({ kind: "child_turn_pending", text: input.text, inputIndex });
      if (input.kind === "repair") expected.push({ kind: "repair_due", text: input.text, inputIndex });
      if (input.kind === "content") expected.push({ kind: "content_problem", text: input.text, inputIndex });
    }
    const readings = this.inputs.filter((i) => i.kind === "safety");
    if (readings.length) expected.push({ kind: "safety_due" });
    const ledger = trace.obligations ?? [];
    let speaking = false, content = false, repair = false, guidance = false;
    let closeSeen = false;
    const safetyOutputs: string[] = [];
    for (const t of trace.turns) {
      if (t.kind === "partial") speaking = true;
      if (t.kind === "child") speaking = false;
      if (t.kind === "content_problem") content = true;
      if (t.kind === "maya_said" && t.cancelled) repair = true;
      if (t.kind !== "maya" || !t.output) continue;
      const act = t.output.act;
      const priorityReading = this.inputs.some((i) => (i.kind === "safety" || i.kind === "stop") && i.at !== undefined && t.at >= i.at);
      if (priorityReading) expect(["safety", "close"], "teaching after priority reading").toContain(act);
      expect(closeSeen, "response after close").toBe(false);
      if (speaking) expect(["safety", "close"].includes(act) && (content || readings.length > 0), "speech after cancel before complete turn").toBe(true);
      if (guidance) expect(["safety", "close"]).toContain(act);
      if (content) expect(["safety", "close"]).toContain(act);
      if (repair) { expect(["repair", "safety", "close"]).toContain(act); if (act === "repair") repair = false; }
      if (act === "safety") { safetyOutputs.push(...t.output.say); guidance = true; }
      if (act === "close") { if (readings.length) expect(guidance, "close before safety guidance").toBe(true); closeSeen = true; }
    }
    if (readings.length && settled) {
      const severe = readings.some((i) => i.severity === "immediate") ? "immediate" : "concern";
      expect(safetyOutputs).toEqual([SAFETY_GUIDANCE[severe]]);
    }
    expect(ledger, "unexpected or missing obligations").toHaveLength(expected.length);
    let childCursor = -1;
    for (const item of expected) {
      let childInput = -1;
      if (item.kind === "child_turn_pending") {
        childInput = trace.turns.findIndex((t, i) => i > childCursor && t.kind === "child" && t.text === item.text);
        expect(childInput, "missing child input").toBeGreaterThan(childCursor);
        childCursor = childInput;
      }
      const matches = ledger.filter((o) => o.kind === item.kind && (item.text === undefined || o.text === item.text));
      expect(matches.length, `missing or duplicate ${JSON.stringify(item)}`).toBe(1);
      const o = matches[0];
      if (o.status === "dropped") {
        const laterChild = item.kind === "child_turn_pending" && this.inputs.some((i, index) => i.kind === "child" && i.text === item.text && this.inputs.slice(index + 1).some((x) => x.kind === "child"));
        const priority = this.inputs.slice((item.inputIndex ?? -1) + 1).some((i) => ["content", "technical", "stop", "safety"].includes(i.kind));
        const partial = trace.turns.slice(childInput + 1).some((t) => t.kind === "partial");
        const valid = o.reason === "replaced by the next complete transcript" ? laterChild :
          o.reason === "cancelled by partial transcript" ? partial && item.kind === "child_turn_pending" :
          o.reason === "superseded by priority input" || o.reason === "superseded by safety" ? priority && item.kind !== "safety_due" :
          o.reason?.startsWith("call ended: ") ? trace.outcome !== null && item.kind !== "safety_due" && o.reason === `call ended: ${trace.outcome.reason}` : false;
        expect(valid, `invalid drop ${JSON.stringify(o)}`).toBe(true);
      } else if (settled) expect(o.status, `unserved ${JSON.stringify(item)}`).toBe("served");
      if (o.status === "served") {
        if (item.kind === "child_turn_pending") expect(o.servedBy!, "response must follow its child input").toBeGreaterThan(childInput);
        const delivered = trace.turns[o.servedBy!];
        expect(delivered).toBeDefined();
        if (item.kind === "start_pending") expect(delivered.kind).toBe("start");
        else {
          expect(delivered.kind).toBe("maya");
          if (delivered.kind === "maya") {
            expect(delivered.output).not.toBeNull();
            const act = delivered.output!.act;
            if (item.kind === "child_turn_pending") expect(["open", "repair", "safety"]).not.toContain(act);
            if (item.kind === "opening_due") expect(act).toBe("open");
            if (item.kind === "repair_due") expect(act).toBe("repair");
            if (item.kind === "safety_due") expect(act).toBe("safety");
            if (item.kind === "content_problem") expect(act).toBe("close");
          }
        }
        expect(ledger.filter((x) => x.kind === item.kind && x.status === "served" && x.servedBy === o.servedBy)).toHaveLength(1);
      }
    }
    const deliveries = trace.turns.flatMap((t) => t.kind === "maya" && t.output ? [t.output.act] : []);
    expect(deliveries.filter((a) => a === "open")).toHaveLength(ledger.some((o) => o.kind === "opening_due" && o.status === "served") ? 1 : 0);
    expect(deliveries.filter((a) => a === "repair")).toHaveLength(ledger.filter((o) => o.kind === "repair_due" && o.status === "served").length);
  }
}

async function goodTrace() {
  const base = ruleMayaModel();
  let active = false;
  const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => active && args[0].state !== "SAFETY" ? safety("immediate") : base.propose(...args) };
  const s = createTextSession({ callId: "oracle", package: pkg, model, clock: () => T0 });
  await s.start(); active = true; await s.child("Someone hurts me.");
  const oracle = new InputOracle();
  oracle.add({ kind: "start" }); oracle.add({ kind: "child", text: "Someone hurts me." }); oracle.add({ kind: "safety", severity: "immediate" });
  return { trace: json(s.trace()), oracle };
}
describe("R424-16: independent oracle rejects all five invalid cases", () => {
  it("R424-16: rejects an earlier check-in as service of a later child", async () => {
    let now = T0;
    const s = createTextSession({ callId: "causal-oracle", package: pkg, model: ruleMayaModel(), clock: () => now });
    await s.start(); now += 20000; await s.tick(); await s.child("56.");
    const trace = json(s.trace()), oracle = new InputOracle();
    oracle.add({ kind: "start" }); oracle.add({ kind: "child", text: "56." }); oracle.assert(trace);
    const ci = trace.turns.findIndex((t) => t.kind === "child");
    trace.turns = trace.turns.slice(0, ci + 1); trace.board = [];
    trace.obligations!.find((o) => o.kind === "child_turn_pending")!.servedBy = trace.turns.findIndex((t) => t.kind === "maya" && t.output?.act === "check_in");
    expect(() => oracle.assert(trace)).toThrow();
  });
  it.each(["missing child", "invalid drop", "teaching after partial", "duplicate safety", "close before safety"])("rejects %s", async (mutation) => {
    const { trace, oracle } = await goodTrace();
    oracle.assert(trace);
    const child = trace.obligations!.find((o) => o.kind === "child_turn_pending")!;
    const guide = trace.turns.find((t) => t.kind === "maya" && t.output?.act === "open")!;
    const safetyTurn = trace.turns.find((t) => t.kind === "maya" && t.output?.act === "safety")!;
    if (mutation === "missing child") trace.obligations = trace.obligations!.filter((o) => o !== child);
    if (mutation === "invalid drop") { child.status = "dropped"; child.reason = "bug"; delete child.servedBy; }
    if (mutation === "teaching after partial") trace.turns.splice(2, 0, { kind: "partial", at: T0, text: "Wait", cancelled: true }, { ...json(guide), ...{ kind: "maya", output: { act: "guide", say: ["A hint"], board: [] } } } as never);
    if (mutation === "duplicate safety") trace.turns.splice(trace.turns.indexOf(safetyTurn) + 1, 0, json(safetyTurn));
    if (mutation === "close before safety") {
      const end = trace.turns.find((t) => t.kind === "maya" && t.output?.act === "close")!;
      trace.turns.splice(trace.turns.indexOf(safetyTurn), 0, json(end));
    }
    expect(() => oracle.assert(trace)).toThrow();
  });
});

function folded(saved: SavedTextSession) {
  const cache = json(saved);
  delete cache.initial; delete cache.log; delete cache.checkpoint; delete cache.nextRequestId;
  return cache;
}
// Five additional schedule families target continuation at receipt and delivery boundaries.
async function round7Seed(seed: number, counts: Map<string, number>) {
  const hit = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  const base = ruleMayaModel(), oracle = new InputOracle();
  let now = T0, held = false, calls = 0;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<unknown>();
  const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
    if (held) { calls++; entered.resolve(); return release.promise; }
    return base.propose(...args);
  } };
  const opts = { callId: `round7-${seed}`, package: pkg, random: seed, clock: () => now, model };
  let s = createTextSession(opts);
  oracle.add({ kind: "start" });
  const scenario = seed % 5;
  const opening = s.start();
  if (scenario === 1) {
    let intervention: Promise<TextOutput> | undefined;
    for (let i = 0; i < 200; i++) { await Promise.resolve(); if (s.session.opened) { intervention = s.partial("Wait"); break; } }
    expect(intervention).toBeDefined(); await intervention; await opening;
    oracle.add({ kind: "partial" });
    s = createTextSession({ ...opts, resume: json(await s.saved()) });
    expect((await s.tick()).say).toEqual([]);
    oracle.assert(s.trace(), false);
    oracle.add({ kind: "child", text: "66." }); await s.child("66.");
    expect(s.session.solved).toBe("child"); oracle.assert(s.trace()); hit("R424-19");
  } else {
    const out = await opening;
    if (scenario === 0) {
      oracle.add({ kind: "child", text: "66." });
      const answer = s.child("66.");
      let snapshot = await s.saved();
      for (let i = 0; i < 200 && snapshot.log?.at(-1)?.kind !== "response"; i++) snapshot = await s.saved();
      expect(snapshot.log?.at(-1)?.kind).toBe("response");
      s = createTextSession({ ...opts, resume: json(snapshot), model: { ...base, propose: async () => { throw new Error("offline"); } } });
      expect((await s.start()).say).toEqual((await answer).say);
      expect(s.session.solved).toBe("child"); oracle.assert(s.trace()); hit("R424-18");
    } else if (scenario === 2) {
      oracle.add({ kind: "child", text: "I want to stop." });
      const closing = s.child("I want to stop.");
      let intervention: Promise<TextOutput> | undefined;
      for (let i = 0; i < 200; i++) { await Promise.resolve(); if (s.session.outcome) { intervention = s.partial("Wait"); break; } }
      expect(intervention).toBeDefined(); await intervention; await closing;
      oracle.add({ kind: "partial" });
      s = createTextSession({ ...opts, resume: json(await s.saved()) });
      expect((await s.start()).ended).toBeNull(); expect(s.session.outcome).toBeNull();
      oracle.assert(s.trace(), false); hit("R424-20");
    } else if (scenario === 3) {
      held = true; oracle.add({ kind: "child", text: "66." });
      const answer = s.child("66."); await entered.promise;
      const approval = s.mayaSaid(out.say[0]);
      const snapshot = json(await s.saved()); held = false; release.resolve(accept);
      expect((await answer).cancelled).toBe(false); expect((await approval).cancelled).toBe(false);
      expect(s.session.solved).toBe("child"); expect(calls).toBe(1);
      const resumed = createTextSession({ ...opts, resume: snapshot }); await resumed.start();
      expect(resumed.session.solved).toBe("child"); oracle.assert(resumed.trace()); oracle.assert(s.trace()); hit("R424-21");
    } else {
      now += 20000 + seed; await s.tick(); oracle.add({ kind: "child", text: "56." }); await s.child("56.");
      oracle.assert(s.trace());
      const trace = json(s.trace()), ci = trace.turns.findIndex((t) => t.kind === "child");
      trace.turns = trace.turns.slice(0, ci + 1); trace.board = [];
      trace.obligations!.find((o) => o.kind === "child_turn_pending")!.servedBy = trace.turns.findIndex((t) => t.kind === "maya" && t.output?.act === "check_in");
      expect(() => oracle.assert(trace)).toThrow();
      // Keep counts consistent so only the missing causal response can fail validation.
      trace.counts = traceCounts(trace.turns);
      expect(checkTrace(trace).ok).toBe(false); hit("R424-16-causal");
    }
  }
  expect(checkTrace(s.trace())).toMatchObject({ ok: true }); hit("round7_save_resume");
}

async function seedRun(seed: number, counts: Map<string, number>) {
  let rng = seed;
  const rand = (n: number) => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) % n; };
  const hit = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  let now = T0;
  const base = ruleMayaModel();
  const options = { callId: `log-${seed}`, package: pkg, clock: () => now, random: seed };
  const oracle = new InputOracle();
  let offline = false;
  let reading: "concern" | "immediate" | "stop" | null = null;
  let repeat = false, escalate = false, escalated = false;
  let hold: "answer" | "close" | "retry" | "any" | null = null;
  const entered = Promise.withResolvers<void>();
  const late = Promise.withResolvers<unknown>();
  let heldProposal: unknown;
  const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
    if (offline) { hit("provider_failure"); throw new Error("offline"); }
    let proposal: unknown;
    if (reading && args[0].childTurn && args[0].state !== "SAFETY") {
      if (reading === "stop") { proposal = { version: 2, act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], reading: { stop: true } }; oracle.add({ kind: "stop", at: now }); }
      else { proposal = safety(reading); oracle.add({ kind: "safety", severity: reading, at: now }); }
    } else if (repeat && args[0].state === "SAFETY") {
      const severity = escalate ? "immediate" : "concern";
      proposal = escalate && !escalated ? safety("immediate") : args[0].offers.some((o) => o.act === "close") ? { ...close, reading: { safety: severity } } : safety(severity);
      escalated = true;
      oracle.add({ kind: "safety", severity, at: now });
    } else if (args[0].childTurn === "66.") proposal = accept;
    else proposal = await base.propose(...args);
    const act = (proposal as { act: string }).act;
    const mustHold = hold === "any" || (hold === "answer" && act === "accept_answer") || (hold === "close" && act === "close" && args[0].state === "SAFETY") || (hold === "retry" && args[0].repair !== null);
    if (mustHold) { hold = null; heldProposal = proposal; entered.resolve(); return late.promise; }
    return proposal;
  } };
  let s = createTextSession({ ...options, model });
  const checkpoint = async () => {
    const saved = json(await s.saved());
    const resumed = createTextSession({ ...options, model, resume: saved });
    expect(folded(await resumed.saved())).toEqual(folded(saved));
    expect(resumed.trace()).toEqual(s.trace());
    expect(checkTrace(s.trace()), JSON.stringify(checkTrace(s.trace()))).toMatchObject({ ok: true });
    hit("save_resume");
    return resumed;
  };
  const input = async (i: Input | null, invoke: (target: TextSession) => Promise<TextOutput>) => {
    if (i) oracle.add(i);
    const response = invoke(s);
    await checkpoint();
    const out = await response;
    s = await checkpoint();
    now += 1 + rand(2000);
    return out;
  };
  await input({ kind: "start" }, (s) => s.start());
  await input({ kind: "child", text: "56." }, (s) => s.child("56."));
  if (rand(2) === 0) {
    await input({ kind: "partial" }, (s) => s.partial("No, I meant"));
    expect((await input(null, (s) => s.tick())).say).toEqual([]);
    hit("partial_tick");
  }
  const scenario = seed % 8;
  if (scenario === 0 || scenario === 3 || scenario === 4 || scenario === 5) {
    reading = scenario === 0 && rand(2) === 0 ? "immediate" : "concern";
    repeat = scenario === 3 || scenario === 4;
    escalate = scenario === 4;
    // Reading is repeated until the controller enters SAFETY. The close response is held after all guidance.
    hold = "close";
    oracle.add({ kind: "child", text: "Someone hurts me." });
    const response = s.child("Someone hurts me.");
    await entered.promise;
    const restored = await checkpoint();
    if (scenario === 0) {
      oracle.add({ kind: "technical" });
      const terminal = s.technical("speech service failed");
      await checkpoint();
      const out = await terminal;
      expect(out.say).toEqual([SAFETY_GUIDANCE[reading]]);
      expect(out.ended?.reason).toBe("safety");
      expect((await response).say).toEqual([]);
      hit("R424-13");
    } else if (scenario === 5) {
      oracle.add({ kind: "content", text: "wrong worked step" });
      const content = s.contentProblem("wrong worked step");
      await s.partial("Wait"); oracle.add({ kind: "partial" });
      await response;
      offline = rand(2) === 0;
      await content;
      await s.start();
      hit("safety_content_partial");
    } else {
      late.resolve(heldProposal);
      await response;
      hit(escalate ? "escalation" : "R424-17");
    }
    // A pending checkpoint must keep guidance even when a new provider cannot answer.
    offline = true;
    const continued = await restored.start();
    expect(continued.say).toContain(SAFETY_GUIDANCE[escalate ? "immediate" : reading]);
    expect(continued.ended?.reason).toBe("safety");
    late.reject(new Error("late provider error"));
    await flush();
  } else if (scenario === 1) {
    hold = "answer";
    oracle.add({ kind: "child", text: "66." });
    const response = s.child("66.");
    await entered.promise;
    await checkpoint();
    const writing = s.writing("done");
    const resumed = await checkpoint();
    late.resolve(accept);
    await Promise.all([response, writing]);
    await resumed.start();
    expect(s.session.wrote).toBe(true);
    expect(resumed.session.wrote).toBe(true);
    expect(resumed.session).toEqual(s.session);
    hit("R424-14");
  } else if (scenario === 2) {
    reading = "stop"; hold = "retry";
    oracle.add({ kind: "child", text: "I want to stop." });
    const response = s.child("I want to stop.");
    await entered.promise;
    const resumed = await checkpoint();
    expect((await s.saved()).session.stopRequested).toBe(true);
    offline = true;
    const out = await resumed.start();
    expect(out.ended?.reason).toBe("child_stopped");
    expect(checkTrace(resumed.trace())).toMatchObject({ ok: true });
    expect(resumed.trace().turns.flatMap((t) => t.kind === "maya" && t.output ? [t.output.act] : []).slice(-1)).toEqual(["close"]);
    late.resolve(close); await response;
    hit("R424-15");
  } else {
    hold = "any";
    oracle.add({ kind: "child", text: "I am trying." });
    const response = s.child("I am trying.");
    await entered.promise;
    await checkpoint();
    const text = "Seven plus nine is fifteen.";
    oracle.add({ kind: "repair", text });
    const repair = s.mayaSaid(text);
    await checkpoint();
    oracle.add({ kind: "partial" });
    await s.partial("Wait");
    await Promise.all([response, repair]);
    s = await checkpoint();
    offline = rand(2) === 0;
    await input({ kind: "child", text: "That is wrong." }, (s) => s.child("That is wrong."));
    if (scenario === 6) await input({ kind: "content", text: "wrong key" }, (s) => s.contentProblem("wrong key"));
    else { oracle.add({ kind: "technical" }); await s.technical("network failed"); }
    if (rand(2) === 0) late.reject(new Error("late")); else late.resolve(heldProposal);
    await flush(); hit("repair_partial_terminal");
  }
  await checkpoint();
  oracle.assert(s.trace());
  const log = (await s.saved()).log!;
  expect(log.some((e) => e.kind === "response")).toBe(true);
}

// Fill the real public event history, without changing a saved record or a fold field.
async function historyLimitSeed(seed: number, counts: Map<string, number>) {
  let now = T0, armed = false, received = false;
  const severity = (seed + Math.floor(seed / 100)) % 2 ? "immediate" : "concern";
  const base = ruleMayaModel(), oracle = new InputOracle();
  const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
    if (!armed) return base.propose(...args);
    received = true;
    return safety(severity);
  } };
  const options = { callId: `history-${seed}`, package: pkg, model, clock: () => now, random: seed };
  let s = createTextSession(options);
  oracle.add({ kind: "start" }); await s.start();
  const remaining = async () => {
    const saved = await s.saved();
    return 262144 - (saved.checkpoint?.historyBytes ?? 0) - saved.log!.reduce((bytes, e) => bytes + Buffer.byteLength(JSON.stringify(e)), 0);
  };
  while (await remaining() > 430 && !s.ended) {
    now += 250;
    await s.partial("I think we need to add the tens and the ones");
    oracle.add({ kind: "partial" });
  }
  expect(s.ended).toBe(false);
  const before = await remaining();
  armed = true;
  oracle.add({ kind: "child", text: "Someone hurts me right now." });
  oracle.add({ kind: "safety", severity, at: now });
  const response = s.child("Someone hurts me right now.");
  let receipt = await s.saved();
  for (let i = 0; i < 200 && !receipt.log?.some(e => e.kind === "response"); i++) receipt = await s.saved();
  // The current response, rather than the child input or request, crosses the budget.
  const responseIndex = receipt.log!.findLastIndex(e => e.kind === "response");
  expect(responseIndex).toBeGreaterThanOrEqual(0);
  const newEvents = receipt.log!.slice(receipt.log!.findLastIndex(e => e.kind === "input" && e.event.type === "child_turn"));
  const prefixBytes = newEvents.filter(e => e.kind !== "response").reduce((bytes, e) => bytes + Buffer.byteLength(JSON.stringify(e)), 0);
  expect(before).toBeGreaterThan(prefixBytes);
  expect(await remaining()).toBeLessThan(0);
  expect(received).toBe(true);
  expect(s.session.safety.flagged, "received safety must survive the history limit").toBe(true);
  const out = await response;
  expect(out.say).toEqual([SAFETY_GUIDANCE[severity]]);
  expect(out.board).toEqual([]);
  expect(out.ended).toMatchObject({ reason: "safety", safetyFlag: true, safetySeverity: severity });
  expect(out.safetyMessage).toBe(SAFETY_GUIDANCE[severity]);
  oracle.assert(s.trace()); expect(checkTrace(s.trace())).toMatchObject({ ok: true });
  // Resume independently at receipt with a failed provider. The guidance must still be delivered once.
  let resumedCalls = 0;
  s = createTextSession({ ...options, resume: json(receipt), model: { ...base, propose: async () => { resumedCalls++; throw new Error("offline"); } } });
  expect((await s.start()).say).toEqual([SAFETY_GUIDANCE[severity]]);
  expect((await s.start()).say).toEqual([]);
  expect(s.session.outcome).toEqual(out.ended);
  expect(resumedCalls).toBe(0);
  oracle.assert(s.trace()); expect(checkTrace(s.trace())).toMatchObject({ ok: true });
  counts.set("R424-25", (counts.get("R424-25") ?? 0) + 1);
}

describe("event log interleavings", () => {
  it.each(Array.from({ length: 20 }, (_, i) => i * 100 + 1))("100 deterministic seeds from %i", async (first) => {
    const counts = new Map<string, number>();
    await historyLimitSeed(first, counts);
    for (let seed = first; seed < first + 100; seed++) {
      try { await seedRun(seed, counts); await round7Seed(seed, counts); } catch (error) { throw new Error(`seed ${seed}`, { cause: error }); }
    }
    for (const key of ["R424-25", "save_resume", "provider_failure", "partial_tick", "R424-13", "R424-14", "R424-15", "R424-17", "escalation", "safety_content_partial", "repair_partial_terminal", "R424-16-causal", "R424-18", "R424-19", "R424-20", "R424-21", "round7_save_resume"]) expect(counts.get(key), key).toBeGreaterThan(0);
    process.stdout.write(JSON.stringify({ first, seeds: 100, counts: Object.fromEntries(counts) }) + "\n");
  }, 60000);
});

describe("reported public-interface reproductions", () => {
  it.each(["concern", "immediate"] as const)("returns %s safety guidance without waiting for a provider after the history limit", async (severity) => {
    const base = ruleMayaModel();
    let armed = false, calls = 0;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      calls++;
      if (!armed) return base.propose(...args);
      if (calls === 2) return safety(severity);
      return new Promise<never>(() => {});
    } };
    const s = createTextSession({ callId: "history-no-wait", package: pkg, model, clock: () => T0, random: 7 });
    await s.start();
    const remaining = async () => {
      const saved = await s.saved();
      return 262144 - (saved.checkpoint?.historyBytes ?? 0) - saved.log!.reduce((bytes, e) => bytes + Buffer.byteLength(JSON.stringify(e)), 0);
    };
    const overhead = [
      { kind: "input", at: T0, event: { type: "child_turn", at: T0, text: "", final: false } },
      { kind: "cancelled", at: T0 },
    ].reduce((bytes, event) => bytes + Buffer.byteLength(JSON.stringify(event)), 0);
    while (await remaining() > 430) {
      const padding = Math.min(1000, await remaining() - 430 - overhead);
      expect(padding).toBeGreaterThanOrEqual(0);
      await s.partial("x".repeat(padding));
    }
    expect(await remaining()).toBe(430);
    expect(s.ended).toBe(false);
    armed = true;

    const out = await s.child("Someone hurts me right now.");

    expect(out.say).toEqual([SAFETY_GUIDANCE[severity]]);
    expect(out.board).toEqual([]);
    expect(out.ended).toMatchObject({ reason: "safety", safetyFlag: true, safetySeverity: severity });
    expect(out.safetyMessage).toBe(SAFETY_GUIDANCE[severity]);
    expect(s.ended).toBe(true);
    expect(calls).toBe(2);
    expect(s.trace().obligations).toContainEqual(expect.objectContaining({ kind: "safety_due", status: "served" }));
    expect(checkTrace(s.trace())).toMatchObject({ ok: true });
  });

  it.each([0, 1])("R424-25: safety at the history limit, seed %i", async (seed) => {
    await historyLimitSeed(seed, new Map());
  });
  it.each([
    { finding: "R424-13: technical failure retains pending safety speech", seed: 8 },
    { finding: "R424-14: writing completion follows the pending correct answer", seed: 1 },
    { finding: "R424-15: stop survives a saved retry and failed provider", seed: 2 },
  ])("$finding", async ({ seed }) => { await seedRun(seed, new Map()); });
});

describe("log boundaries and legacy records", () => {
  it("does not transfer a deferred writing event to a replacement transcript", async () => {
    const base = ruleMayaModel();
    const entered = Promise.withResolvers<void>(), late = Promise.withResolvers<unknown>();
    let held = false;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      if (args[0].childTurn === "66." && !held) { held = true; entered.resolve(); return late.promise; }
      return base.propose(...args);
    } };
    const options = { callId: "writing-owner", package: pkg, model, clock: () => T0 };
    const s = createTextSession(options); await s.start(); await s.child("56.");
    const answer = s.child("66."); await entered.promise;
    const writing = s.writing("done");
    const resumed = createTextSession({ ...options, resume: json(await s.saved()) });
    await s.partial("No, I meant"); await resumed.partial("No, I meant");
    await Promise.all([answer, writing]);
    expect(await resumed.child("No, I meant sixty-six.")).toEqual(await s.child("No, I meant sixty-six."));
    expect(s.session.solved).toBe("child"); expect(s.session.wrote).toBe(false);
    expect(resumed.session).toEqual(s.session);
    late.resolve(accept); await flush();
  });
  it("R424-17: an unchanged safety reading on every proposal gives guidance once and closes", async () => {
    const base = ruleMayaModel();
    let active = false;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => active ? safety("immediate") : base.propose(...args) };
    const s = createTextSession({ callId: "repeated-safety", package: pkg, model, clock: () => T0 });
    await s.start(); active = true;
    const out = await s.child("Someone hurts me now.");
    expect(out.say.filter((text) => text === SAFETY_GUIDANCE.immediate)).toHaveLength(1);
    expect(out.ended?.reason).toBe("safety");
    expect(checkTrace(s.trace())).toMatchObject({ ok: true });
  });
  it.each(["resolve", "reject"])("logs a stale provider %s without changing the fold", async (settlement) => {
    const base = ruleMayaModel();
    const entered = Promise.withResolvers<void>(), late = Promise.withResolvers<unknown>();
    let hold = false;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => { if (hold) { hold = false; entered.resolve(); return late.promise; } return base.propose(...args); } };
    const options = { callId: "stale-log", package: pkg, model, clock: () => T0 };
    const s = createTextSession(options);
    await s.start(); hold = true;
    const child = s.child("56."); await entered.promise;
    const request = (await s.saved()).log!.findLast((e) => e.kind === "request")!;
    await s.partial("No, I meant"); await child;
    await s.child("66.");
    const before = folded(await s.saved());
    if (settlement === "resolve") late.resolve(safety("immediate")); else late.reject(new Error("late failure"));
    await flush();
    const saved = json(await s.saved());
    expect(saved.log!.at(-1)).toMatchObject({ kind: "response", requestId: request.kind === "request" ? request.requestId : -1 });
    expect(folded(saved)).toEqual(before);
    // Cached fields are deliberately wrong. The constructor must derive state from the log.
    saved.session.solved = null;
    saved.session.safety.guided = false;
    saved.turns = []; saved.board = []; saved.obligations = [];
    const resumed = createTextSession({ ...options, resume: saved });
    expect(folded(await resumed.saved())).toEqual(before);
    expect(resumed.session.safety.flagged).toBe(false);
    // Every event boundary, including request, response, review and delivery, can be saved as plain JSON.
    for (let length = 0; length <= saved.log!.length; length++) {
      const prefix = json({ ...saved, log: saved.log!.slice(0, length) });
      const a = createTextSession({ ...options, resume: prefix });
      const b = createTextSession({ ...options, resume: json(await a.saved()) });
      expect(b.session).toEqual(a.session);
      expect(b.trace()).toEqual(a.trace());
    }
  });
  it("keeps the last speech approval in a legacy record without an approval list", async () => {
    const options = { callId: "legacy-approval", package: pkg, model: ruleMayaModel(), clock: () => T0 };
    const s = createTextSession(options); await s.start();
    const out = await s.child("56.");
    const saved = await s.saved(); saved.v = 1; delete saved.log; delete saved.initial; delete saved.approved;
    const resumed = createTextSession({ ...options, resume: saved });
    expect((await resumed.mayaSaid(out.say.at(-1)!)).cancelled).toBe(false);
  });
  it.each([1, 2, 3, 4, 5, 6] as const)("validates trace version %i", async (version) => {
    const s = createTextSession({ callId: "trace-versions", package: pkg, model: ruleMayaModel(), clock: () => T0 });
    await s.start(); await s.child("56.");
    const trace = json(await s.finish()); trace.version = version;
    if (version < 3) delete trace.reviewer;
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });
  it("reads a legacy saved session without a log", async () => {
    const options = { callId: "legacy", package: pkg, model: ruleMayaModel(), clock: () => T0 };
    const s = createTextSession(options); await s.start(); await s.child("56.");
    const saved = await s.saved(); saved.v = 1; delete saved.log; delete saved.initial;
    const resumed = createTextSession({ ...options, resume: saved });
    expect(await resumed.child("66.")).toEqual(await s.child("66."));
    expect(resumed.trace()).toEqual(s.trace());
  });
});
