// Reads the equations of a worked step and says whether they are true. It knows no shape.
const NUMBER = String.raw`-?\d+(?:\.\d+)?`;
/** One whole part of a step: "3 × 4 = 12", "2 + 3 + 4 = 9" or "2 - 3 = -1". */
const EQUATION = new RegExp(String.raw`^(${NUMBER}(?: [-+×÷] ${NUMBER})+) = (${NUMBER})$`);
/** What ends a part. A comma in "1,000" or a period in "1.5" does not. */
const PART_END = /[,.;:](?:\s+|$)/;

/** An exact fraction. The bottom is 0 after a division by zero, and then no equation is true. */
interface Exact { top: bigint; bottom: bigint }

function exact(text: string): Exact {
  const [whole, decimals = ""] = text.split(".");
  return { top: BigInt(whole + decimals), bottom: BigInt(10) ** BigInt(decimals.length) };
}

function apply(a: Exact, sign: string, b: Exact): Exact {
  if (sign === "×") return { top: a.top * b.top, bottom: a.bottom * b.bottom };
  if (sign === "÷") return { top: a.top * b.bottom, bottom: a.bottom * b.top };
  const other = sign === "+" ? b.top : -b.top;
  return { top: a.top * b.bottom + other * a.bottom, bottom: a.bottom * b.bottom };
}

/** The value of "2 + 3 × 4": first × and ÷, then + and -. */
function valueOf(text: string): Exact {
  const parts = text.split(" ");
  const terms: Exact[] = [exact(parts[0])];
  const signs: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const next = exact(parts[i + 1]);
    if (parts[i] === "×" || parts[i] === "÷") terms.push(apply(terms.pop()!, parts[i], next));
    else {
      signs.push(parts[i]);
      terms.push(next);
    }
  }
  return terms.slice(1).reduce((sum, term, i) => apply(sum, signs[i], term), terms[0]);
}

const isTrue = (left: string, right: string): boolean => {
  const [a, b] = [valueOf(left), exact(right)];
  return a.bottom !== BigInt(0) && a.top * b.bottom === b.top * a.bottom;
};

export interface ReadStep {
  /** The equations that are not true. */
  wrong: string[];
  /** The parts with an equals sign that are no equation that this file can read. */
  unread: string[];
}

/** Each part of the step that holds an equals sign is read or refused, so that none is left unproven. */
export function readStep(step: string): ReadStep {
  const found: ReadStep = { wrong: [], unread: [] };
  for (const part of step.split(PART_END).map((p) => p.trim()).filter((p) => p.includes("="))) {
    // The minus sign and the en dash are a minus too.
    const equation = EQUATION.exec(part.replace(/[−–]/g, "-"));
    if (!equation) found.unread.push(part);
    else if (!isTrue(equation[1], equation[2])) found.wrong.push(part);
  }
  return found;
}
