// C09 of the subscription practice run at 361a05c9 (PR #698): the compensation method 27 + 40 - 1. (i) A sure, right final
// answer at the end of the child's working is accepted with no "What is your final answer on its own?". (ii) Maya names a
// method code recognises, with the package's numbers, instead of a warm "I hear you". (iii) The close says no more than
// the child did: no "We finished it together" after the given answer, no "You worked out" after a shown step.
import { describe, expect, it, vi } from "vitest";
import { TEMPLATES } from "@/lib/maya/lines";
import { memoryTraceStore, runBehaviour, type Behaviour, type Plan, type Step } from "@/lib/maya-gate/gate";

vi.mock("server-only", () => ({}));

interface Told { act: string; lines: string[]; say: string }
async function play(steps: Step[]) {
  const b: Behaviour = { id: "c09", title: "c09", fixture: "A", status: "passing", steps, expect: { outcome: {} } };
  const store = memoryTraceStore();
  await runBehaviour(b, store);
  const trace = JSON.parse(store.load(b.id)!) as { turns: { kind: string; output?: { act: string; say: string[] } | null; attempts?: { proposal?: { parts?: { line?: string }[] } | null }[] }[]; outcome: { reason: string; assistance: string } | null };
  const told: Told[] = trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => ({
    act: t.output!.act, lines: (t.attempts!.at(-1)!.proposal?.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" "),
  }));
  return { told, outcome: trace.outcome };
}
const THROWS: Plan[] = [{ throws: true }];
const down = (text: string): Step => ({ child: text, maya: THROWS });
const METHOD = TEMPLATES["check.method.down"].map((t) => t.replaceAll("{b}", "39").replaceAll("{round}", "40").replaceAll("{diff}", "1"));
const named = (say: string) => METHOD.some((m) => say.includes(m));
const C09 = ["I did 27 plus 40, then took away one. I got 66.", "I did 27 plus 40. Then I took away one. I got 66.", "I did 27 plus 40, then took away one, and I got 66."];

describe("(i) the final answer at the end of the working", () => {
  it.each(C09)("accepts %j with no confirm, on both paths", async (text) => {
    for (const first of [down(text), { child: text, read: { answers: [[66, "result", "right"]] }, maya: [{ act: "confirm", lines: ["confirm.answer"], repair: { act: "accept_answer" } }] } as Step]) {
      const { told } = await play([first]);
      expect(told[1].act).toBe("accept_answer");
      expect(told[1].say).not.toMatch(/final answer/);
    }
  });
});

describe("(ii) the child's own method, named back", () => {
  it.each(C09)("names 39 to 40, take 1 away, in the accept for %j", async (text) => {
    const { told } = await play([down(text)]);
    expect(named(told[1].say)).toBe(true);
    // Named once: not again in the next turn.
    const later = await play([down(text), down("Because 39 is one less than 40. So I added 40, then took one away.")]);
    expect(later.told.filter((t) => named(t.say))).toHaveLength(1);
  });

  it("names it in place of a warm reply when the child explains it after the answer stands", async () => {
    const { told } = await play([
      { child: "66.", read: { answers: [[66, "result", "right"]] } },
      { child: "Because 39 is one less than 40. So I added 40, then took one away.", maya: [{ act: "ask_write", warm: "encourage", lines: ["write.answer"] }] },
    ]);
    expect(told[2].act).toBe("ask_write");
    expect(named(told[2].say)).toBe(true);
    expect(told[2].say).not.toMatch(/I hear you|Thanks for telling me/);
    expect(told[2].say).toMatch(/66/);
  });

  it.each([
    "Because my mom made 39 into 40, then took one away.", "I don't think I made 39 into 40.", "Because I made 39 into 40, then took two away.",
    "Because I made 39 into 40.", "Maybe I made 39 into 40, then took one away.", "Because I did 27 plus 30, then took away one.",
  ])("names no method for %j", async (text) => {
    const { told } = await play([{ child: "66.", read: { answers: [[66, "result", "right"]] } }, down(text)]);
    expect(told.some((t) => named(t.say))).toBe(false);
  });
});

describe("(iii) an honest close by how much help the child had", () => {
  it("says no 'finished together' after Maya gave the answer", async () => {
    const { told, outcome } = await play([
      { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] },
      { child: "15.", read: { answers: [[15, "ones", "wrong"]] }, maya: [{ act: "give_answer" }] },
      { child: "I wrote 66.", read: { paper: "written" }, maya: [{ act: "close", lines: ["close.together"] }] },
    ]);
    expect(outcome?.assistance).toBe("answer_given");
    const close = told.at(-1)!;
    expect(close.act).toBe("close");
    expect(close.say).not.toMatch(/finished|got through|worked through|worked out|You solved|You did it/i);
  });

  it("says the child's answer is right, not that they worked it out, after a shown step", async () => {
    const { told, outcome } = await play([
      { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] },
      { child: "I wrote 6 and carried 1.", read: { answers: [[6, "ones", "right"]] } },
      { child: "2 plus 3 plus 1 is 6, so 66.", read: { answers: [[6, "tens", "right"], [66, "result", "right"]] } },
      { child: "I wrote 66.", read: { paper: "written" }, maya: [{ act: "close", lines: ["close.solved"] }] },
    ]);
    expect(outcome?.assistance).toBe("guided");
    const close = told.at(-1)!;
    expect(close.act).toBe("close");
    expect(close.say).not.toMatch(/worked out|You solved|You did it|Great job|Nice work|Well done on/i);
  });

  it("keeps 'You worked out' for a child who worked it alone", async () => {
    const { told } = await play([
      { child: "7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] } },
      { child: "2 plus 3 plus 1 is 6, so 66.", read: { answers: [[6, "tens", "right"], [66, "result", "right"]] } },
      { child: "I wrote 66.", read: { paper: "written" }, maya: [{ act: "close", lines: ["close.solved"] }] },
    ]);
    const solved = TEMPLATES["close.solved"].map((t) => t.replaceAll("{expr}", "27 + 39"));
    expect(solved.some((x) => told.at(-1)!.say.includes(x))).toBe(true);
  });
});
