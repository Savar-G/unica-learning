// Pattern wording uses checked evaluate steps. All new wording waits for Savar's approval.
import { workedSteps, type OperationPackage, type WorkedStep } from "@/lib/question-package";
import { patternOf, type Pattern } from "./pattern";
import type { LineId, LineOffer, TemplateKey } from "./lines";

export const PATTERN_TEMPLATES = {
  // A part's question. {reason} is code's sentence for what the part finds ("Subtract the start.").
  "pattern.ask": [
    "{reason} What is {part}?", "{reason} Can you work out {part}?", "{reason} What do you get for {part}?",
    "{reason} Try {part}. What is it?", "{reason} Now work out {part}.",
  ],
  "pattern.point": [
    "{reason} {part} finds it. What do you get?", "{reason} Use {part} for this. What is it?", "{reason} Work out {part} to find it.",
    "{reason} {part} gives this number. What is it?", "{reason} The part to work out is {part}.",
  ],
  "pattern.show": [
    "{reason} {part} = {value}.", "{reason} Look: {part} = {value}.", "{reason} Here it is: {part} = {value}.",
    "{reason} We get {part} = {value}.", "{reason} Watch: {part} = {value}.",
  ],
  // A question about the part ("Why do I subtract the start?"): code's answer, with the part's own numbers.
  "pattern.why": ["{why}", "Here's why. {why}", "Let's see. {why}", "Look closely. {why}", "Here's how. {why}"],
  // The last part, a division: its multiplication fact ("2 × ? = 14."), never the value.
  "pattern.fact": [
    "{reason} {fact} What number makes it true?", "{reason} Think: {fact} Which number fits?", "{reason} {fact} What is the missing number?",
    "{reason} Use a times fact: {fact} What number fits?", "{reason} {fact} Which number works?",
  ],
  "pattern.count": [
    "Count by {by} up to {total}. How many {by}s is that?", "Skip count by {by} to {total}. How many {by}s?",
    "Start at 0 and count by {by} to {total}. How many jumps?", "Jump by {by} from 0 to {total}. How many jumps is that?",
    "Count by {by}s until you reach {total}. How many did you count?",
  ],
  // The last part, an addition: by its columns.
  "pattern.columns": [
    "Add the ones first. Next add the tens. What is {part}?", "Start with the ones. Next add the tens. What is {part}?",
    "Line up the ones and the tens. What is {part}?", "Work out {part} one column at a time. Start with the ones.",
    "Add the ones. Next add the tens. What do you get for {part}?",
  ],
  "pattern.example": [
    "Let's try a smaller pattern first.", "Here's a smaller pattern to warm up.", "Let me show you a smaller pattern.",
    "Let's warm up with a smaller pattern.", "First, a smaller pattern.",
  ],
  "pattern.try": [
    "Now try your pattern. Count the steps from the start.", "Your turn! Count the steps from the start.",
    "Now it's your pattern. Count the steps from the start.", "Over to you! Count the steps from the start.",
    "Back to yours. Count the steps from the start.",
  ],
  // The honest close (lessons 7 and 10): a child still stuck after the easier example. It says the pattern is hard, that
  // it is fine to stop, and one next step. It never hints at the answer and holds no math.
  "pattern.close": [
    "This one is hard, and it's fine to stop here. Try the smaller pattern on paper later.",
    "This pattern is a hard one. It's okay to stop now. You can ask a grown-up to try it with you.",
    "That was a tricky pattern. It's fine to stop here. Try the smaller pattern again on paper.",
    "This one is hard, and that's okay. Let's stop here. Ask a grown-up to look at it with you.",
    "Patterns like this take practice. It's fine to stop now. Try the smaller one on paper later.",
  ],
  "pattern.answer": ["Yes! You got {answer}.", "That's right: {answer}.", "You got it! It's {answer}.", "Exactly! {answer}.", "Well done! It's {answer}."],
} as const;

/** The workbook opening for a pattern: never the expression, which would say the method before the child tries. */
export const PATTERN_OPENING = "Hi, I'm Maya, an AI helper. Let's do page {page}, number {number}, the pattern.";

type Offer = (line: LineId, key: TemplateKey, vars: Record<string, string | number>, extra: Omit<LineOffer, "line" | "texts" | "key">) => LineOffer;

/** Pattern steps are arithmetic parts, under the existing operate-step credit rules, without a new step kind. */
export function patternSteps(pkg: OperationPackage): WorkedStep[] | null {
  return patternOf(pkg) ? workedSteps(pkg.operation).filter(s => s.kind === "operate").slice(0, -1) : null;
}

/** Each line names what this part finds, including a first hint at H1, H2 or H3. */
function reason(p: Pattern, index: number): string {
  if (p.missing) return index === 0 ? `There are ${p.count} equal steps. Subtract the start.` : `Share the increase across ${p.count} equal steps.`;
  if (p.form === "pair") return ["The eighth term takes seven steps.", "Add the start for the eighth term.", "The second term takes one step.", "Add the two terms."][index];
  if (index > 0) return "Add the start after the steps.";
  return p.form === "term4" ? "The fourth term takes three steps." : `Count ${p.count} steps after the start.`;
}

const ORDINAL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 8: "8th", 9: "9th" };
/** Any term's ordinal ("9th", "11th", "22nd"). */
const ordinal = (n: number) => ORDINAL[n] ?? `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** Why this part comes now, in code's words, with the part's own numbers ("Why do I subtract the start?"). */
function why(p: Pattern, index: number, part: string): string {
  if (p.missing) return index === 0
    ? `The ${ORDINAL[p.count + 1]} term is ${p.count} equal steps past the start. ${part} is what they add.`
    // F2: not the plan line in other words ("Share the increase across 8 equal steps."): the jumps between the two terms.
    : `The 1st and ${ordinal(p.count + 1)} terms are ${p.count} equal jumps apart. Find one jump: ${part}.`;
  if (p.form === "pair") return [
    `The 8th term is 7 steps after the 1st term: ${part}.`, `The 7 steps come after the start, so add the start: ${part}.`,
    `The 2nd term is 1 step after the start: ${part}.`, `The question asks for the two terms together: ${part}.`][index];
  if (index > 0) return `The steps come after the start, so add the start: ${part}.`;
  if (p.form === "plant3") return `Each week adds ${p.step} cm once. So 3 weeks add ${part}.`;
  if (p.form === "days8") return `Each day adds ${p.step} once. So 8 days add ${part}.`;
  return `The start is the 1st term. The 4th term is 3 steps after it: ${part}.`;
}

/**
 * The last part has no H3: the child must give the final answer. Its H1 and H2 help without the value: a division
 * as its multiplication fact ("2 × ? = 14.") and counting by the divisor; an addition by its columns.
 */
export function patternHelp(pkg: OperationPackage, id: string, offer: Offer): LineOffer[] | null {
  const p = patternOf(pkg);
  if (!p) return null;
  const parts = workedSteps(pkg.operation).filter(s => s.kind === "operate");
  const index = id === "result" ? parts.length - 1 : parts.findIndex(s => s.id === id);
  if (index < 0) return [];
  const s = parts[index];
  const part = `${s.left} ${s.op} ${s.right}`;
  const vars = { reason: reason(p, index), part, value: s.value, why: why(p, index, part) };
  const slots = { step: id };
  const invite = offer("step.invite", "pattern.ask", vars, { slots, level: 0, board: part });
  const whyLine = offer("step.why", "pattern.why", vars, { slots, level: 1, board: part });
  if (id === "result") return [invite, ...(s.op === "÷" ? [
    offer("step.point", "pattern.fact", { ...vars, fact: `${s.right} × ? = ${s.left}.` }, { slots, level: 1, board: `${s.right} × ? = ${s.left}` }),
    offer("step.operation", "pattern.count", { by: s.right, total: s.left }, { slots, level: 2, board: part }),
  ] : [
    offer("step.point", "pattern.point", vars, { slots, level: 1, board: part }),
    offer("step.operation", "pattern.columns", vars, { slots, level: 2, board: part }),
  ]), whyLine];
  return [invite,
    offer("step.point", "pattern.point", vars, { slots, level: 1, board: part }),
    whyLine,
    offer("step.operation", "pattern.ask", vars, { slots, level: 2, board: part }),
    offer("step.show", "pattern.show", vars, { slots, level: 3, board: `${part} = ${s.value}` }),
  ];
}

/** Short example steps preserve the pattern framing, using the existing example_step pacing. */
export function patternExampleShow(pkg: OperationPackage, step: WorkedStep): string | null {
  const p = patternOf(pkg.easierExample);
  if (!p || step.kind !== "operate") return null;
  const index = workedSteps(p.operation).filter(s => s.kind === "operate").findIndex(s => s.id === step.id);
  return `${reason(p, index)} ${step.left} ${step.op} ${step.right} = ${step.value}.`;
}

/** The honest close of a pattern the child is still stuck on (lessons 7 and 10): no answer, one next step. */
export function patternClose(pkg: OperationPackage, offer: Offer): LineOffer[] {
  return patternOf(pkg) ? [offer("close.together", "pattern.close", {}, { slots: {} })] : [];
}

/** A pattern's top help on a step: the highest hint level its lines have (H3 on a work step, H2 on the last part). */
export function patternTopHint(pkg: OperationPackage, id: string, offer: Offer): number | null {
  const help = patternHelp(pkg, id, offer);
  return help ? Math.max(0, ...help.map(o => o.level ?? 0)) : null;
}
