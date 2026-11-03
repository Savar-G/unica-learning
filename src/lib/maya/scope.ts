// Scope is an intersection: checked package, curriculum edges, then the model's stricter reading.
// No model field can supply a question, operands, example or curriculum edge.
import { BC_SKILL_MAP } from "@/lib/assessment";
import { operationText, type OperationPackage } from "@/lib/question-package";
import { readNumbers } from "./numbers";

export const SCOPE_REASONS = ["outside_work", "other_person", "changed_problem", "other_topic", "unverified_request", "model_scope"] as const;
export type ScopeReason = typeof SCOPE_REASONS[number];
export interface ScopeRefusal { at: number; reason: ScopeReason }
export const SCOPE_LABELS: Record<ScopeReason, string> = {
  outside_work: "Outside homework or schoolwork", other_person: "Another person's question",
  changed_problem: "Different question or numbers", other_topic: "Another topic",
  unverified_request: "Request outside the checked question", model_scope: "Model requested a scope limit",
};

const skills = new Map(BC_SKILL_MAP.standards.flatMap(s => s.skills.map(k => [k.id, k] as const)));
/** Only the package's skills and their direct prerequisites. No neighbouring standard or forward edge. */
export function scopeSkills(pkg: OperationPackage): string[] {
  return [...new Set(pkg.skill.skills.flatMap(id => skills.has(id) ? [id, ...skills.get(id)!.requires] : []))];
}

const plain = (text: string) => text.normalize("NFKC").replace(/\u2212/g, "-").replace(/[’‘]/g, "'").replace(/[\u200B-\u200F\u2060\uFEFF]/g, "").toLowerCase();
const request = /\?|\b(?:can|could|would|will) you\b|(?:^|[.!]\s+)(?:please\s+)?(?:what|why|how|who|where|when|tell|teach|explain|solve|calculate|write|help|show)\b/;
// These words name help with the current checked work. All other request words must come from the package's
// skill or its direct prerequisites. Numbers never gain permission from this vocabulary.
const HELP_WORDS = new Set(("a an the i you we me my our it this that these those is are was were be do does did don't not no can't cannot can could would should will shall have has had to of for with in on at from into by and or but so if as then again now please okay ok yes hi hello hey yep idea hmm um uh it's i'm you're i've maybe grade pass kid world smartest tomorrow you'll come back i'll test finish help why what how which when where help explain show tell try start stuck understand know get got answer result question problem work out step next first last need more slower slowly shorter less talk repeat say said hear heard meant mean board see write writing wrote written paper done finished stop goodbye bye real person robot ai helper secret friend only friends promise best teacher smartest pets pet dog cat food favourite birthday live family school games game like keep you'll tomorrow just want didn't anything whiteboard oh extra make about feel feeling sad happy tired bored frustrated angry worried sick rude thanks thank think sure because carry carried carrying regroup exchange borrow borrowing ones tens hundreds thousands column columns add adding plus subtract subtracting minus take away multiply multiplication times divide division equal equals makes made put under over top bottom all together digit digits number numbers point decimal fraction fractions numerator denominator simplify simplest common amount unit units square centimetres centimeters cm squared inch inches area perimeter" ).split(/\s+/));

export function scopeReason(pkg: OperationPackage, text: string, exampleChosen: boolean): ScopeReason | null {
  const t = plain(text);
  if (/\b(?:homework|schoolwork|worksheet|homework sheet|essay|book report|assignment|teacher (?:said|says).*\b(?:teach|solve|homework)\b|ignore (?:your|the|all) rules|forget (?:your|the) rules|answer key)\b/.test(t)) return "outside_work";
  if (/\b(?:sibling|brother|sister|friend)'?s?\b.*\b(?:question|problem|workbook|help|homework)\b|\b(?:i am|i'm|this is) (?:her|his|their|the) (?:sister|brother|sibling|friend)\b/.test(t)) return "other_person";
  if (/\b(?:science|history|geography|english|spelling|grammar|poem|story|capital|weather|news|joke|trivia|chat about|talk about)\b/.test(t) && request.test(t)) return "other_topic";

  // Every binary expression must be one in the package or its worked steps. Use the existing spoken-number
  // reader, so "twenty eight plus forty one" has the same boundary as "28 + 41".
  const examples = exampleChosen ? [pkg.easierExample] : [];
  const problems = [pkg, ...examples];
  const allNumbers = (raw: unknown): number[] => typeof raw === "number" ? [raw] : Array.isArray(raw) ? raw.flatMap(allNumbers)
    : raw !== null && typeof raw === "object" ? Object.values(raw).flatMap(allNumbers) : [];
  const known = allNumbers(problems.map(p => [p.operation, p.steps]));
  for (const p of problems) for (const s of p.steps) {
    if (s.kind === "subtract-column") known.push(s.top - Number(s.lent) + (s.regrouped ? 10 : 0));
    if (s.kind === "add-column") known.push(10 * s.carryOut);
  }
  const pairs: number[][] = [];
  for (const p of problems) for (const step of p.steps) {
    if (step.kind === "add-column") {
      const terms = [...step.digits, ...(step.carryIn ? [step.carryIn] : [])];
      for (let i = 1; i < terms.length; i++) {
        pairs.push([terms[i - 1], terms[i]]);
        const scale = step.place === "tens" ? 10 : step.place === "hundreds" ? 100 : step.place === "thousands" ? 1000 : 1;
        pairs.push([terms[i - 1] * scale, terms[i] * scale]);
      }
    }
    if (step.kind === "subtract-column" && step.bottom !== null) pairs.push([step.top - Number(step.lent) + (step.regrouped ? 10 : 0), step.bottom]);
    if (step.kind === "multiply-digit" && step.top !== null) pairs.push([step.top, step.multiplier]);
    if (step.kind === "combine-numerators") for (let i = 1; i < step.numerators.length; i++) pairs.push([step.numerators[i - 1], step.numerators[i]]);
  }
  const numbers = readNumbers(t);
  const asksNew = /\b(?:solve|calculate|teach|what is|what's|what does|what about|how much|help.*with|replace|change|use these)\b/.test(t);
  const operationWords = t.match(/\b(?:plus|minus|times|multiplied|divided|take away|add|added|adding|subtract|subtracted|subtracting|multiply|divide|x)\b|[+×*÷]|(?<=\d)\s*-\s*(?=\d)/g) ?? [];
  const kind = pkg.operation.kind;
  if (numbers.operand.some(Boolean) && (/\bminus\b|(?<=\d)\s*-\s*(?=\d)/.test(t)) && !kind.includes("subtract") && !/\bi did\b/.test(t)) return "changed_problem";
  if (operationWords.some(w => /times|multipl|x|[×*]/.test(w) ? !kind.includes("multiply") : /divid|÷/.test(w) ? !kind.includes("divide") && !kind.startsWith("fraction") : false)) return "changed_problem";
  for (const sentence of t.split(/[!?;\n]|\.(?=\s|$)|,\s*and\s+/)) {
    if (!/\b(?:plus|minus|times|multiplied|divided|take away|add|added|adding|subtract|subtracted|subtracting|multiply|divide|x)\b|[+×*÷]|(?<=\d)\s*-\s*(?=\d)/.test(sentence)) continue;
    const expression = readNumbers(sentence);
    for (let i = 1; i < expression.values.length; i++) {
      if (!expression.operand[i] || expression.notAnswer[i] || operationWords.length === 0) continue;
      const a = expression.values[i - 1], b = expression.values[i];
      const pair = JSON.stringify([a, b]);
      const allowed = problems.some(p => JSON.stringify(readNumbers(plain(operationText(p.operation))).values.slice(0, 2)) === pair);
      // The checked worked steps supply the column digits and regroup values. This does not authorise a new target.
      const inSteps = a.type === "number" && b.type === "number" && pairs.some(([x, y]) => x === a.value && y === b.value);
      // A completed compensation method can use the neighbouring ten, but only with a package operand and a
      // checked final result. It never authorises a request to teach that expression as another problem.
      const compensation = !asksNew && /\bi did\b/.test(t) && pkg.operation.operands.some(n => typeof n === "number" && a.type === "number" && n === a.value) &&
        numbers.values.at(-1)?.type === "number" && JSON.stringify(numbers.values.at(-1)) === JSON.stringify(pkg.answer.value);
      if (!allowed && !inSteps && !compensation) return "changed_problem";
    }
  }
  if (operationWords.length === 0 && numbers.values.length > 1 && (asksNew || request.test(t)) &&
      !(t.includes(" or ") && !asksNew) &&
      !/\b(?:i got|i think|is it|because|since|no|wait|said|heard|ones|tens|hundreds|answer)\b/.test(t) &&
      numbers.values.some(v => v.type === "number" && !known.includes(v.value))) return "changed_problem";

  if (/\b(?:let's chat|can we chat|tell me about|teach me about)\b/.test(t) && !/\b(?:question|step|carry|regroup|ones|tens)\b/.test(t)) return "other_topic";
  if (request.test(t) && !(/\b(?:because|since)\b/.test(t) && !t.includes("?"))) {
    const vocabulary = new Set(HELP_WORDS);
    for (const word of "multiply multiplication times divide division decimal fraction fractions numerator denominator simplify simplest common area perimeter".split(" ")) vocabulary.delete(word);
    // The operation's own terms are useful even when the skill uses a different inflection.
    const family = pkg.operation.kind;
    if (family.includes("multiply")) for (const w of ["multiply", "multiplication", "times"]) vocabulary.add(w);
    if (family.includes("divide")) for (const w of ["divide", "division"]) vocabulary.add(w);
    if (family.includes("fraction")) for (const w of ["fraction", "fractions", "numerator", "denominator", "simplify", "simplest", "common", "divide"]) vocabulary.add(w);
    if (family.includes("decimal")) vocabulary.add("decimal");
    if (pkg.text.toLowerCase().includes("area")) vocabulary.add("area");
    for (const id of scopeSkills(pkg)) for (const w of plain(skills.get(id)!.text).match(/[a-z']+/g) ?? []) vocabulary.add(w);
    // Exact number forms belong to the existing reader. Unknown words in a request fail closed.
    for (const w of t.match(/[a-z']+/g) ?? []) {
      if (!vocabulary.has(w) && readNumbers(w).values.length === 0) return "unverified_request";
    }
  }
  return null;
}
