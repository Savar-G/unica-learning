// Reads the equations of a worked step and says whether they are true. It knows no shape.
const NUMBER = String.raw`\d+(?:\.\d+)?`;
const SIGN = "[-+−–×÷]";
/** One equation that is not a part of a longer one: "3 × 4 = 12" or "2 + 3 + 4 = 9". */
const EQUATION = new RegExp(String.raw`(?<![\d.]|${SIGN} ?|= ?)(${NUMBER}(?: ${SIGN} ${NUMBER})+) = (${NUMBER})(?![\d.]| ?${SIGN}| ?=)`, "g");

function apply(left: number, sign: string, right: number): number {
  if (sign === "+") return left + right;
  if (sign === "×") return left * right;
  return sign === "÷" ? left / right : left - right;
}

/** The value of "2 + 3 × 4": first × and ÷, then + and -. */
function valueOf(text: string): number {
  const parts = text.split(" ");
  const sums: (number | string)[] = [Number(parts[0])];
  for (let i = 1; i < parts.length; i += 2) {
    const [sign, next] = [parts[i], Number(parts[i + 1])];
    if (sign === "×" || sign === "÷") sums.push(apply(Number(sums.pop()), sign, next));
    else sums.push(sign, next);
  }
  let value = Number(sums[0]);
  for (let i = 1; i < sums.length; i += 2) value = apply(value, String(sums[i]), Number(sums[i + 1]));
  return value;
}

export interface ReadStep {
  /** The equations that are not true. */
  wrong: string[];
  /** Whether the step holds only equations, so that nothing in it is unproven. */
  whole: boolean;
}

export function readStep(step: string): ReadStep {
  const equations = [...step.matchAll(EQUATION)];
  return {
    wrong: equations.filter(([, left, right]) => valueOf(left) !== Number(right)).map(([equation]) => equation),
    whole: equations.length > 0 && step.replace(EQUATION, "").replace(/[\s,;.]/g, "") === "",
  };
}
