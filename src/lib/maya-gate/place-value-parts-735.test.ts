// Pending for #735 (the Maya lane's shared confirm and answer path; review of #740): on the tenths build, another
// speaker's answer or a copied one is accepted as the child's at once. "My mom said 6.4.", "My dad told me 6.4." and
// "I copied 6.4." as the first turn get "You got it!" with no confirm: the decimal answer path skips even the confirm, and
// base fixture E does the same with 0.85. Not fixed in a coverage PR (brief, "My mom said 66."): this file holds the case
// for #735's owner. Drop the `.skip` there; each run must not accept the answer on that turn.
import { describe, expect, it, vi } from "vitest";
import { runGateBehaviour } from "./call";
import { memoryTraceStore, type Behaviour, type Plan } from "./gate";
import { FIXTURES } from "./fixtures";
import { placePartsTeachingPackage } from "@/lib/maya-teaching/place-value-parts";
import { storedBuild } from "@/lib/maya-teaching/place-value-parts-samples";

vi.mock("server-only", () => ({}));

const made = placePartsTeachingPackage(storedBuild({ wholes: 6, tenths: 4 }));
if (!made || "held" in made) throw new Error("6 wholes and 4 tenths is held");
const BUILD_64 = made.package;

const firstAct = async (id: string, text: string, plan: Plan): Promise<string | undefined> => {
  const fixture = "PVB" as Behaviour["fixture"];
  const b = { id, title: id, fixture, status: "passing", steps: [{ child: text, read: { start: "has_work", answers: [[6.4, "result", "right"]] }, maya: [plan] }], expect: { outcome: {} } } as Behaviour;
  const saved = FIXTURES.PVB;
  FIXTURES.PVB = BUILD_64;
  try {
    const store = memoryTraceStore();
    await runGateBehaviour(b, store);
    const turns = (JSON.parse(store.load(id)!) as { turns: { kind: string; output?: { act: string } }[] }).turns.filter((t) => t.kind === "maya");
    return turns[1]?.output?.act;
  } finally {
    FIXTURES.PVB = saved;
  }
};

describe("#735, pending: another speaker's or a copied decimal answer on the build is not the child's", () => {
  for (const text of ["My mom said 6.4.", "My dad told me 6.4.", "I copied 6.4."]) {
    it.skip(`${text} is not accepted at once (the model proposes the accept)`, async () => {
      expect(await firstAct("735-model", text, { act: "accept_answer", lines: ["answer.right"] })).not.toBe("accept_answer");
    });
    it.skip(`${text} is not accepted at once (the model fails; code's fallback)`, async () => {
      expect(await firstAct("735-fallback", text, { throws: true })).not.toBe("accept_answer");
    });
  }
});
