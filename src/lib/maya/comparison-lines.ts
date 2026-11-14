// Code-written comparison lines. Target help names the operands but never states the relation or winning word.
import { stepText, type OperationPackage, type WorkedStep } from "../question-package";
import { comparisonText, comparisonWords } from "../question-package-comparison";
import type { LineId, LineOffer, PackageLines, TemplateKey } from "./lines";
import { comparisonOf } from "./comparison";

export const COMPARISON_TEMPLATES = { "comparison.words": ["{words}"] } as const;
type Offer = (line: LineId, key: TemplateKey, vars: Record<string, string | number>, extra: Omit<LineOffer, "line" | "texts" | "key">) => LineOffer;

export function comparisonLines(pkg: OperationPackage, shared: PackageLines, offer: Offer): PackageLines {
  const op = comparisonOf(pkg);
  if (!op) return shared;
  const say = (line: LineId, words: string, step?: string, level?: 0 | 1 | 2 | 3, requires?: LineOffer["requires"]): LineOffer[] => [
    offer(line, "comparison.words", { words }, { slots: step ? { step } : {}, ...(level === undefined ? {} : { level }), ...(requires ? { requires } : {}) }),
  ];
  const question = comparisonText(op), words = comparisonWords(op);
  const find = (id: string) => pkg.steps.find(s => s.id === id);
  const invite = (step: WorkedStep, level: 0 | 1 | 2): LineOffer[] => {
    if (step.kind === "operate") return say(level === 0 ? "step.invite" : level === 1 ? "step.point" : "step.operation", level === 0
      ? `Find the ${step.id === "left-area" ? "first" : "second"} area: ${step.left} × ${step.right}. What is it?`
      : `Count ${step.left} rows of ${step.right} squares. What is the area?`, step.id, level);
    if (step.kind === "comparison-count") return say(level === 0 ? "step.invite" : level === 1 ? "step.point" : "step.operation", step.side === "left"
      ? "Which numbers on the die are even? How many are there?"
      : `Which numbers on the die are less than ${op.operands[0]}? How many are there?`, step.id, level);
    if (step.kind === "comparison") return say(level === 0 ? "step.invite" : level === 1 ? "step.point" : "step.operation", op.context === "same-denominator"
      ? `The fractions have the same denominator. Compare the numerators: ${step.left} and ${step.right}. Which is greater?`
      : `Compare ${step.left} and ${step.right}. Which is greater?`, step.id, level);
    return [];
  };
  const circle = pkg.item?.format === "circle";
  const final = () => circle ? [offer("step.invite", "confirm.claim", { first: words[0], second: words[1] }, { slots: { step: "result" }, level: 0 })]
    : say("step.invite", `Which answer will you write: ${words[0]} or ${words[1]}?`, "result", 0);
  const close = () => say("close.honest", "This comparison needs more practice. Ask a grown-up to work on it with you.");
  return {
    ...shared,
    question: () => say("question.problem", question), assess: () => say("assess.ask", "Tell me how you will compare them."),
    help: id => id === "result" ? final() : find(id) ? [0, 1, 2].flatMap(level => invite(find(id)!, level as 0 | 1 | 2)) : [],
    rightStep: id => {
      const st = find(id);
      return st ? say("check.right_step", st.kind === "operate" ? `That area is ${st.value} squares.` : "That step is right.", id, undefined, { answer: "right", step: id }) : [];
    },
    rightStepShort: id => say("check.right_step", "That step is right.", id, undefined, { answer: "right", step: id }),
    notYet: id => say("check.not_yet", "Check that comparison step again.", id, undefined, { answer: "wrong", step: id }),
    explain: () => say("check.explain", "Tell me how you will compare them.", "compare"),
    exampleIntro: () => say("example.intro", `Try a new example. ${comparisonText(pkg.easierExample.operation as typeof op)}`),
    exampleStep: id => {
      const st = pkg.easierExample.steps.find(s => s.id === id);
      if (!st) return [];
      if (st.kind === "result") return say("example.step", `For this example, the answer is ${pkg.easierExample.answer.type === "choice" || pkg.easierExample.answer.type === "text" ? pkg.easierExample.answer.value : ""}.`, id);
      if (st.kind === "operate") return say("example.step", `${st.left} ${st.left === 1 ? "row" : "rows"} of ${st.right} ${st.right === 1 ? "square" : "squares"} ${st.left === 1 ? "makes" : "make"} ${st.value} ${st.value === 1 ? "square" : "squares"}.`, id);
      if (st.kind === "comparison") return say("example.step", `${st.left} is ${st.left > st.right ? "greater" : "less"} than ${st.right}.`, id);
      return say("example.step", stepText(st, pkg.easierExample.operation), id);
    },
    tryTarget: () => say("try.target", "Now compare the amounts in your question."),
    answerRight: () => say("answer.right", "That answer is right."), answerGive: () => [], answerParts: () => [],
    writeAnswer: () => circle ? [offer("write.answer", "write.claim", { word: pkg.answer.value.type === "choice" ? pkg.answer.value.value : "" }, { slots: {} })] : say("write.answer", "Write your answer on the page."),
    writeYours: () => circle ? [offer("write.yours", "write.claim.yours", {}, { slots: {} })] : say("write.yours", "Write your answer on the page."),
    which: () => circle ? [offer("confirm.claim", "confirm.claim", { first: words[0], second: words[1] }, { slots: {} })] : say("confirm.claim", `Which answer do you mean: ${words[0]} or ${words[1]}?`),
    said: word => words.includes(word) ? [circle
      ? offer("confirm.word", "confirm.claim.said", { heard: word }, { slots: { heard: word } })
      : offer("confirm.word", "comparison.words", { words: `You said ${word}. Is that your answer?` }, { slots: { heard: word } })] : [],
    honestClose: close, closeHonest: close, closeUnsolved: close,
    stepIds: pkg.steps.filter(s => s.kind !== "result").map(s => s.id),
  };
}
