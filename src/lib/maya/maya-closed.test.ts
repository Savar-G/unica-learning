// Maya's own close of an unsolved question gets its own outcome reason, maya_closed (2026-11-12). Before, the D-199 close
// after two wrong final answers and the "This one is hard" close ended as child_stopped, so the parent note said the child
// ended the call and the practice suite counted the run as early_stop. A close the child asked for stays child_stopped;
// the timer close stays time_limit.
import { describe, expect, it } from "vitest";
import { codeSentences, type NoteFacts } from "@/lib/maya-call-note";
import { memoryTraceStore, runBehaviour, type Behaviour, type Plan, type Step } from "@/lib/maya-gate/gate";
import { checkTrace } from "@/lib/maya-trace";

const THROWS: Plan[] = [{ throws: true }];
const down = (text: string): Step => ({ child: text, maya: THROWS });

async function play(steps: Step[]) {
  const b: Behaviour = { id: "maya-closed", title: "maya closed", fixture: "A", status: "passing", steps, expect: { outcome: {} } };
  const store = memoryTraceStore();
  await runBehaviour(b, store);
  const saved = store.load(b.id)!;
  const trace = JSON.parse(saved) as { outcome: { reason: string } | null; turns: { kind: string; output?: { act: string; say: string[] } }[] };
  return { saved, outcome: trace.outcome, acts: trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => t.output!.act) };
}

describe("maya_closed: Maya ends an unsolved call on her own", () => {
  it("records the D-199 close after two wrong final answers as maya_closed (model down)", async () => {
    const { outcome, acts, saved } = await play([down("7 plus 9 is 16."), down("2 plus 3 plus 1 is 6."), down("56."), down("65.")]);
    expect(acts.at(-1)).toBe("close");
    expect(outcome).toMatchObject({ reason: "maya_closed" });
    expect(checkTrace(JSON.parse(saved))).toMatchObject({ ok: true });
  });

  it("records the honest close of a stuck loop as maya_closed (model down)", async () => {
    const { outcome, acts } = await play(Array.from({ length: 6 }, () => down("I'm stuck.")));
    expect(acts.at(-1)).toBe("close");
    expect(outcome).toMatchObject({ reason: "maya_closed" });
  });

  it("keeps child_stopped for a close the child asked for", async () => {
    const { outcome, acts } = await play([{ child: "I want to stop.", read: { stop: true } }]);
    expect(acts.at(-1)).toBe("close");
    expect(outcome).toMatchObject({ reason: "child_stopped" });
  });
});

describe("the parent note for maya_closed", () => {
  const facts = (reason: NoteFacts["reason"]): NoteFacts => ({
    question: { source: "workbook", page: 23, number: 4, text: "27 + 39" }, finished: "not_finished", reason, help: "hint", stuckOn: "adding the tens", paper: "unknown", minutes: 3, safety: false,
  });

  it("says Maya ended the call, then the same help line as the other unfinished reasons", () => {
    const lines = codeSentences(facts("maya_closed"));
    expect(lines).toContain("Maya ended the call before the question was done.");
    expect(lines.join(" ")).not.toContain("{child} ended the call");
    const stopped = codeSentences(facts("child_stopped"));
    expect(stopped).toContain("{child} ended the call before the question was done.");
    expect(lines.slice(lines.indexOf("Maya ended the call before the question was done.") + 1)).toEqual(stopped.slice(stopped.indexOf("{child} ended the call before the question was done.") + 1));
  });
});
