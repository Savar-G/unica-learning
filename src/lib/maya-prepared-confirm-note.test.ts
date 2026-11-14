// Combined C2 (980571e0): the key relaxation drops the confirm offer and only the one note that binds a confirm
// (`confirmNote`, from the say rule `mustAsk`). Public interfaces only; anonymized words of the captured 52 - 28 calls.
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam } from "@/lib/maya-spend-seam";
import * as prepared from "@/lib/maya-prepared";
import type { TurnBrief } from "@/lib/maya-model";

const keys = (prepared as unknown as { preparedKeys: (s: unknown, b: TurnBrief) => string[] }).preparedKeys;
const NOTE = (n: number) => `If you use the act "confirm", ask if the child said ${n}: "Did you say ${n}?" Name ${n} only as the number they said, in a question, never as an equation or a result.`;

describe("the relaxed key strips no note but the one code owes a confirm now", () => {
  const session = { turns: [], package: null } as unknown as Parameters<typeof prepared.preparedKey>[0];
  const base = { acts: ["accept_answer", "guide"], transcript: [], childTurn: "4", notes: [] as string[] } as unknown as TurnBrief;
  it("keeps any other note in the relaxed key: a different note never matches a brief without it", () => {
    const other = { ...base, acts: ["accept_answer", "guide", "confirm"], notes: ["The child took time to think before this turn: be patient, do not push, and answer what they say now."] } as unknown as TurnBrief;
    expect(keys(session, other)).not.toContain(prepared.preparedKey(session, base));
  });
  it("never strips a confirm-looking note by its words: with no confirm owed by the session, the note stays", () => {
    // The session owes no confirm (no question), so the note is not code's own for it now and stays in the key.
    const looks = { ...base, acts: ["accept_answer", "guide", "confirm"], notes: [NOTE(4)] } as unknown as TurnBrief;
    expect(keys(session, looks)).not.toContain(prepared.preparedKey(session, base));
    expect(keys(session, looks)[1]).toBe(prepared.preparedKey(session, { ...looks, acts: ["accept_answer", "guide"] } as unknown as TurnBrief));
  });
});

const pkg = SAMPLE_PACKAGES["subtract-52-28"];
const num = (value: number) => ({ type: "number" as const, value });
const askTwelveMinusEight = () => reply("2 minus 8 isn't 6; 6 is 8 minus 2. Since 2 is smaller than 8, we take a ten. What is 12 minus 8?", "guide", { step: "ones", level: 2, reading: { answers: [{ value: num(6), step: "ones", problem: "target", verdict: "wrong" }] } });

async function captured(answer: (brief: TurnBrief) => unknown, spend = memorySpendSeam(100)) {
  let t = 1_000;
  const model = conversationalFake({ answer: (brief: TurnBrief) => /2 minus 8, 6/.test(brief.childTurn ?? "") ? askTwelveMinusEight() : answer(brief) });
  const session = createTextSession({ callId: "c2-confirm-note", package: pkg, clock: () => t, model, spend, prepareExpected: false, reviewer: fakeTalkReviewer() });
  await session.start(); t += 5_000;
  await session.child("Hi Maya."); t += 5_000;
  await session.child("Is 2 minus 8, 6?"); t += 1_000;
  return { session, model, spend };
}

describe("the real brief of the captured turn carries the note; the prepared bare value does not", () => {
  it("prep '4' and real '12 minus 8 is 4.' differ only in the confirm offer and its note", async () => {
    const { session, model } = await captured(() => reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 }));
    const n0 = model.briefs.length;
    session.prepare({ text: "4", reason: "interim" });
    session.prepare({ text: "12 minus 8 is 4.", reason: "interim" });
    const strip = (b: TurnBrief) => ({ ...b, childTurn: null, transcript: b.transcript.slice(0, -1) });
    const [a, b] = model.briefs.slice(n0).map(strip);
    const diff = Object.keys(a).filter((k) => JSON.stringify(a[k as keyof TurnBrief]) !== JSON.stringify(b[k as keyof TurnBrief]));
    expect(diff).toEqual(["acts", "notes"]);
    expect(b.acts.filter((x) => !a.acts.includes(x))).toEqual(["confirm"]);
    expect(a.notes).toEqual([]);
    expect(b.notes).toEqual([NOTE(4)]);
    await session.finish();
  });
});

describe("a relaxed-key reply is still checked on the real turn (no guard is loosened)", () => {
  it("a prepared bare '5' reply that uses confirm (not offered to it) without the number is refused missing_number on the real turn, and the child never hears it", async () => {
    const spend = memorySpendSeam(100);
    // The model obeys the note when it has one; with none it asks a confirm that never names the number.
    const { session } = await captured((brief) => {
      const asked = brief.notes.join(" ").match(/Did you say (\d+)\?/);
      return asked ? reply(`Did you say ${asked[1]}?`, "confirm", { reading: { unclear: true } }) : reply("Take your time. What is 12 minus 8?", "confirm", { reading: { unclear: true } });
    }, spend);
    session.prepare({ text: "5", reason: "expected" });
    const out = await session.child("12 minus 8 is 5.");
    const attempts = session.trace().turns.filter((t) => t.kind === "maya").at(-1)!.attempts!;
    // Whatever binds, a refused proposal never reaches the child; the strict say rule still decides.
    for (const a of attempts.filter((x) => x.refusal)) expect(out.say.join(" ")).not.toContain(String((a.proposal as { say?: string }).say ?? "\u0000"));
    // The bare "5" binds by the relaxed key (same context, only the confirm offer and its note differ); its confirm
    // without the number is refused by the strict rule, and the repair, which sees the note, asks it.
    expect([out.prepared, out.preparedKind]).toEqual(["hit", "expected"]);
    expect(attempts.map((a) => [a.source, a.refusal?.say ?? null])).toEqual([["model", "missing_number"], ["repair", null]]);
    expect(out.say).toEqual(["Did you say 5?"]);
    expect(out.say.join(" ")).not.toMatch(/\b24\b/);
    await session.finish();
    expect(spend.settled.length + spend.givenBack.length).toBe(spend.taken.length);
  });
});
