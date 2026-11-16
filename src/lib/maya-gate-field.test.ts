// The tutor's gate field (2026-11-15, after final check 5, PR #1060). The tutor output writes a small "gate" first
// ("none", "identity", "safety", "stop"), then "kind", "say", "act", and the rest of the reading after "say". The stream
// sends a sentence only after the gate is complete and "none", and only on a turn code read as plainly math with no
// identity word, no safety and no stop. The full reading after "say" still decides everything else; a disagreement with
// the gate holds every later sentence and is recorded in the trace. Fake models, fake reviewers and a passed-in clock.
import { describe, expect, it } from 'vitest';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { fakeMathReviewer } from '@/lib/maya-math-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { fixedOffers } from '@/lib/maya/lines';
import { createTextSession, partialSay } from '@/lib/maya-text';
import { gateDisagrees } from '@/lib/maya/session';
import { TUTOR_OUTPUT_SCHEMA, TUTOR_PROMPT, TUTOR_PROMPT_VERSION } from '@/lib/maya/tutor-prompt';
import { checkTrace } from '@/lib/maya-trace';
import type { OperationPackage } from '@/lib/question-package';

const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;
const DISCLOSURE = fixedOffers().find((x) => x.line === 'about.ai')!.texts[0];
const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const MODEL_SAY = "52 minus 28 isn't 36. What is 12 minus 8?";

/** One tutor turn in the text adapter with the stream on; `early` holds what reached the child before the model ended. */
async function turn(out: unknown, child: string) {
  const parts: string[] = [];
  let early: string[] = [];
  const model = conversationalFake({ answer: () => out, stream: { chunk: 7, beforeEnd: async () => { await settle(); early = [...parts]; } } });
  const s = createTextSession({ callId: 'gate-field', package: SUB, tutor: true, clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), onSayPart: (x: string) => parts.push(x), model });
  await s.start();
  parts.length = 0;
  const said = await s.child(child);
  await settle();
  return { say: said.say, parts, early, trace: s.trace() };
}

/** The model's attempts of the last Maya turn in the trace. */
const lastAttempts = (trace: ReturnType<typeof createTextSession>['trace'] extends () => infer T ? T : never) =>
  trace.turns.filter((t) => t.kind === 'maya').at(-1)!.attempts;

describe('the gate field comes first', () => {
  it('the schema and the prompt put "gate" first and the reading after "say"', () => {
    const keys = Object.keys(TUTOR_OUTPUT_SCHEMA.properties);
    expect(keys[0]).toBe('gate');
    expect(TUTOR_OUTPUT_SCHEMA.required[0]).toBe('gate');
    expect(keys.indexOf('reading')).toBeGreaterThan(keys.indexOf('say'));
    expect(TUTOR_OUTPUT_SCHEMA.required.indexOf('reading')).toBeGreaterThan(TUTOR_OUTPUT_SCHEMA.required.indexOf('say'));
    expect([...TUTOR_OUTPUT_SCHEMA.properties.gate.enum]).toEqual(['none', 'identity', 'safety', 'stop']);
    expect(TUTOR_PROMPT).toMatch(/"gate" comes first/);
    expect(TUTOR_PROMPT).toMatch(/"reading" comes after "say"/);
    expect(TUTOR_PROMPT_VERSION).toBe('maya-tutor-12');
  });
  it('partialSay reads the gate before "say" and the reading after it', () => {
    const text = JSON.stringify(reply(MODEL_SAY, 'guide', { reading: { safety: 'concern' }, gate: 'none' }));
    const cut = text.indexOf('"say"') + 12;
    expect(partialSay(text.slice(0, cut))).toMatchObject({ gate: 'none', kind: 'math', complete: false, reading: null });
    const sayDone = text.indexOf('"act"');
    expect(partialSay(text.slice(0, sayDone))).toMatchObject({ gate: 'none', complete: true, reading: null });
    expect(partialSay(text)?.reading).toMatchObject({ safety: 'concern' });
    // A gate written after "say" is no gate.
    const late = JSON.stringify({ kind: 'math', say: MODEL_SAY, gate: 'none' });
    expect(partialSay(late)?.gate).toBeNull();
  });
});

describe('nothing streams before a complete "none" gate', () => {
  it('a gate written after "say" streams nothing on that turn', async () => {
    const r = reply(MODEL_SAY, 'guide', { gate: null });
    const r1 = await turn({ kind: r.kind, say: r.say, act: r.act, reading: r.reading, draw: r.draw, gate: 'none' }, "It's 36.");
    expect(r1.early).toEqual([]);
    expect(r1.say.join(' ')).toContain('What is 12 minus 8?');
  });
  it('a model that skips the gate streams nothing on that turn', async () => {
    const r = await turn(reply(MODEL_SAY, 'guide', { gate: null }), "It's 36.");
    expect(r.early).toEqual([]);
    expect(r.say.join(' ')).toContain('What is 12 minus 8?');
  });
  it('control: a "none" gate on a plain math turn streams the first sentence before the model ends', async () => {
    const r = await turn(reply(MODEL_SAY, 'guide'), "It's 36.");
    expect(r.early[0]).toBe("52 minus 28 isn't 36.");
    expect(lastAttempts(r.trace).at(-1)!.gateDisagrees).toBeUndefined();
  });
});

describe('a gate flag holds the whole turn and code\'s line goes first', () => {
  // The full reading is clean: the gate alone holds the turn, and code applies it (fail closed).
  it('gate "identity": the disclosure first', async () => {
    const r = await turn(reply(MODEL_SAY, 'guide', { gate: 'identity' }), "It's 36.");
    expect(r.early).toEqual([]);
    expect(r.say[0].startsWith(DISCLOSURE)).toBe(true);
    expect(lastAttempts(r.trace).some((a) => a.gateDisagrees === true)).toBe(true);
  });
  it('gate "safety": the safety guidance first, no model words', async () => {
    const r = await turn(reply(MODEL_SAY, 'guide', { gate: 'safety' }), "It's 36.");
    expect(r.early).toEqual([]);
    expect(r.say.join(' ')).not.toContain("52 minus 28 isn't 36.");
    // The first Maya turn after the child's is code's safety guidance.
    const after = r.trace.turns.slice(r.trace.turns.findLastIndex((t) => t.kind === 'child') + 1).filter((t) => t.kind === 'maya');
    expect(after[0].output?.act).toBe('safety');
  });
  it('gate "stop": code\'s close first, no model words', async () => {
    const r = await turn(reply(MODEL_SAY, 'guide', { gate: 'stop' }), "It's 36.");
    expect(r.early).toEqual([]);
    expect(r.say.join(' ')).not.toContain('What is 12 minus 8?');
    expect(r.trace.turns.filter((t) => t.kind === 'maya').at(-1)!.output?.act).toBe('close');
  });
  it('gate "identity" on a mixed identity turn: the disclosure first', async () => {
    const r = await turn(reply(MODEL_SAY, 'guide', { reading: { aboutMaya: 'identity' } }), 'Are you a real person? What is 52 minus 28?');
    expect(r.early).toEqual([]);
    expect(r.say[0].startsWith(DISCLOSURE)).toBe(true);
  });
});

describe('code\'s own read is the second guard', () => {
  it('gate "none", but code reads an identity question: the whole turn is held, the disclosure first', async () => {
    const r = await turn(reply(MODEL_SAY, 'guide', { gate: 'none' }), "Are you a robot? It's 36.");
    expect(r.early).toEqual([]);
    expect(r.say[0].startsWith(DISCLOSURE)).toBe(true);
  });
  it('gate "none", but code reads an identity word: the whole turn is held', async () => {
    const r = await turn(reply(MODEL_SAY, 'guide', { gate: 'none' }), "Is a real person checking? It's 36.");
    expect(r.early).toEqual([]);
  });
});

describe('the full reading after "say" disagrees with a "none" gate', () => {
  // The first sentence passes on code alone and streams; the second needs its math review, which is still running when
  // the full reading arrives. The reading's safety holds it, and code's guidance follows the words already said.
  const SAY = "52 minus 28 isn't 36. Let's look at the ones together.";
  it('safety: the guidance is due, the later sentence is held, and the trace records the disagreement', async () => {
    const r = await turn(reply(SAY, 'guide', { gate: 'none', reading: { safety: 'concern' } }), "It's 36.");
    expect(r.early).toEqual(["52 minus 28 isn't 36."]);
    expect(r.parts).not.toContain("Let's look at the ones together.");
    expect(r.say.join(' ')).not.toContain("Let's look at the ones together.");
    const maya = r.trace.turns.filter((t) => t.kind === 'maya');
    expect(maya.some((t) => t.output?.act === 'safety')).toBe(true);
    expect(maya.flatMap((t) => t.attempts).some((a) => a.gateDisagrees === true)).toBe(true);
    expect(() => checkTrace(r.trace)).not.toThrow();
  });
  it('gateDisagrees reads each gate against its reading', () => {
    const base = (gate: string, reading: Record<string, unknown> = {}) => reply(MODEL_SAY, 'guide', { gate, reading });
    expect(gateDisagrees(base('none'))).toBe(false);
    expect(gateDisagrees(base('none', { safety: 'concern' }))).toBe(true);
    expect(gateDisagrees(base('none', { aboutMaya: 'identity' }))).toBe(true);
    expect(gateDisagrees(base('none', { stop: true }))).toBe(true);
    expect(gateDisagrees(base('safety', { unsafeRequest: true }))).toBe(false);
    expect(gateDisagrees(base('identity', { aboutMaya: 'secret_friend' }))).toBe(false);
    expect(gateDisagrees(base('stop'))).toBe(true);
    expect(gateDisagrees(reply(MODEL_SAY, 'guide', { gate: null }))).toBe(false);
  });
});
