// The contract every tutor kind must pass (D-345, Phase 2). A family's test calls `describeTutorKind(kind, packages)`
// with packages of its family; nothing here is imported by the site. The rules are the core's: a kind's own words are
// checked like Maya's, its board drawings must apply, and its numbers must agree with the package.
import { describe, expect, it } from "vitest";
import { applyBatch, createScene, type Batch } from "@/lib/board";
import { conversationalFake } from "@/lib/maya-model-fake";
import { createTextSession } from "@/lib/maya-text";
import type { OperationPackage } from "@/lib/question-package";
import type { TutorKind } from "../tutor-kind";
import { tutorKindOf } from "./index";
import { checkTutorSay, plainTeaching, tutorDrawings } from "../tutor";

/** The work steps of a package (its steps without the result and framing steps). */
const workIds = (pkg: OperationPackage) => {
  const work = pkg.steps.filter((st) => !["result", "missing-frame", "drop-zeros"].includes(st.kind)).map((st) => st.id);
  // A question with no work step (a digit ask) has its answer as its only step (#1011).
  return work.length > 0 ? work : pkg.steps.filter((st) => st.kind === "result").map((st) => st.id);
};

export function describeTutorKind(kind: TutorKind, packages: readonly OperationPackage[]) {
  describe(`tutor kind "${kind.id}": the contract`, () => {
    it("has packages to check", () => expect(packages.length).toBeGreaterThan(0));
    for (const pkg of packages) {
      describe(pkg.text, () => {
        it("fits, and is the kind the registry gives", () => {
          expect(kind.fits(pkg)).toBe(true);
          expect(tutorKindOf(pkg)?.id).toBe(kind.id);
        });
        it("gives steps in work order, with the package's own step ids and results code computes", () => {
          const steps = kind.steps(pkg);
          expect(steps.length).toBeGreaterThan(0);
          for (const st of steps) expect(workIds(pkg)).toContain(st.id);
          // Work order: the package's own order.
          const order = steps.map((st) => workIds(pkg).indexOf(st.id));
          expect(order).toEqual([...order].sort((x, y) => x - y));
          // A number result is a value of the work or the answer (never invented).
          const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
          for (const st of steps) if (typeof st.result === "number") expect([...kind.workValues(pkg), ...(answer === null ? [] : [answer])], `${st.id}: ${st.result}`).toContain(st.result);
        });
        it("writes only true math in its own words (the same check as Maya's)", () => {
          const ctx = { stance: "none" as const, claims: (x: string) => kind.claimProblems(pkg, x), ...(kind.op?.(pkg) ? { op: kind.op(pkg)! } : {}) };
          for (const st of kind.steps(pkg)) expect(checkTutorSay(`${st.work}.`, ctx), st.work).toMatchObject({ ok: true });
          // Code's honest line is said with no review: it must be a closed plain math form with true math.
          const q = kind.stepQuestion(pkg, []);
          if (q) {
            expect(checkTutorSay(q, ctx), q).toMatchObject({ ok: true });
            expect(plainTeaching(q), q).toBe(true);
          }
        });
        it("reads the answer as right, and never calls a work value a mistake", () => {
          const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
          if (answer !== null) expect(kind.numberMeaning(pkg, answer)).toMatch(/right/);
          for (const n of kind.workValues(pkg)) expect(kind.numberMeaning(pkg, n), String(n)).not.toMatch(/likely mistake/);
        });
        it("lets the stream use the question's own numbers", () => {
          const scope = kind.streamScope(pkg);
          for (const n of pkg.operation.operands as unknown[]) if (typeof n === "number") expect(scope.numbers).toContain(n);
        });
        it("draws every drawing it offers, and the board takes it", async () => {
          let now = Date.UTC(2026, 10, 15);
          const session = createTextSession({ callId: `contract-${kind.id}`, package: pkg, model: conversationalFake({ answer: () => { throw new Error("no model"); } }), clock: () => (now += 100), tutor: true });
          const opening = await session.start();
          let scene = createScene();
          for (const b of opening.board as Batch[]) {
            const r = applyBatch(scene, b);
            expect(r.ok).toBe(true);
            if (r.ok) scene = r.scene;
          }
          let drawn: string[] = [];
          const examples = kind.drawingExamples?.(pkg) ?? [];
          for (const d of kind.drawings(pkg)) {
            const request = examples.find((x) => x.offer === d.id) ?? { offer: d.id, place: "" };
            // Every drawing offered draws something on a fresh board with its example request, and the core lets it through.
            const fresh = kind.draw(pkg, [request], [], (i) => `contract-fresh-${d.id}-${i}`);
            expect(fresh.commands.length, `${d.id} drew nothing`).toBeGreaterThan(0);
            expect(tutorDrawings(pkg, [request], [], (i) => `contract-fresh-${d.id}-${i}`).commands.length, `${d.id} was refused by the core`).toBe(fresh.commands.length);
            const { commands, keys } = kind.draw(pkg, [request], drawn, (i) => `contract-note-${d.id}-${i}`);
            if (commands.length === 0) continue;
            const r = applyBatch(scene, { transactionId: `contract-${d.id}`, commands: commands as never });
            expect(r.ok, `${d.id}: ${r.ok ? "" : JSON.stringify(r.refusal)}`).toBe(true);
            if (r.ok) scene = r.scene;
            drawn = [...drawn, ...keys];
            // Never twice.
            expect(kind.draw(pkg, [{ offer: d.id, place: "" }], drawn, () => "x").keys.filter((k) => keys.includes(k))).toEqual([]);
          }
        });
      });
    }
  });
}
