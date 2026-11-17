// A finite bank of complete sentences written from computed column facts. This never parses a model sentence.
// The caller adds these exact strings to the active problem's bank; an easier example disables that bank.
import { workedSteps, type OperationPackage } from "@/lib/question-package";
import { columnKind, tutorSteps } from "./tutor-kinds/column";

const unit = (place: string) => place.replace(/s$/, "");
const quantity = (value: number, place: string) => `${value} ${value === 1 ? unit(place) : place}`;

export function exactColumnPhrases(pkg: OperationPackage): readonly string[] {
  if (pkg.operation.kind !== "add" && pkg.operation.kind !== "subtract") return [];
  // Recompute the facts. Stored step text, model text and child text never enter this sentence bank.
  const computed = { ...pkg, steps: workedSteps(pkg.operation) };
  if (!columnKind.fits(computed)) return [];
  const steps = tutorSteps(computed);
  const phrases = new Set<string>();
  for (const [index, step] of steps.entries()) {
    const left = steps[index + 1];
    if (!step.blank) {
      const write = `${step.write} in the ${step.place}`;
      phrases.add(`Write ${write} place.`);
      phrases.add(`Write ${write} column.`);
      phrases.add(`We write ${write}.`);
      phrases.add(`You write ${write}.`);
      if (step.operands.length > 1) {
        const equation = `${step.operands.join(step.op === "+" ? " plus " : " minus ")} is ${step.total}`;
        phrases.add(`${equation}, so write ${write}.`);
        phrases.add(`${equation}, so we write ${write}.`);
        const units = `${step.operands.map(n => quantity(n, step.place)).join(step.op === "+" ? " plus " : " minus ")} is ${quantity(step.total, step.place)}`;
        phrases.add(`${units}, so we write ${write} place.`);
        if (step.op === "-") {
          const [top, bottom] = step.operands.map(n => quantity(n, step.place));
          phrases.add(`We have ${top} and take away ${bottom}.`);
          phrases.add(`We have ${top} and we take away ${bottom}.`);
          phrases.add(`We have ${top}, and we take away ${bottom}.`);
          phrases.add(`You have ${top} and take away ${bottom}.`);
          phrases.add(`We take ${bottom} from those ${top}.`);
        }
      }
    }
    if (step.op === "+" && step.trade && left) {
      const carry = Math.floor(step.total / 10);
      phrases.add(`Write ${step.write} in the ${step.place} and carry ${carry} to the ${left.place}.`);
      phrases.add(`Write ${step.write} in the ${step.place} and carry ${carry}.`);
      phrases.add(`Carry ${carry} to the ${left.place}.`);
      phrases.add(`We trade 10 ${step.place} for ${quantity(carry, left.place)}.`);
    }
    if (step.op === "-" && step.trade && left) {
      phrases.add(`We trade 1 ${unit(left.place)} for 10 ${step.place}.`);
      phrases.add(`Trade 1 ${unit(left.place)} for 10 ${step.place}.`);
    }
  }
  // This wording names one specific trade. A chain or a column that both receives and gives needs review.
  const borrowers = steps.filter(step => step.op === "-" && step.trade);
  if (borrowers.length === 1) {
    const borrower = borrowers[0];
    const donor = steps[steps.indexOf(borrower) + 1];
    if (!borrower.lent && donor?.lent && !donor.trade) {
      for (const step of [borrower, donor]) {
        const amount = quantity(step.operands[0], step.place);
        phrases.add(`After the trade, we have ${amount}.`);
        phrases.add(`After the trade, there are ${amount}.`);
      }
      const before = quantity(donor.printedTop!, donor.place);
      const after = quantity(donor.operands[0], donor.place);
      const loan = `1 ${unit(donor.place)}`;
      const received = quantity(borrower.operands[0], borrower.place);
      const printed = quantity(borrower.printedTop!, borrower.place);
      const bottom = borrower.operands[1];
      phrases.add(`After the trade, ${before} became ${after}.`);
      phrases.add(`We have ${after} left after the trade.`);
      phrases.add(`We traded ${loan} away, so ${before} became ${after}.`);
      phrases.add(`We traded ${loan} away, so the ${before} are now ${after}.`);
      phrases.add(`We borrowed, so ${before} became ${after}.`);
      for (const link of ["and", "but"]) phrases.add(`We had ${before}, ${link} we traded ${loan} away, so ${after} are left.`);
      phrases.add(`The ${before} become ${after}, and the ${printed} become ${received}.`);
      phrases.add(`Then ${printed} become ${received}.`);
      for (const subject of ["We", "You"]) {
        phrases.add(`${subject} can't take ${bottom} from ${printed}, so we use the ${received} from the trade.`);
        phrases.add(`${subject} can't take ${bottom} from ${borrower.printedTop}, so we use the ${received} from the trade.`);
      }
    }
  }
  return [...phrases];
}
