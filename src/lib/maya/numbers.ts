// The numbers in a spoken or written turn (#321): what the child said, as speech-to-text writes it ("66", "sixty-six",
// "sixty six", "two hundred and five", "0.85", "point eight five", "3/4", "three over four"), and what Maya says. The
// session uses it to check that an answer the model read from the child's turn was really said, and that Maya does not
// say the answer before she may. Pure TypeScript.
import type { AnswerValue } from "@/lib/question-package";

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

type Kind = "unit" | "teen" | "ten" | "hundred" | "thousand";

const kindOf = (word: string): Kind | null =>
  word in UNITS ? "unit" : word in TEENS ? "teen" : word in TENS ? "ten" : word === "hundred" ? "hundred" : word === "thousand" ? "thousand" : null;
const valueOf = (word: string) => UNITS[word] ?? TEENS[word] ?? TENS[word];

/** A token: a written number ("1,234", "0.85", "3/4"), a word, or a fraction bar between two numbers ("over"). */
const TOKEN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\/|[a-z]+/g;

/**
 * The numbers and fractions in a text, in order. Number words join into one number ("sixty six" is 66); a new number
 * starts where the words cannot continue one ("sixty... no, sixty-six" is 60 and 66; "fifteen or fifty" is 15 and 50).
 */
export function valuesIn(text: string): AnswerValue[] {
  const tokens = text.toLowerCase().replace(/-/g, " ").match(TOKEN) ?? [];
  // First the numbers, with a fraction bar where one was said; then each "number bar number" becomes a fraction.
  const items: (number | "bar")[] = [];
  let total = 0;
  let current = 0;
  let last: Kind | null = null;
  let decimals = "";
  const flush = () => {
    if (last === null && decimals === "") return;
    const whole = total + current;
    items.push(decimals ? Number(`${whole}.${decimals}`) : whole);
    total = current = 0;
    last = null;
    decimals = "";
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^\d/.test(token)) {
      flush();
      items.push(Number(token.replace(/,/g, "")));
      continue;
    }
    if (token === "/" || token === "over") {
      flush();
      items.push("bar");
      continue;
    }
    if (token === "point" && kindOf(tokens[i + 1] ?? "") === "unit") {
      // "point eight five": the digits after the point, one word each.
      last ??= "unit";
      while (kindOf(tokens[i + 1] ?? "") === "unit") decimals += String(valueOf(tokens[++i]));
      flush();
      continue;
    }
    if (token === "and" && last !== null && kindOf(tokens[i + 1] ?? "") !== null) continue;
    const kind = kindOf(token);
    if (kind === null) {
      flush();
      continue;
    }
    switch (kind) {
      case "unit":
        if (last === "unit" || last === "teen") flush();
        current += valueOf(token);
        break;
      case "teen":
      case "ten":
        if (last === "unit" || last === "teen" || last === "ten") flush();
        current += valueOf(token);
        break;
      case "hundred":
        current = (last === null ? 1 : current) * 100;
        break;
      case "thousand":
        total += (last === null ? 1 : current) * 1000;
        current = 0;
        break;
    }
    last = kind;
  }
  flush();

  const values: AnswerValue[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === "bar") continue;
    const [bar, below] = [items[i + 1], items[i + 2]];
    if (bar === "bar" && typeof below === "number" && Number.isInteger(item) && Number.isInteger(below) && below > 0) {
      values.push({ type: "fraction", numerator: item, denominator: below });
      i += 2;
    } else {
      values.push({ type: "number", value: item });
    }
  }
  return values;
}
