// Helpers for the grades 3-5 bank (#75): numbers, fractions, decimals, money and times as the child sees them, and
// as a browser voice should say them. The voice reads "3/8" as a date and "4:05" as "four colon zero five", so every
// read-aloud text uses the word forms here.
import type { Template } from "../../types";
import { draw, wrong } from "../kit";
import type { MisconceptionId } from "../../misconceptions";
import type { Rng } from "../../rng";
import type { CodedWrong } from "../../types";

/** 3742 -> "3,742". Typed answers stay without commas; the marker ignores commas. */
export const fmt = (n: number) => n.toLocaleString("en-CA");

/** Fixed decimals without float noise: dec(725, 2) is "7.25". */
export const dec = (units: number, places: number) => (units / 10 ** places).toFixed(places);

/** A decimal with no trailing zeros: plain(7.50) is "7.5". */
export const plain = (value: number) => String(Number(value.toFixed(6)));

const DENOMINATORS: Record<number, [string, string]> = {
  2: ["half", "halves"], 3: ["third", "thirds"], 4: ["fourth", "fourths"], 5: ["fifth", "fifths"], 6: ["sixth", "sixths"],
  7: ["seventh", "sevenths"], 8: ["eighth", "eighths"], 9: ["ninth", "ninths"], 10: ["tenth", "tenths"], 12: ["twelfth", "twelfths"],
  100: ["hundredth", "hundredths"], 1000: ["thousandth", "thousandths"],
};

/** "3/8" on screen. */
export const frac = (n: number, d: number) => `${n}/${d}`;

/** "3 eighths", "1 half": a fraction as a voice should say it. Denominators without a word fall back to "n out of d". */
export function sayFrac(n: number, d: number): string {
  const word = DENOMINATORS[d];
  if (!word) return `${n} out of ${d}`;
  return `${n} ${n === 1 ? word[0] : word[1]}`;
}

/** The plural word for a denominator: "eighths". */
export const parts = (d: number) => DENOMINATORS[d]?.[1] ?? `parts out of ${d}`;

/** "2 1/3" on screen. */
export const mixed = (whole: number, n: number, d: number) => `${whole} ${n}/${d}`;
/** "2 and 1 third". */
export const sayMixed = (whole: number, n: number, d: number) => `${whole} and ${sayFrac(n, d)}`;

/** Cents as money on screen: 1305 -> "$13.05". */
export const money = (cents: number) => `$${fmt(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, "0")}`;
/** Cents as a typed answer: 1305 -> "13.05". */
export const moneyAnswer = (cents: number) => (cents / 100).toFixed(2);
/** Cents in words: 1305 -> "13 dollars and 5 cents". */
export function sayMoney(cents: number): string {
  const d = Math.floor(cents / 100), c = cents % 100;
  const dollars = `${fmt(d)} ${d === 1 ? "dollar" : "dollars"}`;
  if (c === 0) return dollars;
  const cs = `${c} ${c === 1 ? "cent" : "cents"}`;
  return d === 0 ? cs : `${dollars} and ${cs}`;
}

/** A clock time on screen: (4, 5) -> "4:05"; with a half day, "4:05 p.m.". */
export const time = (h: number, m: number, half?: "a.m." | "p.m.") => `${h}:${String(m).padStart(2, "0")}${half ? ` ${half}` : ""}`;
/** A clock time as a voice should say it: "4 o'clock", "4 oh 5", "4 35". */
export function sayTime(h: number, m: number, half?: "a.m." | "p.m."): string {
  const spoken = m === 0 ? `${h} o'clock` : m < 10 ? `${h} oh ${m}` : `${h} ${m}`;
  return half ? `${spoken} ${half === "a.m." ? "a m" : "p m"}` : spoken;
}

/**
 * Coded wrong answers for a choice question: the candidates in order, without repeats and without the answer, cut to
 * `count`. Returns null when too few are left, so a template can draw again.
 */
export function pickWrong(answer: string, candidates: readonly CodedWrong[], count = 3): CodedWrong[] | null {
  const seen = new Set([answer]);
  const out: CodedWrong[] = [];
  for (const c of candidates) {
    if (seen.has(c.value)) continue;
    seen.add(c.value);
    out.push(c);
    if (out.length === count) return out;
  }
  return null;
}

/** Draws numbers until `pickWrong` finds `count` distinct coded wrong answers, then returns both. */
export function drawChoices<T>(
  rng: Rng,
  make: (rng: Rng) => T,
  build: (v: T) => { answer: string; candidates: CodedWrong[] },
  count = 3,
): { v: T; answer: string; wrong: CodedWrong[] } {
  const v = draw(rng, make, (x) => {
    const b = build(x);
    return pickWrong(b.answer, b.candidates, count) !== null;
  });
  const b = build(v);
  return { v, answer: b.answer, wrong: pickWrong(b.answer, b.candidates, count)! };
}

/** Typed-answer wrong values: only those that differ from the answer and from each other, and are not negative. */
export function typedWrong(answer: number, candidates: readonly [number, MisconceptionId][]): CodedWrong[] {
  const seen = new Set([plain(answer)]);
  const out: CodedWrong[] = [];
  for (const [v, m] of candidates) {
    const key = plain(v);
    if (v < 0 || !Number.isFinite(v) || seen.has(key)) continue;
    seen.add(key);
    out.push(wrong(key, m));
  }
  return out;
}

/** Keeps a sum, a product or an equation on one line: the spaces around + − × ÷ and = do not break. */
const keepTogether = (text: string) => text.replace(/ ([+−×÷=]) /g, " $1 ");

/** Explicit words for these templates' choices, including equations, times and fractions inside labels. */
function speakChoice(text: string): string {
  if (/^\d[\d,]*(?:, \d[\d,]*)+$/.test(text)) return text.split(", ").join(" then ");
  return text.replace(/ /g, " ")
    .replace(/\$(\d[\d,]*)\.(\d{1,2})\b/g, (_, d, c) => sayMoney(Number(d.replace(/,/g, "")) * 100 + Number(c.padEnd(2, "0"))))
    .replace(/\$(\d[\d,]*)\b/g, (_, d) => sayMoney(Number(d.replace(/,/g, "")) * 100))
    .replace(/\b(\d+):(\d{2})(?: (a\.m\.|p\.m\.))?/g, (_, h, m, half) => sayTime(Number(h), Number(m), half))
    .replace(/\b(\d+) (\d+)\/(\d+)\b/g, (_, w, n, d) => sayMixed(Number(w), Number(n), Number(d)))
    .replace(/\b(\d+)\/(\d+)\b/g, (_, n, d) => sayFrac(Number(n), Number(d)))
    .replace(/×/g, "times").replace(/÷/g, "divided by").replace(/\+/g, "plus")
    .replace(/−/g, "minus").replace(/=/g, "is the same as").replace(/\?/g, "the missing number")
    .replace(/%/g, " percent").replace(/\bcm\b/g, "centimetres").replace(/\bmL\b/g, "millilitres");
}

/** Equivalent numeric spellings must not make two choices, such as 1/2 and 3/6. */
const choiceIdentity = (shown: string) => {
  const text = shown.replaceAll(",", "").replaceAll(" ", " ").trim();
  const f = text.match(/^(?:(\d+) )?(\d+)\/(\d+)$/);
  const number = f && Number(f[3]) > 0 ? Number(f[1] ?? 0) + Number(f[2]) / Number(f[3])
    : /^\$?\d+(?:\.\d+)?$/.test(text) ? Number(text.replace(/^\$/, "")) : NaN;
  return Number.isFinite(number) ? `number:${number.toPrecision(12)}` : `text:${shown}`;
};

/** The template, with every operation sign in its prompt and choices kept on the same line as its numbers. */
export function keepOnOneLine<T extends Template>(template: T): T {
  return {
    ...template,
    fill(rng) {
      const f = template.fill(rng);
      const seen = new Set([choiceIdentity(f.answer)]);
      const wrong = template.format === "choice" ? f.wrong.filter((w) => {
        const key = choiceIdentity(w.value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }) : f.wrong;
      const choices = [f.answer, ...wrong.map((w) => w.value)];
      return {
        ...f,
        prompt: keepTogether(f.prompt),
        answer: keepTogether(f.answer),
        wrong: wrong.map((w) => ({ ...w, value: keepTogether(w.value) })),
        ...(template.format === "choice" ? { say: Object.fromEntries(choices.map((c) => [keepTogether(c), f.say?.[c] ?? speakChoice(c)]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) } : {}),
      };
    },
  };
}
