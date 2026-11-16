import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { openingLine } from "@/lib/maya/lines";
import { exactSafe } from "@/lib/maya/math-vocab";
import { askedStep, askedValue, doneReply, echoesChild, firstTimeTurn, selfCorrection } from "@/lib/maya/teaching-reads";
import { checkTutorSay, FINAL_ASK, tutorFallbackText, TUTOR_FIRST_TIME_WORD_LIMIT, TUTOR_WORD_LIMIT } from "@/lib/maya/tutor";
import { TUTOR_PROMPT, TUTOR_PROMPT_VERSION, type TutorBrief } from "@/lib/maya/tutor-prompt";
import { SAVAR_CALL_2_TURNS, TUTOR_CASES } from "@/lib/maya-practice/tutor-cases";
import type { OperationPackage } from "@/lib/question-package";

// Savar's call 2 (21665dc6, 2026-11-15): "the explanation is confusing and complicated for a child who meets borrowing
// for the first time". One binding test per code rule of the fix.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const [ASK, FOUR, THREE, HUH] = SAVAR_CALL_2_TURNS;

function session(says: (n: number) => string, opts: { stream?: boolean; act?: (n: number) => "guide" | "close"; reading?: (n: number) => Record<string, unknown> } = {}) {
  let n = 0;
  const parts: string[] = [];
  const model = conversationalFake({ answer: () => { const i = n++; return reply(says(i), opts.act?.(i) ?? "guide", { reading: opts.reading?.(i) ?? {} }); }, ...(opts.stream ? { stream: { chunk: 7 } } : {}) });
  let now = Date.UTC(2026, 10, 15);
  const s = createTextSession({ callId: "first-time", package: SUB, model, clock: () => (now += 100), random: 3, tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), reviewTimeLimitMs: 50, ...(opts.stream ? { onSayPart: (x: string) => parts.push(x) } : { channel: "chat" as const }) });
  return { s, model, parts, brief: () => model.briefs.at(-1) as unknown as TutorBrief };
}

describe("1. the opening", () => {
  it("is exactly Savar's line, with AI in the first sentence and nothing after it", async () => {
    expect(openingLine(SUB)).toBe("Hi there! I'm Maya, your AI math helper. We're doing 52 minus 28 today. What part is confusing, or where do you need help?");
    const { s } = session(() => "unused");
    expect((await s.start()).say).toEqual([openingLine(SUB)]);
  });
  it("the voice worker says no greeting after it", () => {
    const main = readFileSync("worker/maya-voice/src/main.ts", "utf8");
    expect(main).not.toMatch(/greeting:\s*GREETING_TEXT/);
  });
});

describe("2. never the child's own question back (#1105)", () => {
  it("refuses a first sentence that says the child's question back, and allows the next step's question", () => {
    expect(echoesChild("What is 2 minus 8?", ASK)).toBe(true);
    expect(echoesChild("What is 12 minus 8?", ASK)).toBe(false);
    expect(echoesChild("2 is too small to take 8.", ASK)).toBe(false);
    const echo = checkTutorSay("What is 2 minus 8? We trade 1 ten for 10 ones. What is 12 minus 8?", { stance: "none", childTurn: ASK });
    expect(echo).toMatchObject({ ok: false, reason: "never_say" });
    expect(checkTutorSay("52 is 5 tens and 2 ones. What is 12 minus 8?", { stance: "none", childTurn: ASK }).ok).toBe(true);
  });
  it("in a call, the echo is refused and the repair is said", async () => {
    const { s } = session((n) => (n === 0 ? "What is 2 minus 8? You can't take 8 from 2." : "52 is 5 tens and 2 ones. What is 12 minus 8?"));
    await s.start();
    expect((await s.child(ASK)).say.join(" ")).toBe("52 is 5 tens and 2 ones. What is 12 minus 8?");
  });
  it("the prompt says so, and its first-sentence examples hold no echo", () => {
    expect(TUTOR_PROMPT_VERSION).toBe("maya-tutor-11");
    expect(TUTOR_PROMPT).toContain(`Never say the child's own question back to them ("What is 2 minus 8?" after "Can you explain 2 minus 8?"): start with the explanation.`);
    expect(TUTOR_PROMPT).toContain(`one plain question about the next step, never the child's own question: "What is 12 minus 8?"`);
  });
});

describe("3. the first-time learner", () => {
  it("the closed reader finds a new or lost child, and nothing else", () => {
    for (const x of [ASK, "I don't get how to do this", "Can you explain it?", "It's my first time doing this.", "I'm confused.", "Teach me please", "I never learned borrowing", "How do you do it?"]) expect(firstTimeTurn(x), x).toBe(true);
    for (const x of ["Four.", "I got 24.", "Is it 36?", "I understand now.", "Hi Maya"]) expect(firstTimeTurn(x), x).toBe(false);
  });
  it("sets the brief's flag on Savar's first turn, and keeps it for the call", async () => {
    const { s, brief } = session(() => "52 is 5 tens and 2 ones. What is 12 minus 8?");
    await s.start();
    await s.child(ASK);
    expect(brief().learner).toBe("first_time");
    await s.child(FOUR);
    expect(brief().learner).toBe("first_time");
  });
  it("is on by default for a help request before any answer, and off for a plain answer", async () => {
    const a = session(() => "52 is 5 tens and 2 ones. What is 12 minus 8?");
    await a.s.start();
    await a.s.child("I need help.");
    expect(a.brief().learner).toBe("first_time");
    const b = session(() => "52 minus 28 isn't 36. What is 12 minus 8?");
    await b.s.start();
    await b.s.child("My answer is 36.");
    expect(b.brief().learner).toBeNull();
  });
  it("allows the longer explanation only in this mode", () => {
    const long = `52 is 5 tens and 2 ones. ${"We need to take away 8 ones, but we only have 2 ones. ".repeat(3)}So we trade 1 ten for 10 ones. Now we have 4 tens and 12 ones. What is 12 take away 8?`;
    const words = long.split(/\s+/).length;
    expect(words).toBeGreaterThan(TUTOR_WORD_LIMIT);
    expect(words).toBeLessThanOrEqual(TUTOR_FIRST_TIME_WORD_LIMIT);
    expect(checkTutorSay(long, { stance: "none" })).toMatchObject({ ok: false, reason: "too_long" });
    expect(checkTutorSay(long, { stance: "none", wordLimit: TUTOR_FIRST_TIME_WORD_LIMIT }).ok).toBe(true);
  });
  it("the prompt holds the order and worked examples of this register", () => {
    expect(TUTOR_PROMPT).toContain(`in this order: what we have; the problem; the move; the result; then ONE easy question the child can answer`);
    // Examples, not scripts: the worked examples use other numbers than the practice question (52 − 28).
    expect(TUTOR_PROMPT).toContain(`"71 is 7 tens and 1 one. We need to take away 6 ones, but we only have 1 one. So we trade 1 ten for 10 ones. Now we have 6 tens and 11 ones. What is 11 take away 6?"`);
    expect(TUTOR_PROMPT).toContain(`63 − 47`);
    expect(TUTOR_PROMPT).toContain(`38 + 45`);
  });
});

describe("4. the question asked", () => {
  it("reads what Maya's question asks, in closed forms", () => {
    expect(askedValue("How many ones do we have now?", SUB)?.value).toBe(12);
    expect(askedValue("We traded 1 ten away, so how many tens are left in 52?", SUB)?.value).toBe(4);
    expect(askedValue("We had 5 tens and gave 1 away. How many tens now?", SUB)?.value).toBe(4);
    expect(askedValue("5 take away 1 is?", SUB)?.value).toBe(4);
    expect(askedValue("What is 12 take away 8?", SUB)?.value).toBe(4);
    expect(askedValue("What do we write in the tens?", SUB)?.value).toBe(2);
    expect(askedValue("Where do you want to start?", SUB)).toBeNull();
  });
  it("Savar's turn 5: \"Four\" answers 12 take away 8, not the asked 12 ones", () => {
    const turns = [{ speaker: "maya" as const, text: "We trade 1 ten for 10 ones. How many ones do we have now?" }, { speaker: "child" as const, text: FOUR }];
    expect(askedStep(SUB, turns, 4)).toMatchObject({ value: 12, fits: "another", another: "the ones step (12 − 8 = 4)" });
    expect(askedStep(SUB, turns, 12)).toMatchObject({ fits: "asked" });
    expect(askedStep(SUB, turns, 7)).toMatchObject({ fits: "none" });
  });
  it("the brief gives the model code's read on Savar's turns", async () => {
    const says = ["52 is 5 tens and 2 ones. We trade 1 ten for 10 ones. How many ones do we have now?", "12 minus 8 is 4. We traded 1 ten away, so how many tens are left in 52?", "Not quite. We had 5 tens and traded 1 away. What is 5 minus 1?"];
    const { s, brief } = session((n) => says[Math.min(n, says.length - 1)]);
    await s.start();
    await s.child(ASK);
    await s.child(FOUR);
    expect(brief().asked).toMatchObject({ question: "How many ones do we have now?", childValue: 4, fits: "another" });
    await s.child(THREE);
    expect(brief().asked).toMatchObject({ childValue: 3, fits: "none", asks: "the tens after 1 was traded away (5 − 1)" });
  });
});

describe("5. a wrong step answer", () => {
  const upToThree = async (says: (n: number) => string) => {
    const t = session(says);
    await t.s.start();
    await t.s.child(ASK);
    await t.s.child(FOUR);
    return { ...t, out: await t.s.child(THREE) };
  };
  const first = ["52 is 5 tens and 2 ones. How many ones do we have now?", "12 minus 8 is 4. We traded 1 ten away, so how many tens are left in 52?"];
  it("refuses the whole question's \"isn't\" form for a step answer (turn 8), and says the repair", async () => {
    const { out } = await upToThree((n) => [...first, "52 minus 28 isn't 3. We had 5 tens. What is 5 minus 1?", "Not quite. We had 5 tens and traded 1 away. What is 5 minus 1?"][n]);
    expect(out.say.join(" ")).toBe("Not quite. We had 5 tens and traded 1 away. What is 5 minus 1?");
  });
  it("keeps the form for a wrong FINAL answer", () => {
    expect(checkTutorSay("52 minus 28 isn't 36. What is 12 minus 8?", { stance: "wrong" }).ok).toBe(true);
    expect(checkTutorSay("52 minus 28 isn't 3. What is 5 minus 1?", { stance: "wrong", stepMiss: { pkg: SUB } })).toMatchObject({ ok: false, reason: "never_say" });
  });
  it("refuses a message that corrects itself (\"wait\", \"I mean\")", async () => {
    expect(selfCorrection("52 minus 28 isn't 3 tens... wait, 3 isn't it.")).not.toBeNull();
    expect(selfCorrection("We have 3 tens, I mean 4 tens.")).not.toBeNull();
    expect(selfCorrection("Sorry, my last message was confusing. We had 5 tens.")).toBeNull();
    expect(selfCorrection("No, 3 is not right yet.")).toBeNull();
    const { out } = await upToThree((n) => [...first, "52 minus 28 isn't 3 tens... wait, 3 isn't it. 52 is 5 tens and 2 ones.", "Not quite. We had 5 tens and traded 1 away. What is 5 minus 1?"][n]);
    expect(out.say.join(" ")).not.toMatch(/wait/i);
  });
  it("a message that corrects a wrong answer ends with one question", async () => {
    const { out } = await upToThree((n) => [...first, "Not quite. We had 5 tens and traded 1 away.", "Not quite. We had 5 tens and traded 1 away. What is 5 minus 1?"][n]);
    expect(out.say.join(" ")).toBe("Not quite. We had 5 tens and traded 1 away. What is 5 minus 1?");
  });
  it("\"that didn't make sense\" goes to the tutor, never code's \"What part should we try again?\" (chat run 1)", async () => {
    const line = "Sorry, my last message was confusing. We had 5 tens and gave 1 away. How many tens now?";
    const t = session((n) => ["52 is 5 tens and 2 ones. How many ones do we have now?", line][Math.min(n, 1)], { reading: (n) => (n >= 1 ? { shorter: true, help: "more" } : {}) });
    await t.s.start();
    await t.s.child(ASK);
    // The model's reading says the child wants it shorter, as the real model read Savar's turn 9.
    const out = await t.s.child(HUH);
    expect(out.say.join(" ")).toBe(line);
    expect(out.say.join(" ")).not.toContain("What part should we try again?");
  });
  it("the apology and the end question need no safety review", () => {
    expect(exactSafe("Sorry, my last message was confusing.")).toBe(true);
    expect(exactSafe(FINAL_ASK)).toBe(true);
  });
  it("keeps \"Sorry, my last message was confusing.\" allowed", async () => {
    const line = "Sorry, my last message was confusing. We had 5 tens and gave 1 away. How many tens now?";
    expect(checkTutorSay(line, { stance: "none", childTurn: HUH }).ok).toBe(true);
    expect(TUTOR_PROMPT).toContain(`"Sorry, my last message was confusing." is allowed`);
  });
});

describe("6. code's line asks the part the child is on, never a later one", () => {
  it("after a wrong \"Three\" for the tens left, code's line asks 5 minus 1, not 4 minus 2 (turn 10)", async () => {
    const says = ["52 is 5 tens and 2 ones. How many ones do we have now?", "12 minus 8 is 4. We traded 1 ten away, so how many tens are left in 52?"];
    // The model's messages for "Three." are refused twice (each corrects itself), so code's line is said.
    const { s } = session((n) => says[n] ?? "3 tens, wait, 4 tens.");
    await s.start();
    await s.child(ASK);
    await s.child(FOUR);
    const out = await s.child(THREE);
    expect(out.say.join(" ")).toBe("Let me say that another way. What is 5 minus 1?");
  });
  it("the asked part comes first in code's honest line; without one, the open step", () => {
    expect(tutorFallbackText(SUB, ["ones"], false, "What is 5 minus 1?")).toBe("Let me say that another way. What is 5 minus 1?");
    expect(tutorFallbackText(SUB, ["ones"], false)).toBe("Let me say that another way. What do you get for 4 minus 2?");
  });
  it("a stream that loses its later sentences ends with code's question, never a half-thought", async () => {
    const t = session(() => "52 is 5 tens and 2 ones. 3 tens, wait, 4 tens.", { stream: true });
    await t.s.start();
    const out = await t.s.child(ASK);
    const said = out.say.join(" ");
    expect(t.parts.join(" ")).toContain("52 is 5 tens and 2 ones.");
    expect(said).not.toMatch(/wait/i);
    expect(said.trim().endsWith("?")).toBe(true);
  });
});

describe("7. the right final answer", () => {
  const solve = async (end: string, after?: string) => {
    const says = ["52 is 5 tens and 2 ones. What is 12 minus 8?", "Yes! 12 take away 8 is 4. What is 4 minus 2?", end, after ?? "Bye for now!"];
    const t = session((n) => says[Math.min(n, says.length - 1)], { act: (n) => (n >= 3 ? "close" : "guide") });
    await t.s.start();
    await t.s.child(ASK);
    await t.s.child("4.");
    await t.s.child("2.");
    const out = await t.s.child("24.");
    return { ...t, out };
  };
  it("the brief asks for one good-job sentence and the end question, with no explain-back", async () => {
    const { brief } = await solve(`52 minus 28 is 24. You traded the ten and took away both places. ${FINAL_ASK}`);
    const notes = brief().notes.join(" ");
    expect(notes).toContain(FINAL_ASK);
    expect(notes).toContain("Do not ask how they got it");
    expect(notes).not.toMatch(/Ask once how they got it/);
    expect(TUTOR_PROMPT).not.toContain(`ask once how they got it ("How did you get 24?")`);
    expect(TUTOR_PROMPT).toContain(`then ask exactly "${FINAL_ASK}". Do not ask how they got it.`);
  });
  it("the end question waits for the child's whole answer (final runs: \"So 52 minus 28 is 24. Do you want another question...\")", async () => {
    const early = `4 minus 2 is 2. So 52 minus 28 is 24. ${FINAL_ASK}`;
    const ask = "4 minus 2 is 2. What is the whole answer to 52 minus 28?";
    const t = session((n) => ["52 is 5 tens and 2 ones. What is 12 minus 8?", "Yes! 12 take away 8 is 4. What is 4 minus 2?", early, ask][n]);
    await t.s.start();
    await t.s.child(ASK);
    await t.s.child("4.");
    expect((await t.s.child("2.")).say.join(" ")).toBe(ask);
  });
  it("code's line after a solved question asks for another or done, never how", () => {
    expect(tutorFallbackText(SUB, ["ones", "tens"], true)).toBe(`You solved this one. ${FINAL_ASK}`);
  });
  it("the board shows the whole answer with the good-job message", async () => {
    const { out } = await solve(`52 minus 28 is 24. You traded the ten and took away both places. ${FINAL_ASK}`);
    const puts = out.board.flatMap((b) => b.commands).filter((c) => (c as { op?: string }).op === "put").map((c) => (c as { value?: string }).value);
    expect(puts).toEqual(expect.arrayContaining(["4", "2"]));
  });
  it("\"no\" after the end question ends the call with a goodbye", async () => {
    const t = await solve(`52 minus 28 is 24. You traded the ten and took away both places. ${FINAL_ASK}`, "Do you want to try 63 minus 38?");
    expect(doneReply("No.")).toBe(true);
    expect(doneReply("No, I'm done.")).toBe(true);
    expect(doneReply("Bye!")).toBe(true);
    expect(doneReply("No, I don't get it.")).toBe(false);
    expect(doneReply("Yes, another one.")).toBe(false);
    const end = await t.s.child("No.");
    expect(end.ended?.reason).toBe("solved");
    expect(end.say.join(" ")).not.toMatch(/\?/);
  });
  it("never ends the call on a stuck child", async () => {
    const t = session(() => "Bye for now!", { act: () => "close" });
    await t.s.start();
    const out = await t.s.child("No.");
    expect(out.ended).toBeNull();
  });
});

describe("practice case 2", () => {
  it("is Savar's call 2 beside case 1, with his exact words and the checks of points 1 to 7", () => {
    const k07 = TUTOR_CASES.find((c) => c.id === "K07")!;
    expect(TUTOR_CASES[0].id).toBe("K01");
    expect(k07.opener).toBe(SAVAR_CALL_2_TURNS[0]);
    expect(k07.fakeScript.slice(0, 6)).toEqual([...SAVAR_CALL_2_TURNS]);
    expect(k07.tutor?.checks?.length).toBeGreaterThanOrEqual(4);
    for (const point of ["never says the child's question back", "4 is the answer to 12 take away 8", "Not quite. We had 5 tens and traded 1 away. 5 take away 1 is?", "never a \"wait\"", FINAL_ASK, "a short goodbye that ends the call"]) expect(k07.expected).toContain(point);
  });
});
