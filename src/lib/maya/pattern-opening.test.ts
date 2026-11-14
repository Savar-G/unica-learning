import { expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { ruleConversationalModel } from "@/lib/maya-model-fake";
import { teachingPackage } from "@/lib/maya-teaching";
import { printedPattern } from "@/lib/maya-teaching/pattern-fixtures";
import { operationText } from "@/lib/question-package";
import { spokenQuestion } from "./lines";

for (const form of ["missing3", "missing9", "term4", "plant3", "pair", "days8"] as const) {
  for (const confirmWorkbook of [false, true]) {
    it(`the conversational ${form} opening preserves the method for the child (workbook ${confirmWorkbook})`, async () => {
      const raw = teachingPackage(form === "missing9" ? printedPattern(form, 35, 10) : form === "days8" ? printedPattern(form, 32, 9) : printedPattern(form));
      const session = createTextSession({ callId: "pattern-opening", package: raw, model: ruleConversationalModel(), confirmWorkbook, grade: 3, clock: () => 1000 });
      const pkg = session.session.package;
      if (!pkg) throw new Error("pattern was not admitted");
      const output = await session.start();
      const say = output.say.join(" ");
      expect(say).toContain("I'm Maya, an AI math helper.");
      expect(say).toContain("the pattern");
      expect(say).not.toContain(spokenQuestion(operationText(pkg.operation!)));
      expect(say).toContain("Where do you want to start?");
      if (confirmWorkbook && pkg.ref.source === "workbook") expect(say).toContain(`page ${pkg.ref.page}, number ${pkg.ref.question}`);
      expect(session.session.done).toEqual([]);
      expect(session.session.solved).toBeNull();
      expect(output.ended).toBeNull();
      expect(session.trace().turns.filter(t => t.kind === "maya").flatMap(t => t.attempts.map(a => a.source))).toEqual(["controller"]);
    });
  }
}
