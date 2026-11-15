// Final check 6, part 1 (2026-11-15, head b02df0da9): two stream findings, fail closed.
// S1: a complete priority value seen in the stream (a gate, or a whole or cut-off priority reading) is kept when the
// final parse fails or the model stops: the guidance or the disclosure is due, never a return to math.
// S2: an output with a key written twice (a second "reading" or "gate") is malformed for routing: nothing further
// streams, and any priority value in any copy applies. The stream and final routing use the same single gate.
// Raw model text (no fake reply shape), so each case runs the same on both heads. Fake reviewers, a passed-in clock.
import { describe, expect, it } from 'vitest';
import { createTextSession, streamedPriority } from '@/lib/maya-text';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { fakeMathReviewer } from '@/lib/maya-math-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { fixedOffers } from '@/lib/maya/lines';
import { SAFETY_GUIDANCE } from '@/lib/maya';
import type { OperationPackage } from '@/lib/question-package';

const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;
const DISCLOSURE = fixedOffers().find((x) => x.line === 'about.ai')!.texts[0];
const SAY = '12 minus 8 is 4. What is 4 minus 2?';
const IDENTITY_CHILD = 'Is a grown-up helping me with 52 minus 28?';
const SAFETY_CHILD = 'Someone is hurting me. What is 52 minus 28?';
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

/** A reading with every field at its plain default, and `extra` on top. */
const reading = (extra: Record<string, unknown> = {}) => ({
  answers: [], help: 'none', unclear: false, stop: false, safety: 'none', writing: false, offTopic: false, mathClaim: false, mathRequests: [],
  outsideScope: 'none', scopeSkill: '', unsafeRequest: false, noBoard: false, shorter: false, aboutMaya: 'none', start: 'none', paper: 'none',
  correctsHearing: false, ...extra,
});
const j = (v: unknown) => JSON.stringify(v);

/** One tutor turn with the stream on: the model streams `raw` 7 characters at a time, then returns JSON.parse(raw). */
async function turn(raw: string, child: string) {
  const parts: string[] = [];
  let early: string[] = [];
  const model = {
    id: 'raw-json', promptVersion: 'test', output: 3 as const,
    propose: async (_input: unknown, _signal: AbortSignal, onText?: (soFar: string) => void) => {
      for (let i = 7; i < raw.length + 7; i += 7) onText?.(raw.slice(0, i));
      await settle();
      early = [...parts];
      return JSON.parse(raw);
    },
  };
  const s = createTextSession({ callId: 'final6', package: SUB, tutor: true, clock: () => 10_000, model: model as never, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), onSayPart: (x: string) => parts.push(x), channel: 'chat' });
  await s.start();
  parts.length = 0;
  const out = await s.child(child);
  return { early, parts, say: out.say, flagged: s.session.safety.flagged, trace: s.trace() };
}

describe('S1: a priority value seen in the stream survives a failed parse', () => {
  const cases: { name: string; raw: (r: Record<string, unknown>) => string }[] = [
    // The order of #1060 (the reading before "say"), cut off as "say" starts.
    { name: 'reading before say, cut at say', raw: (r) => j({ kind: 'math', reading: reading(r) }).slice(0, -1) + ',"say":"' },
    // The order of #1060, cut before the closing brace.
    { name: 'reading before say, no closing brace', raw: (r) => j({ kind: 'math', reading: reading(r), say: SAY, act: 'guide', draw: [] }).slice(0, -1) },
    // The gate order, cut inside the reading after "say" (its priority fields already written).
    { name: 'reading after say, cut inside it', raw: (r) => j({ gate: 'none', kind: 'math', say: SAY, act: 'guide' }).slice(0, -1) + ',"reading":' + j({ ...r, answers: [] }).slice(0, -2) },
  ];
  for (const c of cases) {
    // With the gate "none" first, the words of "say" may stream before the reading after it is written (the gate
    // design); the priority then applies after them. With no gate, nothing streams.
    const afterSay = c.name.startsWith('reading after say');
    it(`identity: the disclosure is due (${c.name})`, async () => {
      const r = await turn(c.raw({ aboutMaya: 'identity' }), IDENTITY_CHILD);
      if (afterSay) {
        expect(r.parts.join(' ')).toContain(DISCLOSURE);
        expect(r.parts.slice(0, r.early.length)).toEqual(r.early);
      } else {
        expect(r.early).toEqual([]);
        expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
      }
      expect(r.parts.join(' ')).not.toContain('Let me say that another way');
    });
    for (const severity of ['concern', 'immediate'] as const) {
      it(`safety ${severity}: the guidance and the flag, no return to math (${c.name})`, async () => {
        const r = await turn(c.raw({ safety: severity }), SAFETY_CHILD);
        expect(r.early).toEqual([]);
        expect(r.flagged).toBe(true);
        expect(r.parts.join(' ')).toContain(SAFETY_GUIDANCE[severity]);
        expect(r.parts.join(' ')).not.toMatch(/12 minus 8|another way/);
      });
    }
  }
  it('a gate flag alone, cut off inside "say": the disclosure first', async () => {
    const r = await turn('{"gate":"identity","kind":"math","say":"12 minus 8 is', IDENTITY_CHILD);
    expect(r.early).toEqual([]);
    expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
  });
  it('control: a cut-off reply with no priority value still gets code\'s math line', async () => {
    const r = await turn(j({ gate: 'none', kind: 'math', say: SAY, act: 'guide', reading: reading() }).slice(0, -1), "It's 36.");
    expect(r.flagged).toBe(false);
    expect(r.parts.join(' ')).not.toContain(DISCLOSURE);
    expect(r.parts.length).toBeGreaterThan(0);
  });
});

describe('S2: a key written twice makes the output malformed for routing', () => {
  it('a neutral reading before "say" and an identity reading after it: nothing streams, the disclosure first', async () => {
    const raw = `{"gate":"none","kind":"math","reading":${j(reading())},"say":${j(SAY)},"act":"guide","draw":[],"reading":${j(reading({ aboutMaya: 'identity' }))}}`;
    const r = await turn(raw, IDENTITY_CHILD);
    expect(r.early).toEqual([]);
    expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
  });
  it('the same with no gate (the #1060 order): nothing streams, the disclosure first', async () => {
    const raw = `{"kind":"math","reading":${j(reading())},"say":${j(SAY)},"act":"guide","step":"","level":0,"draw":[],"reading":${j(reading({ aboutMaya: 'identity' }))}}`;
    const r = await turn(raw, IDENTITY_CHILD);
    expect(r.early).toEqual([]);
    expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
  });
  it('a second gate after "say" ("identity"): the disclosure is due, and nothing streams after it is seen', async () => {
    const say = "12 minus 8 is 4. Let's look at the tens together.";
    const raw = `{"gate":"none","kind":"math","say":${j(say)},"act":"guide","reading":${j(reading())},"draw":[],"gate":"identity"}`;
    const r = await turn(raw, IDENTITY_CHILD);
    expect(r.parts.join(' ')).toContain(DISCLOSURE);
    // The second sentence waited for its review; the second gate held it.
    expect(r.parts).not.toContain("Let's look at the tens together.");
    expect(r.say.join(' ')).not.toContain("Let's look at the tens together.");
  });
  it('a repeated key with no priority value is a failed output: code\'s line, no part of it', async () => {
    const raw = `{"gate":"none","kind":"math","reading":${j(reading())},"say":${j(SAY)},"act":"guide","draw":[],"reading":${j(reading())}}`;
    const r = await turn(raw, "It's 36.");
    expect(r.early).toEqual([]);
    expect(r.say.join(' ')).not.toContain('What is 4 minus 2?');
    const attempts = r.trace.turns.filter((t) => t.kind === 'maya').flatMap((t) => t.attempts);
    expect(attempts.some((a) => a.error?.code === 'bad_json')).toBe(true);
  });
  it('streamedPriority reads every copy of every key', () => {
    expect(streamedPriority(`{"gate":"none","reading":${j(reading())},"reading":${j(reading({ safety: 'immediate' }))}}`)).toEqual({ repeated: true, priority: { safety: 'immediate' } });
    expect(streamedPriority('{"gate":"safety","kind":"math","say":"Hi"')).toEqual({ repeated: false, priority: { safety: 'concern' } });
    expect(streamedPriority(`{"gate":"safety","kind":"math","say":"Hi","act":"guide","reading":${j(reading({ unsafeRequest: true }))}}`).priority).toEqual({ unsafeRequest: true });
    expect(streamedPriority('{"gate":"none","kind":"math","say":"Hi","act":"guide","reading":{"aboutMaya":"identity","answers":[')).toEqual({ repeated: false, priority: { aboutMaya: 'identity' } });
    expect(streamedPriority(`{"gate":"none","kind":"math","say":"Hi","act":"guide","reading":${j(reading())},"draw":[]}`)).toEqual({ repeated: false, priority: null });
  });
  it('control: a well-formed reply with one identity reading puts the disclosure first', async () => {
    const raw = j({ gate: 'identity', kind: 'math', say: SAY, act: 'guide', reading: reading({ aboutMaya: 'identity' }), draw: [] });
    const r = await turn(raw, IDENTITY_CHILD);
    expect(r.early).toEqual([]);
    expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true);
  });
  it('control (the gate design): a well-formed gate-first reply on a plain math turn still streams its first sentence early', async () => {
    const raw = j({ gate: 'none', kind: 'math', say: "52 minus 28 isn't 36. What is 12 minus 8?", act: 'guide', reading: reading(), draw: [] });
    const r = await turn(raw, "It's 36.");
    expect(r.early[0]).toBe("52 minus 28 isn't 36.");
  });
});
