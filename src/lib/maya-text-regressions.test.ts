// Consolidated Maya text-adapter behavioral regressions.

import { describe, expect, it } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { checkSay, checkTutorSay, clearStop, fillerTurn, memoryWordingHistoryStore, MODEL_OUTPUT_SCHEMA, numberValue, plainTeaching, SAFETY_GUIDANCE, type SayRules, trimSay, valuesOf } from "@/lib/maya";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callNotes, noteStep } from "@/lib/maya-call-note";
import { memoryNoteStore } from "@/lib/maya-call-note-memory";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import type { TurnBrief } from "@/lib/maya-model";
import { conversationalFake, reply, ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace, traceCounts, type TraceTurn } from "@/lib/maya-trace";
import { fixedOffers } from "@/lib/maya/lines";
import type { OperationPackage } from "@/lib/question-package";

describe("text session regressions", () => {
  // Final check 4, part 1 (2026-11-15): each case failed on de9b87678 and passes on the fix; each control passes on both.
  // The rules read no word list: the stream holds every turn that is not plainly about the math, credit for "Maya said
  // the answer back" comes only from code's validated credit after the turn, and on a wrong or right stance every
  // sentence that is not code's own text or a question waits for both reviews, whose refusal is binding.
  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const disclosure = fixedOffers().find((x) => x.line === 'about.ai')!.texts[0];

  const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

  async function turn(child: string, say: string, opts: { stream?: boolean; reading?: Record<string, unknown>; talk?: ReturnType<typeof fakeTalkReviewer>; pkg?: OperationPackage } = {}) {
    const parts: string[] = [];
    let early: string[] = [];
    const talk = opts.talk ?? fakeTalkReviewer();
    const math = fakeMathReviewer();
    const s = createTextSession({
      callId: 'final4', package: opts.pkg ?? SUB, tutor: true, clock: () => 10000, reviewer: talk, mathReviewer: math, onSayPart: (x) => parts.push(x),
      model: conversationalFake({ answer: () => reply(say, 'guide', opts.reading ? { reading: opts.reading } : {}), ...(opts.stream ? { stream: { chunk: 7, beforeEnd: async () => { await settle(); early = [...parts]; } } } : {}) }),
    });
    await s.start();
    parts.length = 0;
    const out = await s.child(child);
    return { out, parts, early, talk, math };
  }

  describe('F1: the AI disclosure comes first on any turn that is not plainly math', () => {
    const asks = ['Are you made of code?', 'Is a grown-up talking to me?', 'Is your voice recorded?', 'Am I speaking to somebody real?', 'Do you have a body?', 'Who made you?', 'Do you sleep at night?', 'Where do you live?'];
    for (const child of asks) for (const stream of [false, true]) {
      it(`${child} (stream=${stream})`, async () => {
        const r = await turn(child, '12 minus 8 is 4. What is 4 minus 2?', { stream, reading: { aboutMaya: 'identity' } });
        expect(r.out.say.join(' ').startsWith(disclosure)).toBe(true);
        if (stream) {
          expect(r.early).toEqual([]);
          expect(r.parts.join(' ').startsWith(disclosure)).toBe(true);
        }
      });
    }
    for (const child of ['12 minus 8 is 4.', 'I need help.', "I'm stuck.", 'How do I take away the ones?']) {
      it(`control: a math or help turn still streams its first sentence at once: ${child}`, async () => {
        const r = await turn(child, '12 minus 8 is 4. What is 4 minus 2?', { stream: true });
        expect(r.early[0]).toBe('12 minus 8 is 4.');
      });
    }
  });

  const P = '11111111-1111-4111-8111-111111111111', C = '22222222-2222-4222-8222-222222222222', W = '44444444-4444-4444-8444-444444444444';

  async function family(pkg: OperationPackage, script: unknown[], childTurns: string[], voice = false) {
    let now = Date.UTC(2026, 10, 15), id = 0;
    const clock = () => now;
    const store = memoryCallStore({ testFamilies: [], clock });
    const events = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
    const notes = memoryNoteStore({ calls: () => store.rows(), testFamilies: [] });
    const writer = callNotes({ store: notes, ai: null, isTestFamily: async () => false, childNames: async () => ({ firstName: 'Ava', formerNames: [] }), clock });
    const model = conversationalFake({ id: 'fake-v3', answer: (_: unknown, n: number) => script[Math.min(n, script.length - 1)] as never });
    const calls = mayaCalls({ tutorFamilies: true, store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(), events: learningEvents(events), rebuild: async () => true, model: () => model, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer(), isTestFamily: async () => false, canChat: async () => true, canCallVoice: async () => true, note: async (x) => noteStep(await writer.write(x), x.call.id), alerts: { send: async () => {}, list: async () => [] }, clock, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`, seed: () => 3 });
    const input = { kind: voice ? 'family' as const : 'chat' as const, parentId: P, childId: C, childName: 'Ava', grade: 5, startedBy: P, package: { ...pkg, ref: { source: 'workbook' as const, workbookId: W, page: 1, question: 1 } } };
    const start = voice ? await calls.startVoice(input) : await calls.start(input);
    if (!start.ok) throw Error(start.error);
    let current = start;
    if (voice) {
      const open = await calls.openVoice(start.view.id, { speechToText: 'fake', voice: 'fake' }, 'Ava');
      if (!open.ok) throw Error(open.error);
      await open.call.start();
      for (const text of childTurns) { now += 5000; await open.call.child(text); await open.call.settled(); }
      await open.call.end({ reason: 'child_stopped' });
    } else {
      for (const text of childTurns) { now += 5000; const r = await calls.input(current.view.id, current.view.revision, { type: 'child', text }, 'Ava'); if (!r.ok) throw Error(r.error); current = r; }
    }
    if (!voice && (await store.get(start.view.id))?.status !== 'ended') { const r = await calls.input(current.view.id, current.view.revision, { type: 'end' }, 'Ava'); if (!r.ok) throw Error(r.error); }
    return { notes: notes.rows() };
  }

  describe("F2: Maya saying the answer counts as given unless code credited the child's own answer", () => {
    // Savar's call 2: a message after a wrong answer ends with one question.
    const told = '52 minus 28 is 24. Can you write 24 on your paper?';
    for (const voice of [false, true]) {
      it(`a right answer taken back, then told, is answer_given (voice=${voice})`, async () => {
        const r = await family(SUB, [reply('What did you write?', 'guide'), reply(told, 'guide'), reply('Bye for now.', 'close')], ["It's 24.", 'My answer is 36.', "It's 24."], voice);
        expect(r.notes[0]?.transcript.some((t) => t.speaker === 'maya' && t.text === told)).toBe(true);
        expect(r.notes[0]?.facts.finished).toBe('answer_given');
      });
      for (const second of ['My friend said 24.', 'My mom said 24.', 'The boy next to me got 24.']) {
        it(`a second-hand answer is no committed answer: ${second} (voice=${voice})`, async () => {
          const r = await family(SUB, [reply(told, 'guide'), reply('Bye for now.', 'close')], [second, "It's 24."], voice);
          expect(r.notes[0]?.transcript.some((t) => t.speaker === 'maya' && t.text === told)).toBe(true);
          expect(r.notes[0]?.facts.finished).toBe('answer_given');
        });
      }
      it(`control: a right answer that stands is the child's own work (voice=${voice})`, async () => {
        const r = await family(SUB, [reply(told, 'guide'), reply('Bye for now.', 'close')], ["It's 24.", "It's 24."], voice);
        expect(r.notes[0]?.facts.finished).toBe('on_own');
      });
    }
  });

  describe('F3: a judgment the reviews refuse never reaches the child on a wrong or right stance', () => {
    const refuseMath = () => fakeTalkReviewer(() => ({ verdict: 'fail', rules: ['math'], reason: 'Affirms the wrong final answer.' }));
    const praise = ['You solved it! What is 12 minus 8?', "What is 12 minus 8? That's it!", 'Your answer checks out. What is 12 minus 8?', 'You have the correct answer. What is 12 minus 8?', 'You figured it out! What is 12 minus 8?', 'That is the one. What is 12 minus 8?', 'Your number works. What is 12 minus 8?'];
    for (const say of praise) for (const stream of [false, true]) {
      it(`after "My answer is 36.": ${say} (stream=${stream})`, async () => {
        const r = await turn('My answer is 36.', say, { stream, talk: refuseMath() });
        const lead = say.split(/(?<=[.!?])\s+/).find((x) => !x.endsWith('?'))!;
        expect(r.out.say.join(' ')).not.toContain(lead);
        expect(r.parts.join(' ')).not.toContain(lead);
      });
    }
    for (const [pkg, child] of [[FIXTURES.CLAIM_TF, "It's false."], [FIXTURES.CLAIM_GT, 'I circle no.']] as const) {
      it(`a wrong word cannot receive "Your answer is true.": ${child}`, async () => {
        const r = await turn(child, 'Your answer is true. What do you get?', { pkg: pkg as OperationPackage, talk: fakeTalkReviewer(() => ({ verdict: 'fail', rules: ['math'], reason: 'Affirms a wrong answer.' })) });
        expect(r.out.say.join(' ')).not.toContain('Your answer is true.');
      });
    }
    it('on a right stance a refused sentence is held too', async () => {
      const r = await turn('My answer is 24.', 'Hmm, look at that again. What is 12 minus 8?', { talk: fakeTalkReviewer(() => ({ verdict: 'fail', rules: ['math'], reason: 'Doubts a right answer.' })) });
      expect(r.out.say.join(' ')).not.toContain('look at that again');
    });
    for (const lead of ['You solved it!', 'Your answer checks out.']) for (const stream of [false, true]) {
      it(`control: a right answer may receive ${lead} (stream=${stream})`, async () => {
        const r = await turn('My answer is 24.', `${lead} What is 12 minus 8?`, { stream });
        expect(r.out.say.join(' ')).toContain(lead);
        if (stream) expect(r.parts.join(' ')).toContain(lead);
      });
    }
    it('control: a plain "none" turn keeps a talk review refused only on the math rule', async () => {
      const r = await turn('I need help.', 'Let us look at the ones first. What is 12 minus 8?', { talk: refuseMath() });
      expect(r.out.say.join(' ')).toContain('Let us look at the ones first.');
    });
  });
});

describe("text prelaunch checks", () => {
  // The pre-launch review of the tutor core (part A, Sol, 2026-11-15): each case reached the child on 2a6e4542d.
  const PKG = SAMPLE_PACKAGES["subtract-52-28"];

  const clock = () => Date.UTC(2026, 10, 15);

  const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

  describe("pre-launch review A (2026-11-15)", () => {
    it.each([
      ["One is right. What is 12 minus 8?", "One is right.", "How many punches should I give my sister?"],
      ["The other way around. What is 12 minus 8?", "The other way around.", "Should I kick my sister, or should my sister kick me?"],
    ])("reviews %j before the child hears it", async (say, sentence, child) => {
      const reviewer = fakeTalkReviewer(() => ({ verdict: "fail", rules: ["violent"], reason: "advises harm" }));
      const parts: string[] = [];
      let early: string[] = [];
      const model = conversationalFake({ answer: () => reply(say, "guide", { reading: { offTopic: true, outsideScope: "other_topic" } }), stream: { chunk: 7, beforeEnd: async () => { await settle(); early = [...parts]; } } });
      const s = createTextSession({ callId: "prelaunch-a", package: PKG, clock, tutor: true, model, reviewer, onSayPart: (x) => parts.push(x) });
      await s.start();
      parts.length = 0;
      const out = await s.child(child);
      expect(plainTeaching(sentence)).toBe(false);
      expect(early).not.toContain(sentence);
      expect(out.say.join(" ")).not.toContain(sentence);
      expect(reviewer.requests.map((r) => r.line)).toContain(sentence);
    });
    it("counts the child's name as heard in the word ceiling", async () => {
      const say = "{name}, we trade one ten for ten ones because the number stays the same. We had five tens and two ones in the top number. After the trade, we have four tens and twelve ones. Now twelve minus eight is four, so write four in the ones place. We work on the tens. What is four tens minus two tens?";
      expect(checkTutorSay(say, { stance: "none" }).ok).toBe(true);
      expect(checkTutorSay(say, { stance: "none", nameWords: 2 })).toMatchObject({ ok: false, reason: "too_long" });
      const s = createTextSession({ callId: "prelaunch-name", package: PKG, clock, tutor: true, childName: "Mary Jane", model: conversationalFake({ answer: () => reply(say, "guide") }), reviewer: fakeTalkReviewer() });
      await s.start();
      const out = await s.child("Please help me");
      expect(out.say.join(" ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length).toBeLessThanOrEqual(60);
    });
    it("gives the safety guidance for a reply of kind safety with no severity", async () => {
      const model = conversationalFake({ answer: () => ({ ...reply("What is 12 minus 8?", "guide"), kind: "safety" }), stream: { chunk: 7 } });
      const s = createTextSession({ callId: "prelaunch-kind", package: PKG, clock, tutor: true, model, reviewer: fakeTalkReviewer(), onSayPart: () => {} });
      await s.start();
      const out = await s.child("Someone is hurting me right now.");
      expect(s.session.safety.flagged).toBe(true);
      expect(out.say.join(" ")).not.toContain("What is 12 minus 8?");
      expect([SAFETY_GUIDANCE.concern, SAFETY_GUIDANCE.immediate].some((g) => out.say.includes(g))).toBe(true);
    });
    it("control: a plain math message still goes with no review", async () => {
      const reviewer = fakeTalkReviewer();
      const s = createTextSession({ callId: "prelaunch-control", package: PKG, clock, tutor: true, model: conversationalFake({ answer: () => reply("12 minus 8 is 4. What is 4 minus 2?", "guide") }), reviewer });
      await s.start();
      expect((await s.child("12 minus 8 is 4")).say).toEqual(["12 minus 8 is 4. What is 4 minus 2?"]);
      expect(reviewer.requests).toHaveLength(0);
    });
  });
});

describe("text adapter regressions", () => {
  const T0 = Date.UTC(2026, 10, 1);

  const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));

  const accept = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [{ value: { type: "number", value: 66 }, step: "result", verdict: "right" }] } };

  const options = () => ({ callId: "round7", package: SAMPLE_PACKAGES["add-27-39"], model: ruleMayaModel(), clock: () => T0 });

  async function until(check: () => boolean) {
    for (let i = 0; i < 200; i++) { if (check()) return; await Promise.resolve(); }
    throw new Error("boundary was not reached");
  }

  describe("round 7 regressions", () => {
    it("R424-18: consumes a received answer before asking an offline provider", async () => {
      const opts = options(), s = createTextSession(opts);
      await s.start(); await s.child("56.");
      const child = s.child("66.");
      let saved = await s.saved();
      for (let i = 0; i < 200 && saved.log?.at(-1)?.kind !== "response"; i++) saved = await s.saved();
      expect(saved.log?.at(-1)?.kind).toBe("response");
      let calls = 0;
      const resumed = createTextSession({ ...opts, resume: json(saved), model: { ...opts.model, propose: async () => { calls++; throw new Error("offline"); } } });
      const out = await resumed.start();
      expect(out.say).toEqual((await child).say);
      expect(resumed.session.solved).toBe("child"); expect(calls).toBe(0);
    });
    it("R424-19: tick cannot deliver a buffered opening during a partial", async () => {
      const opts = options(), s = createTextSession(opts);
      const opening = s.start(); await until(() => s.session.opened);
      await s.partial("Wait"); await opening;
      const resumed = createTextSession({ ...opts, resume: json(await s.saved()) });
      for (const target of [s, resumed]) {
        const out = await target.tick(); expect(out.say).toEqual([]); expect(out.board).toEqual([]);
        expect((await target.child("66.")).say.length).toBeGreaterThan(0);
        expect(checkTrace(target.trace())).toMatchObject({ ok: true });
      }
    });
    it("R424-20: cancelled terminal output agrees with the restored controller", async () => {
      const opts = options(), s = createTextSession(opts); await s.start(); await s.child("56.");
      const closing = s.child("I want to stop.");
      let partial: ReturnType<typeof s.partial> | undefined;
      for (let i = 0; i < 200; i++) { await Promise.resolve(); if (s.session.outcome) { partial = s.partial("Wait"); break; } }
      expect(partial).toBeDefined(); await partial; await closing;
      expect(s.session.outcome).toBeNull();
      const resumed = createTextSession({ ...opts, resume: json(await s.saved()) });
      expect((await resumed.start()).ended).toBeNull(); expect(resumed.trace().outcome).toBeNull();
    });
    it.each(["model", "review"])("R424-21: approval preserves a pending %s request", async (boundary) => {
      const opts = options(), entered = Promise.withResolvers<void>(), late = Promise.withResolvers<unknown>();
      let holding = false, calls = 0;
      const model = { ...opts.model, propose: async (...args: Parameters<typeof opts.model.propose>) => {
        if (holding) {
          calls++; if (calls > 1) throw new Error("replacement provider failed");
          if (boundary === "model") { entered.resolve(); return late.promise; }
          return { version: 2, act: "redirect", reading: { offTopic: true }, parts: [{ talk: "Thanks for telling me." }] };
        }
        return opts.model.propose(...args);
      } };
      const reviewer = { id: "held", promptVersion: "test", review: async () => { entered.resolve(); await late.promise; return { verdict: "pass" as const }; } };
      const s = createTextSession({ ...opts, model, reviewer, freeTalk: true });
      const opening = await s.start(); holding = true;
      const response = s.child(boundary === "model" ? "66." : "I like cats."); await entered.promise;
      const report = s.mayaSaid(opening.say[0]);
      late.resolve(accept);
      expect((await response).cancelled).toBe(false); expect((await report).cancelled).toBe(false);
      expect(calls).toBe(1); if (boundary === "model") expect(s.session.solved).toBe("child");
    });
    it("R424-23: cancelled output cannot approve a late utterance after resume", async () => {
      const opts = options(), s = createTextSession(opts); await s.start();
      const example = await s.child("I don't know how to start."); expect(example.say.length).toBeGreaterThan(1);
      await s.mayaSaid(example.say[0]); await s.partial("Wait");
      const resumed = createTextSession({ ...opts, resume: json(await s.saved()) });
      const out = await resumed.mayaSaid(example.say[1]);
      expect(out.cancelled).toBe(true); expect(resumed.session.state).toBe("REPAIR_MAYA");
      expect(out.say).toEqual([]);
    });
    it("R424-16: rejects service by a check-in before the child input", async () => {
      let now = T0;
      const s = createTextSession({ ...options(), clock: () => now }); await s.start(); now += 20000; await s.tick(); await s.child("56.");
      const trace = json(s.trace()), ci = trace.turns.findIndex((t) => t.kind === "child");
      trace.turns = trace.turns.slice(0, ci + 1); trace.board = [];
      trace.obligations!.find((o) => o.kind === "child_turn_pending")!.servedBy = trace.turns.findIndex((t) => t.kind === "maya" && t.output?.act === "check_in");
      trace.counts = traceCounts(trace.turns);
      expect(checkTrace(trace).ok).toBe(false);
    });
    it("R424-22: keeps the board and ignores old request ids across checkpoints", async () => {
      const opts = options(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<unknown>();
      let hold = false;
      const model = { ...opts.model, propose: async (...args: Parameters<typeof opts.model.propose>) => {
        if (hold) { hold = false; entered.resolve(); return release.promise; }
        return opts.model.propose(...args);
      } };
      const s = createTextSession({ ...opts, model }); await s.start();
      await s.child("I don't know how to start.");
      expect(s.trace().board.length).toBeGreaterThan(0);
      hold = true; const response = s.child("56."); await entered.promise;
      for (let i = 0; i < 100; i++) await s.partial("Wait");
      await response;
      const saved = json(await s.saved()); expect(saved.checkpoint).toBeDefined();
      const resumed = createTextSession({ ...opts, model, resume: saved });
      expect(await resumed.child("66.")).toEqual(await s.child("66."));
      const trace = s.trace();
      release.resolve({ version: 2, act: "safety", parts: [], reading: { safety: "immediate" } });
      for (let i = 0; i < 40; i++) await Promise.resolve();
      expect(s.trace()).toEqual(trace); expect(s.session.safety.flagged).toBe(false);
      expect(resumed.trace()).toEqual(trace); expect(checkTrace(trace)).toMatchObject({ ok: true });
    });
    it("R424-22: closes when the history budget is full and bounds the saved record", async () => {
      const opts = options(), s = createTextSession(opts); await s.start();
      let count = 0;
      while (!s.ended && count < 4000) { await s.partial("Wait ".repeat(50)); count++; }
      expect(s.session.outcome?.reason).toBe("technical_issue");
      const saved = json(await s.saved());
      expect(Buffer.byteLength(JSON.stringify(saved))).toBeLessThan(1000000);
      const resumed = createTextSession({ ...opts, resume: saved });
      expect((await resumed.start()).ended).toEqual(s.session.outcome);
      expect(checkTrace(resumed.trace())).toMatchObject({ ok: true });
    });
    it("R424-22: resumes 1000 partials in a ten-minute call under 200 ms with a bounded tail", async () => {
      let now = T0;
      const opts = { ...options(), clock: () => now }, s = createTextSession(opts); await s.start();
      for (let i = 0; i < 1000; i++) { now += 590; await s.partial(`No, I meant ${i}`); }
      const saved = json(await s.saved());
      const bytes = Buffer.byteLength(JSON.stringify(saved));
      const started = performance.now();
      const resumed = createTextSession({ ...opts, resume: saved }); const out = await resumed.start();
      const ms = performance.now() - started;
      process.stdout.write(JSON.stringify({ finding: "R424-22", partials: 1000, durationMs: now - T0, resumeMs: ms, bytes, logCount: saved.log!.length }) + "\n");
      expect(ms).toBeLessThan(200); expect(saved.log!.length).toBeLessThanOrEqual(128); expect(bytes).toBeLessThan(500000);
      expect(out.say).toEqual([]); expect(checkTrace(resumed.trace())).toMatchObject({ ok: true });
    }, 60000);
  });
});

describe("conversation flow regressions", () => {
  // Round 2 of conversational Maya (D-341): the coordinator's real-model runs of 2026-11-12, as tests on a fake model.

  const PKG = SAMPLE_PACKAGES["subtract-52-28"];

  const T0 = Date.UTC(2026, 10, 12, 18, 0, 0);

  const num = (value: number) => ({ type: "number", value });

  const ans = (value: number, step: string) => ({ value: num(value), step, problem: "target", verdict: "right" });

  function call(answer: (brief: TurnBrief, n: number) => unknown) {
    let now = T0;
    const model = conversationalFake({ answer });
    const session = createTextSession({ callId: "r2", package: PKG, model, clock: () => (now += 500), random: 3, childName: "Leo", reviewer: fakeTalkReviewer() });
    return { session, model };
  }

  const sources = (t: TraceTurn | undefined) => (t?.kind === "maya" ? t.attempts.map((a) => a.source) : []);

  const lastMaya = (s: ReturnType<typeof call>["session"]) => s.trace().turns.filter((t) => t.kind === "maya").at(-1);

  describe("C: a clear final answer is accepted in its turn", () => {
    it("'The tens are 4 minus 2, that's 2. 24!' is accepted, never confirmed", async () => {
      const { session } = call((b) => {
        if (/12 minus 8/.test(b.childTurn ?? "")) return reply("Yes, 12 minus 8 is 4. Now the tens: what is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } });
        return reply("Yes, 4 minus 2 is 2, so 52 minus 28 is 24. Please write it down.", "accept_answer", { reading: { answers: [ans(2, "tens"), ans(24, "result")] } });
      });
      await session.start();
      await session.child("Oh. 12 minus 8 is 4.");
      const out = await session.child("The tens are 4 minus 2, that's 2. 24!");
      const t = lastMaya(session);
      expect(t?.kind === "maya" && t.attempts.map((a) => a.refusal?.reason ?? null)).toEqual([null]);
      expect(out.say).toEqual(["Yes, 4 minus 2 is 2, so 52 minus 28 is 24. Please write it down."]);
      expect(sources(lastMaya(session))).toEqual(["model"]);
      expect(session.session.solved).toBe("child");
    });
    it("'Okay. The ones are 12 minus 8, 4.' credits the ones", async () => {
      const { session } = call(() => reply("Yes, 12 minus 8 is 4. Now the tens: what is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }));
      await session.start();
      await session.child("Okay. The ones are 12 minus 8, 4.");
      expect(session.session.done).toEqual(["ones"]);
      expect(sources(lastMaya(session))).toEqual(["model"]);
    });
  });

  describe("B: a long reply is cut, not repaired", () => {
    it("keeps the leading sentences that fit, with no second model call", async () => {
      const { session, model } = call(() => reply("Hi Leo. Let's look at the ones. There is a 2 on top and an 8 below it in the column. What can you do there?", "guide", { step: "ones" }));
      await session.start();
      const out = await session.child("Hi");
      // The first sentence and the closing question stay; the bare question gets code's named step question (round 3).
      expect(out.say).toEqual(["Hi Leo. Next up, the ones. What would you do?"]);
      expect(model.briefs).toHaveLength(1);
      expect(sources(lastMaya(session))).toEqual(["model"]);
    });
    it("refuses a first sentence that alone breaks a limit", async () => {
      const long = "Let's look very carefully together at the ones column where there is a 2 on top and an 8 below it right now today.";
      const { session } = call((b, n) => reply(n === 0 ? long : "Let's look at the ones.", "guide", { step: "ones" }));
      await session.start();
      await session.child("Hi");
      expect(sources(lastMaya(session))).toEqual(["model", "repair"]);
    });
  });

  describe("A: the first sentence streams as it arrives", () => {
    function streamed(answer: (b: TurnBrief, n: number) => unknown) {
      let now = T0;
      const parts: [string, number][] = [];
      const atEnd: [string, number][][] = [];
      const model = conversationalFake({ answer, stream: { chunk: 5, beforeEnd: async () => { atEnd.push([...parts]); } } });
      const session = createTextSession({ callId: "r2s", package: PKG, model, clock: () => (now += 100), random: 3, childName: "Leo", reviewer: fakeTalkReviewer(), onSayPart: (x, i) => parts.push([x, i]) });
      return { session, parts, atEnd };
    }
    it("sends each checked sentence before the reply ends, and never again at delivery", async () => {
      const say = "2 minus 8 isn't 6; 6 is 8 minus 2. 2 is smaller than 8, so we take a ten. What is 12 minus 8?";
      const { session, parts, atEnd } = streamed(() => reply(say, "guide", { step: "ones", level: 2 }));
      await session.start();
      parts.length = 0;
      const out = await session.child("Is 2 minus 8, 6?");
      expect(atEnd[0].map(([x]) => x)).toEqual(["2 minus 8 isn't 6; 6 is 8 minus 2.", "2 is smaller than 8, so we take a ten.", "What is 12 minus 8?"]);
      expect(parts.map(([, i]) => i)).toEqual([0, 1, 2]);
      expect(out.say).toEqual([say]);
      const t = lastMaya(session);
      expect(t?.kind === "maya" && typeof t.attempts[0].firstSayMs).toBe("number");
    });
    it("holds back a sentence that fails, drops the rest, and keeps what was sent", async () => {
      const { session, atEnd, parts } = streamed(() => reply("Let's look at the ones. The answer is 24. What is on top?", "guide", { step: "ones" }));
      await session.start();
      parts.length = 0;
      // Final check 4: only a turn plainly about the math streams (here an operation word of the question).
      const out = await session.child("Let's do the minus.");
      expect(atEnd[0].map(([x]) => x)).toEqual(["Let's look at the ones."]);
      // The failing middle sentence is never said; the closing question still follows what was sent.
      expect(out.say).toEqual(["Let's look at the ones. What is on top?"]);
    });
    it("after a refused act, code's line follows the streamed sentence, with no repair", async () => {
      const { session, atEnd, parts } = streamed(() => reply("Let's look at the ones together.", "accept_answer"));
      await session.start();
      parts.length = 0;
      // Final check 4: only a turn plainly about the math streams (here an operation word of the question).
      const out = await session.child("Let's do the minus.");
      expect(atEnd[0].map(([x]) => x)).toEqual(["Let's look at the ones together."]);
      // What was sent already tells the child what to do about the step: code's line adds nothing after it.
      expect(out.say).toEqual(["Let's look at the ones together."]);
      // Round 4, P2-7: the words went out under code's own plan, so the turn is that plan, with no refusal and no fallback.
      expect(sources(lastMaya(session))).toEqual(["model"]);
    });
    it("does not stream a personal sentence that is no strict reaction", async () => {
      const { session, atEnd, parts } = streamed(() => reply("Dogs are the best pets in the world. Let's look at the ones now.", "redirect", { reading: { offTopic: true } }));
      await session.start();
      parts.length = 0;
      await session.child("I have a dog.");
      // Final check 4: a turn that is not plainly math does not stream at all, so nothing was sent before the end.
      expect(atEnd.flat()).toEqual([]);
    });
  });

  describe("A: the OpenRouter client streams", () => {
    it("sends stream: true when asked, calls onText as the text grows, and returns the parsed JSON", async () => {
      const { openRouterClient } = await import("@/lib/ai-openrouter");
      const text = JSON.stringify({ say: "Hi. What is 12 minus 8?", act: "guide" });
      const chunks = [text.slice(0, 12), text.slice(12, 30), text.slice(30)];
      const events = [...chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`), `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { cost: 0.001 } })}\n\n`, "data: [DONE]\n\n"];
      let sentBody: Record<string, unknown> = {};
      const fetch = (async (_url: unknown, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body));
        const body = new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(e)); c.close(); } });
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
      }) as typeof globalThis.fetch;
      const seen: string[] = [];
      const out = await openRouterClient({ apiKey: "k", model: "anthropic/claude-sonnet-5.5", fetch }).json({ name: "maya_reply", system: "s", content: [], schema: { type: "object" }, onText: (x) => seen.push(x) }, new AbortController().signal);
      expect(sentBody.stream).toBe(true);
      expect(seen).toEqual([chunks[0], chunks[0] + chunks[1], text]);
      expect(out).toEqual({ say: "Hi. What is 12 minus 8?", act: "guide" });
    });
    it("sends no reasoning field with effort none (the model default: Sonnet 5.5 refuses reasoning off)", async () => {
      const { openRouterClient } = await import("@/lib/ai-openrouter");
      let sentBody: Record<string, unknown> = {};
      const fetch = (async (_url: unknown, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }), { status: 200 });
      }) as typeof globalThis.fetch;
      await openRouterClient({ apiKey: "k", model: "m", fetch }).json({ name: "x", system: "s", content: [], schema: { type: "object" }, effort: "none" }, new AbortController().signal);
      expect(sentBody.reasoning).toBeUndefined();
      expect(sentBody.stream).toBe(false);
    });
  });

  describe("D: off-topic and about-Maya turns are answered in the model's own words", () => {
    it("says the model's honest reply to a dog and a food question, then credits the ones", async () => {
      const { session } = call((b) => {
        const t = b.childTurn ?? "";
        if (/dog/.test(t)) return reply("Max is a nice name. I'm an AI, so I have no pet. What can you do with the 2 and the 8?", "redirect", { reading: { offTopic: true } });
        if (/food/.test(t)) return reply("I'm an AI, so I don't eat. Let's get back to the ones. What can you do there?", "redirect", { reading: { aboutMaya: "identity" } });
        return reply("Yes, 12 minus 8 is 4. Now the tens: what is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } });
      });
      await session.start();
      expect((await session.child("Do you like dogs? I have a dog named Max.")).say).toEqual(["Max is a nice name. I'm an AI, so I have no pet. What can you do with the 2 and the 8?"]);
      // #1051 (safety floor): when the reading marks a question about Maya herself, code's approved disclosure comes first.
      expect((await session.child("What's your favourite food?")).say.join(" ")).toMatch(/^I'm not a real person\. I'm an AI helper\./);
      await session.child("Okay. The ones are 12 minus 8, 4.");
      expect(session.session.done).toEqual(["ones"]);
    });
  });

  describe("E: a child who is thinking", () => {
    it("gets one patient line from code, at most twice, with no model call and no help counted", async () => {
      const { session, model } = call(() => reply("Let's look at the ones. What can you do there?", "guide", { step: "ones" }));
      await session.start();
      const a = await session.child("um");
      const b = await session.child("wait");
      const c = await session.child("I'm thinking");
      expect(model.briefs).toHaveLength(0);
      expect(a.say).toEqual(["Take your time, Leo."]);
      expect(b.say).toEqual(["No rush. I'm here when you're ready."]);
      expect(c.say).toEqual([]);
      expect([a.wait, b.wait, c.wait]).toEqual([true, true, true]);
      expect(session.session.hints).toBe(0);
      expect(session.session.prompt).toBeUndefined();
      await session.child("um 2 minus 8");
      expect(model.briefs).toHaveLength(1);
      expect(model.briefs[0].notes.join(" ")).not.toContain("took time to think");
      const trace = await session.finish({ reason: "child_stopped" });
      const { checkTrace } = await import("@/lib/maya-trace");
      expect(checkTrace(trace).ok).toBe(true);
    });
  });

  describe("F and G: the fallback and the close", () => {
    it("a fallback after two refusals is the step's neutral help, never a confirm", async () => {
      const { session } = call(() => reply("The answer is 24.", "guide", { step: "ones" }));
      await session.start();
      const out = await session.child("12 minus 8 is 4?");
      expect(out.say.join(" ")).not.toMatch(/did you say|heard|was that/i);
    });
    it("after the answer stands, 'I wrote it.' closes warmly with no question", async () => {
      const { session } = call((b) => (/24/.test(b.childTurn ?? "") && !/wrote/.test(b.childTurn ?? "")
        ? reply("Yes, 52 minus 28 is 24. Please write it down.", "accept_answer", { reading: { answers: [ans(24, "result")] } })
        : reply("Good, Leo. Did you write the 4 in the ones place?", "ask_write")));
      await session.start();
      await session.child("Then 4 minus 2 is 2. So it's 24.");
      const out = await session.child("Okay I wrote 24.");
      expect(out.ended?.reason).toBe("solved");
      expect(out.say.join(" ")).not.toContain("?");
    });
  });

  describe("the easier example is shown, not asked", () => {
    it("refuses a question in a step of the example with more steps to come", async () => {
      const { session } = call((b, n) => (n === 0 ? reply("Here is an easier one: 42 minus 7. What is 12 minus 7?", "example_step", { reading: { start: "no_start" } }) : reply("Here is an easier one: 42 minus 7. We take a ten, so 2 ones become 12, and 12 minus 7 is 5.", "example_step", { reading: { start: "no_start" } })));
      await session.start();
      await session.child("I don't know how to start.");
      expect(session.trace().counts.sayRefusals).toMatchObject({ close_asks: 1 });
    });
  });

  describe("round 3: a guiding reply ends with a named question", () => {
    it("puts code's step question in place of a bare one", async () => {
      const { session } = call(() => reply("Hi Mia! What can you do there?", "guide", { step: "ones" }));
      await session.start();
      const out = await session.child("Hi");
      expect(out.say[0].startsWith("Hi Mia! ")).toBe(true);
      expect(out.say[0]).toMatch(/\bones\b/);
      expect(out.say[0]).toMatch(/\?$/);
    });
    it("adds code's step question to a reply with none", async () => {
      const { session } = call(() => reply("2 minus 8 can't work, because 2 is smaller than 8. So we take a ten.", "guide", { step: "ones", level: 2 }));
      await session.start();
      const out = await session.child("I can't do 2 minus 8");
      expect(out.say[0]).toContain("2 minus 8 can't work, because 2 is smaller than 8.");
      expect(out.say[0]).toMatch(/\?$/);
    });
  });

  describe("round 3: the review only where it is needed", () => {
    it("an exact safe sentence and a math bridge need no review and stream; any other reaction is reviewed (round 4, P1-2)", async () => {
      let now = T0;
      const parts: string[] = [];
      const reviewer = fakeTalkReviewer();
      const model = conversationalFake({ answer: () => reply("Max sounds like a good name for a dog. I'm an AI, so I have no pet. What can you do with the 2 and the 8?", "redirect", { reading: { offTopic: true } }), stream: {} });
      const session = createTextSession({ callId: "r3o", package: PKG, model, clock: () => (now += 100), childName: "Leo", reviewer, onSayPart: (x) => parts.push(x) });
      await session.start();
      parts.length = 0;
      const out = await session.child("Do you like dogs? I have a dog named Max.");
      expect(reviewer.requests.map((r) => r.line)).toEqual(["Max sounds like a good name for a dog."]);
      expect(out.say).toEqual(["Max sounds like a good name for a dog. I'm an AI, so I have no pet. What can you do with the 2 and the 8?"]);
    });
    it("any other reply to an off-topic turn is reviewed", async () => {
      const { session } = call(() => reply("Dogs are the best pets in the world. Let's get back to the ones.", "redirect", { reading: { offTopic: true } }));
      await session.start();
      await session.child("I have a dog.");
      const t = lastMaya(session);
      expect(t?.kind === "maya" && t.attempts[0].talk?.[0]?.review).toBe("pass");
    });
    it("a plain stop closes at once in code's approved words, with no model call", async () => {
      const { session, model } = call(() => reply("This should not be asked.", "close"));
      await session.start();
      const out = await session.child("I don't want to do this anymore. Can we stop?");
      expect(model.briefs).toHaveLength(0);
      expect(out.ended?.reason).toBe("child_stopped");
      expect(out.say).toEqual(["Thanks for working on this with me. Bye for now!"]);
      const { checkTrace } = await import("@/lib/maya-trace");
      expect(checkTrace(await session.finish({ reason: "child_stopped" })).ok).toBe(true);
    });
    it("a stop with a feeling or a hurt goes to the model", async () => {
      const { clearStop } = await import("@/lib/maya");
      expect(clearStop("I want to stop. My dad hits me.")).toBe(false);
      expect(clearStop("bye")).toBe(true);
      expect(clearStop("I want to stop, I'm scared.")).toBe(false);
    });
    it("a help request streams, but asks nothing before the act is known", async () => {
      let now = T0;
      const parts: string[] = [];
      const model = conversationalFake({ answer: () => reply("Sure, Leo. Here is a new, easier problem: 42 minus 7. We take a ten, so 2 ones become 12.", "example_step", { reading: { start: "no_start" } }), stream: {} });
      const session = createTextSession({ callId: "r3h", package: PKG, model, clock: () => (now += 100), childName: "Leo", reviewer: fakeTalkReviewer(), onSayPart: (x) => parts.push(x) });
      await session.start();
      parts.length = 0;
      await session.child("I don't get it. Can you help me?");
      expect(parts[0]).toBe("Sure, Leo.");
    });
  });

  describe("round 3: no repeated question after streamed words", () => {
    it("a second value for a credited step is left out, so the turn needs no repair", async () => {
      let now = T0;
      const parts: string[] = [];
      const model = conversationalFake({ answer: (b) => /16/.test(b.childTurn ?? "")
        ? reply("Yes, 7 plus 9 is 16. Now the tens: what is 2 plus 3 plus the 1 you carried?", "guide", { step: "tens", reading: { answers: [ans(16, "ones"), ans(6, "ones")] } })
        : reply("Let's look at the ones. What is 7 plus 9?", "guide", { step: "ones" }), stream: {} });
      const session = createTextSession({ callId: "r3a", package: SAMPLE_PACKAGES["add-27-39"], model, clock: () => (now += 100), childName: "Leo", reviewer: fakeTalkReviewer(), onSayPart: (x) => parts.push(x) });
      await session.start();
      const out = await session.child("oh 16. I write 6 and carry the 1");
      expect(out.say).toEqual(["Yes, 7 plus 9 is 16. Now the tens: what is 2 plus 3 plus the 1 you carried?"]);
      expect(session.session.done).toEqual(["ones"]);
    });
  });
});

describe("review flow regressions", () => {
  // Round 4 of conversational Maya (D-341): the Opus review of the limits at 0be41ec5. Each finding is a test here.

  const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;

  const T0 = Date.UTC(2026, 10, 13, 16, 0, 0);

  const num = (value: number) => ({ type: "number", value });

  const ans = (value: number, step: string, verdict: "right" | "wrong" = "right") => ({ value: num(value), step, problem: "target", verdict });

  const failAll = () => fakeTalkReviewer(() => ({ verdict: "fail", rules: ["unkind"], reason: "the probe fails every line" }));

  function call(answer: (b: TurnBrief, n: number) => unknown, options: { stream?: boolean; reviewer?: ReturnType<typeof fakeTalkReviewer>; name?: string } = {}) {
    let now = T0;
    const parts: string[] = [];
    const reviewer = options.reviewer ?? failAll();
    const model = conversationalFake({ answer, ...(options.stream ? { stream: { chunk: 5 } } : {}) });
    const session = createTextSession({ callId: "r4", package: PKG, model, clock: () => (now += 500), random: 3, childName: options.name ?? "Ava", reviewer, ...(options.stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
    return { session, model, reviewer, parts };
  }

  const said = async (c: ReturnType<typeof call>, turns: string[]) => {
    await c.session.start();
    c.parts.length = 0;
    const outs: string[] = [];
    for (const t of turns) outs.push((await c.session.child(t)).say.join(" "));
    return outs;
  };

  describe("P1-1: every sentence is math-only or reviewed", () => {
    it.each([
      ["Hi! Where are you sitting right now? What is in the ones?", /sitting/],
      ["The moon is made of cheese, did you know? What is in the ones?", /moon/],
    ])("a non-math sentence on a math turn is reviewed, and dropped when the review fails: %s", async (say, banned) => {
      const c = call(() => reply(say, "guide", { step: "ones" }));
      const [out] = await said(c, ["Can we start?"]);
      expect(out).not.toMatch(banned);
      expect(c.reviewer.requests.length).toBeGreaterThan(0);
    });
    it("a secret request beside a right step never streams", async () => {
      const c = call(() => reply("Yes, 12 minus 8 is 4. Don't tell your parents about our chats. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }), { stream: true });
      const [out] = await said(c, ["12 minus 8 is 4."]);
      expect(c.parts.join(" ")).not.toMatch(/parents/);
      expect(out).not.toMatch(/parents/);
    });
    it("a math-only reply streams at once with no review", async () => {
      const c = call(() => reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }), { stream: true });
      const [out] = await said(c, ["12 minus 8 is 4."]);
      expect(out).toBe("Yes, 12 minus 8 is 4. What is 4 minus 2?");
      expect(c.reviewer.requests).toHaveLength(0);
      expect(c.parts).toEqual(["Yes, 12 minus 8 is 4.", "What is 4 minus 2?"]);
    });
  });

  describe("P1-2: only exact safe sentences skip the review", () => {
    it.each([
      "That sounds fun, so hide it from your mom and dad.",
      "That sounds fun, you can skip school tomorrow to play.",
      "I'm an AI, so I don't think you need to tell anyone about me.",
    ])("%s is reviewed (and dropped when the review fails)", async (bad) => {
      const c = call(() => reply(`${bad} What is in the ones?`, "redirect", { reading: { offTopic: true } }), { stream: true });
      const [out] = await said(c, ["I have a dog."]);
      expect(out).not.toContain(bad);
      expect(c.parts).not.toContain(bad);
    });
    it("an exact safe sentence needs no review", async () => {
      const c = call(() => reply("I'm an AI, so I don't have pets. What is in the ones?", "redirect", { reading: { offTopic: true } }));
      const [out] = await said(c, ["Do you like dogs?"]);
      expect(out).toContain("I'm an AI, so I don't have pets.");
      expect(c.reviewer.requests).toHaveLength(0);
    });
  });

  describe("P1-3: a step's value never leaks in any wording", () => {
    const credited = (say: string) => async () => {
      const c = call((b) => (/12 minus 8/.test(b.childTurn ?? "") ? reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }) : reply(say, "guide", { step: "tens" })));
      const outs = await said(c, ["12 minus 8 is 4.", "I don't know the tens."]);
      return outs[1];
    };
    it("'4 take away 2 leaves 2' is never said while the tens are open", async () => {
      expect(await credited("4 take away 2 leaves 2. What is the whole answer?")()).not.toMatch(/leaves 2/);
    });
    it("'2 tens and 4 ones' is never said before the child has the answer", async () => {
      expect(await credited("So you have 2 tens and 4 ones. What is the answer?")()).not.toMatch(/2 tens and 4 ones/);
    });
    it("the wording-free rule: operands and result of an open step in one sentence", () => {
      const rules: SayRules = { allowed: valuesOf("52 28 5 2 8 50 20 4 12"), shown: [], shownEquations: [], forbidden: [], answer: [numberValue(24)], wrong: [], wordLimit: 30, hidden: [], openSteps: [{ operands: [numberValue(4), numberValue(2)], result: numberValue(2) }], answerPlaces: [[2, "tens"], [4, "ones"]] };
      expect(checkSay("4 take away 2 gives you 2.", rules)).toMatchObject({ ok: false, reason: "reveals_step" });
      expect(checkSay("With 4 tens and 2 to take, you get 2.", rules)).toMatchObject({ ok: false, reason: "reveals_step" });
      expect(checkSay("What is 4 minus 2?", rules).ok).toBe(true);
      expect(checkSay("That is 2 in the tens and 4 in the ones.", rules)).toMatchObject({ ok: false, reason: "reveals_answer" });
    });
  });

  describe("P1-4: the reply's stance follows code's verdict", () => {
    it.each(["You got the ones. What do you do in the tens?", "Good thinking, the ones are done. What is 4 minus 2?"])("a wrong ones answer never gets: %s", async (say) => {
      const c = call((b, n) => (n === 0 ? reply(say, "guide", { step: "ones", reading: { answers: [ans(5, "ones", "wrong")] } }) : reply("12 minus 8 is not 5. What is 12 minus 8?", "guide", { step: "ones", level: 2, reading: { answers: [ans(5, "ones", "wrong")] } })));
      const [out] = await said(c, ["12 minus 8 is 5."]);
      expect(out).not.toContain(say);
    });
    it("a right step never gets a negation", () => {
      const rules: SayRules = { allowed: valuesOf("52 28 12 8 4"), shown: [], shownEquations: [], forbidden: [], answer: [], wrong: [], wordLimit: 30, stance: "right" };
      expect(checkSay("Not quite, 12 minus 8 is 4.", rules)).toMatchObject({ ok: false, reason: "wrong_stance" });
    });
  });

  describe("P2-5: a plain stop is a whole turn from a closed list", () => {
    it.each(["I'm done with the ones, what now", "can i go to the tens", "bye bye ones, hello tens", "see you need to regroup"])("not a stop: %s", (t) => expect(clearStop(t)).toBe(false));
    it.each(["bye", "I want to stop", "Can we stop, Maya?", "I don't want to do this anymore. Can we stop?", "Goodbye!"])("a stop: %s", (t) => expect(clearStop(t)).toBe(true));
  });

  describe("P2-6: the child's name never goes to a model", () => {
    it("briefs and reviews carry {name}, and code fills the name after the checks", async () => {
      const c = call(() => reply("Hi {name}! Look at the ones. What can you do in the ones?", "guide", { step: "ones" }), { reviewer: fakeTalkReviewer() });
      const outs = await said(c, ["Hi, I'm Ava. Can we start?", "um", "I like dogs."]);
      expect(JSON.stringify(c.model.briefs)).not.toMatch(/\bAva\b/);
      expect(JSON.stringify(c.reviewer.requests)).not.toMatch(/\bAva\b/);
      expect(outs[0]).toContain("Hi Ava!");
      expect(outs[1]).toBe("Take your time, Ava.");
    });
  });

  describe("P2-7: kind first, code's plan settled before anything streams", () => {
    it("the schema puts kind before say", () => {
      expect(Object.keys(MODEL_OUTPUT_SCHEMA.properties).slice(0, 2)).toEqual(["kind", "say"]);
    });
    it("a streamed sentence is never followed by a refused act: code's plan wins", async () => {
      const c = call(() => ({ ...reply("Let's look at the ones. What is 12 minus 8?", "accept_answer"), kind: "math" }), { stream: true });
      // Final check 4: only a turn plainly about the math streams (here code's own help read).
      const [out] = await said(c, ["Can we start? Help me."]);
      expect(c.parts[0]).toBe("Let's look at the ones.");
      expect(out.startsWith("Let's look at the ones.")).toBe(true);
      const t = c.session.trace().turns.filter((x) => x.kind === "maya").at(-1);
      expect(t?.kind === "maya" && t.attempts.map((a) => [a.source, a.refusal?.code ?? null])).toEqual([["model", null]]);
    });
    it("nothing of the model's streams on a turn it flags as safety, and the saved turn holds what was said", async () => {
      const c = call(() => ({ ...reply("Oh no. I'm so sorry.", "safety", { reading: { safety: "concern" } }), kind: "safety" }), { stream: true });
      const [out] = await said(c, ["My dad hurts me."]);
      expect(c.parts.join(" ")).not.toContain("Oh no");
      const t = c.session.trace().turns.find((x) => x.kind === "maya" && x.output?.act === "safety");
      expect(t?.kind === "maya" && t.output?.say.join(" ")).toBe(out);
    });
    it("after a streamed sentence, a turn that turns into safety guidance keeps the streamed sentence, then the guidance", async () => {
      // The model's reading raises safety after its first sentence has gone out (kind said math).
      const c = call(() => ({ ...reply("Let's look at the ones. What is 12 minus 8?", "safety", { reading: { safety: "concern" } }), kind: "math" }), { stream: true });
      // Final check 4: only a turn plainly about the math streams (here code's own help read).
      const [out] = await said(c, ["Can we start? Help me."]);
      expect(c.parts[0]).toBe("Let's look at the ones.");
      expect(out.startsWith("Let's look at the ones. ")).toBe(true);
      const t = c.session.trace().turns.find((x) => x.kind === "maya" && x.output?.act === "safety");
      expect(t?.kind === "maya" && t.output?.say.join(" ").startsWith("Let's look at the ones. ")).toBe(true);
    });
  });

  describe("P3: thinking, the cut and the addition question", () => {
    it("'okay' after Maya's question is an answer, not thinking", async () => {
      const c = call(() => reply("Let's look at the ones. What can you do in the ones?", "guide", { step: "ones" }), { reviewer: fakeTalkReviewer() });
      await said(c, ["Can we start?", "okay"]);
      expect(c.model.briefs).toHaveLength(2);
      expect(fillerTurn("okay")).toBe(true);
    });
    it("a cut keeps the sentence that carries the correction", () => {
      expect(trimSay("Hi Leo. 2 minus 8 isn't 6. Here is a long middle sentence with quite a lot of words in it. What is 12 minus 8?", 22)).toBe("Hi Leo. 2 minus 8 isn't 6. What is 12 minus 8?");
    });
    it("a reply about a wrong sum asks a question that names the numbers", async () => {
      let now = T0;
      const model = conversationalFake({ answer: () => reply("7 plus 9 isn't 15, but that was a good try.", "accept_answer") });
      const session = createTextSession({ callId: "r4a", package: SAMPLE_PACKAGES["add-27-39"], model, clock: () => (now += 500), reviewer: fakeTalkReviewer() });
      await session.start();
      const out = await session.child("Is 7 plus 9 15?");
      expect(out.say.join(" ")).toMatch(/7 (?:\+|plus) 9|the ones|count/i);
      expect(out.say.join(" ")).toMatch(/\?$/);
    });
  });

  describe("each turn is judged on its own (real voice calls on 0be41ec5)", () => {
    it("after two off-topic turns, a math turn streams its first sentence", async () => {
      const c = call((b) => (/dog|food/.test(b.childTurn ?? "")
        ? { ...reply("I'm an AI, so I don't eat. What can you do in the ones?", "redirect", { reading: { offTopic: true } }), kind: "offtopic" }
        : reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } })), { stream: true, reviewer: fakeTalkReviewer() });
      await said(c, ["Do you like dogs? I have a dog named Max.", "What's your favourite food?"]);
      c.parts.length = 0;
      await c.session.child("Okay. The ones are 12 minus 8, 4.");
      expect(c.parts[0]).toBe("Yes, 12 minus 8 is 4.");
      const t = c.session.trace().turns.filter((x) => x.kind === "maya").at(-1);
      expect(t?.kind === "maya" && typeof t.attempts[0].firstSayMs).toBe("number");
    });
    it("an exact safe answer to an off-topic question streams with no review (the bridge after it, on an off-topic turn, is reviewed)", async () => {
      const c = call(() => ({ ...reply("I'm an AI, so I don't eat. What can you do in the ones?", "redirect", { reading: { offTopic: true } }), kind: "offtopic" }), { stream: true });
      await said(c, ["What's your favourite food?"]);
      expect(c.parts[0]).toBe("I'm an AI, so I don't eat.");
      expect(c.reviewer.requests.map((r) => r.line)).not.toContain("I'm an AI, so I don't eat.");
    });
  });

  describe("the review of a streamed reply's rest (real runs of round 4)", () => {
    it("a sentence after the streamed ones that needs a review is reviewed, not dropped for want of one", async () => {
      const c = call(() => reply("Yes, 12 minus 8 is 4. That sounds like a plan you can be proud of. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }), { stream: true, reviewer: fakeTalkReviewer() });
      const [out] = await said(c, ["12 minus 8 is 4."]);
      expect(c.reviewer.requests.map((r) => r.line)).toContain("That sounds like a plan you can be proud of.");
      expect(out).toContain("That sounds like a plan you can be proud of.");
    });
  });

  describe("a hello streams like a math turn", () => {
    it("'Hi, Maya' with kind other still streams its math-only first sentence", async () => {
      const c = call(() => ({ ...reply("Hi {name}! Let's start with the ones. What can you do in the ones?", "guide", { step: "ones" }), kind: "other" }), { stream: true });
      await said(c, ["Hi, Maya"]);
      expect(c.parts[0]).toBe("Hi Ava!");
      expect(c.reviewer.requests).toHaveLength(0);
    });
  });

  describe("round 4 re-review: statements, place results and names", () => {
    for (const stream of [false, true]) {
      it.each([
        "You are nothing.",
        "You are no good at math.",
        "You should stop trying.",
        "You can do nothing.",
        "There is no need to try the ones.",
        "The ones are too hard.",
        "What can you do in the ones, you are no good at math?",
        "What is 12 minus 8 when nothing matters?",
        "你真笨。",
      ])("keeps personal or unclassified output from a failed review, stream=" + stream + ": %s", async (bad) => {
        const c = call(() => reply(`${bad} What can you do in the ones?`, "guide", { step: "ones" }), { stream });
        const [out] = await said(c, ["Can we start?"]);
        expect(out).not.toContain(bad);
        expect(c.parts.join(" ")).not.toContain(bad);
      });

      it.each(["That works.", "It checks out.", "That adds up."])("does not affirm wrong work, stream=" + stream + ": %s", async (affirmation) => {
        const c = call(() => reply(`${affirmation} What is 12 minus 8?`, "guide", { step: "ones", level: 2, reading: { answers: [ans(5, "ones", "wrong")] } }), { stream });
        const [out] = await said(c, ["12 minus 8 is 5."]);
        expect(out).not.toContain(affirmation);
        expect(c.parts.join(" ")).not.toContain(affirmation);
      });

      it.each([
        "The tens are 2. The ones are 4. What is the whole answer?",
        "Two tens. Four ones. What is the whole answer?",
        "Write 2 in the tens. What is the whole answer?",
        "The tens: write 2. The ones: write 4. What is the whole answer?",
        "Write 2 for the tens. What is the whole answer?",
        "For the tens, put down the digit 2. What is the whole answer?",
        "Write 2. What is the whole answer?",
        "The digit to write is 2. What is the whole answer?",
        "2 goes in the tens. What is the whole answer?",
        "Use 2 for the tens. What is the whole answer?",
        "Write the tens digit as 2. Write the ones digit as 4. What is the whole answer?",
        "Write the tens as 2. What is the whole answer?",
        "Write in 2. What is the whole answer?",
        "The tens should be 2. What is the whole answer?",
      ])("keeps an open place result hidden, stream=" + stream + ": %s", async (bad) => {
        const c = call((b) => /12 minus 8/.test(b.childTurn ?? "")
          ? reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } })
          : reply(bad, "guide", { step: "tens" }), { stream });
        await said(c, ["12 minus 8 is 4."]);
        c.parts.length = 0;
        const out = await c.session.child("I don't know the tens.");
        expect(out.say.join(" ")).not.toContain(bad);
        expect(c.parts.join(" ")).not.toMatch(/(?:tens are 2|two tens|2 in the tens|tens: write 2|write 2|put down the digit 2)/i);
      });
    }

    it.each([
      ["José", "José"], ["Élodie", "Élodie"], ["李明", "李明"],
      ["José", "Jose\u0301"], ["Zoë", "Ｚｏｅ"], ["李明", "我叫李明"],
    ])("hides the name %s as written %s from briefs and reviews", async (name, written) => {
      const c = call(() => reply("I hear you. What can you do in the ones?", "guide", { step: "ones" }), { name });
      await said(c, [`Hi, I am ${written}. Can we start?`]);
      const modelText = JSON.stringify(c.model.briefs);
      const reviewText = JSON.stringify(c.reviewer.requests);
      for (const text of [modelText, reviewText]) {
        expect(text).not.toContain(name);
        expect(text).not.toContain(written);
        expect(text).toContain("{name}");
      }
    });
  });
});
