// The worked example of each "Use 2 ways" method pair (#1214): one made-up question solved both ways, printed above the
// first question that names the pair, so no question asks for a method the book has not shown. Written by code, never by
// the AI, and never with a number of the question it comes before. Pure TypeScript: no network, database or clock.
import type { Intro } from "./workbook-page";
import type { MethodPair } from "./workbook-two-ways";

type Method = { label: string; lines: string[] };
/** One candidate example: the numbers it prints (so a question's own numbers can be kept out of it) and its lines. */
interface Example { nums: number[]; question: string; methods: [Method, Method] }

/** The key the book's ledger records for a pair. */
export const pairKey = (pair: MethodPair): string => `${pair[0]}|${pair[1]}`;

const tens = (n: number) => Math.floor(n / 10) * 10;
const up = (n: number) => Math.ceil(n / 10) * 10;

/** Candidate examples of a pair, in the order they are tried; null for a pair with no example. */
function candidates(pair: MethodPair): Example[] | null {
  const [m1, m2] = pair;
  const ways = (a: string[], b: string[]): [Method, Method] => [{ label: m1, lines: a }, { label: m2, lines: b }];
  const key = pairKey(pair);
  const out: Example[] = [];
  switch (key) {
    case "add the tens, then the ones|make a friendly number first":
      for (const [a, b] of [[47, 28], [36, 29], [58, 25], [64, 38], [73, 19]]) {
        const at = tens(a), bt = tens(b), ao = a % 10, bo = b % 10, r = up(b);
        out.push({ nums: [a, b, a + b], question: `${a} + ${b} = ?`, methods: ways(
          [`${at} + ${bt} = ${at + bt}`, `${ao} + ${bo} = ${ao + bo}`, `${at + bt} + ${ao + bo} = [${a + b}]`],
          [`${b} is close to ${r}.`, `${a} + ${r} = ${a + r}`, `Take away the extra ${r - b}: ${a + r} − ${r - b} = [${a + b}]`]) });
      }
      return out;
    case "take away the tens, then the ones|count up from the smaller number":
      for (const [a, b] of [[74, 38], [82, 47], [91, 56], [63, 28], [85, 39]]) {
        const bt = tens(b), bo = b % 10, r = up(b);
        out.push({ nums: [a, b, a - b], question: `${a} − ${b} = ?`, methods: ways(
          [`${a} − ${bt} = ${a - bt}`, `${a - bt} − ${bo} = [${a - b}]`],
          [`Start at ${b}.`, `Count up to ${r}: ${r - b}.`, `Count up to ${a}: ${a - r} more.`, `${r - b} + ${a - r} = [${a - b}]`]) });
      }
      return out;
    case "split a number into parts|use a fact you know, then the zeros":
      for (const [a, b] of [[60, 7], [40, 6], [50, 8], [70, 4], [30, 9], [80, 3]]) {
        out.push({ nums: [a, b, a * b], question: `${a} × ${b} = ?`, methods: ways(
          [`${a} is ${a - 10} and 10.`, `${a - 10} × ${b} = ${(a - 10) * b}`, `10 × ${b} = ${10 * b}`, `${(a - 10) * b} + ${10 * b} = [${a * b}]`],
          [`${a / 10} × ${b} = ${(a / 10) * b}`, `Put the zero back: [${a * b}]`]) });
      }
      return out;
    case "split a number into parts|round up, then take away":
      for (const [x, b] of [[19, 6], [29, 4], [38, 5], [49, 3], [28, 7]]) {
        const t = tens(x), o = x % 10, r = up(x), d = r - x;
        out.push({ nums: [x, b, x * b], question: `${x} × ${b} = ?`, methods: ways(
          [`${x} is ${t} and ${o}.`, `${t} × ${b} = ${t * b}`, `${o} × ${b} = ${o * b}`, `${t * b} + ${o * b} = [${x * b}]`],
          [`${x} is just under ${r}.`, `${r} × ${b} = ${r * b}`, `Take away the extra: ${d} × ${b} = ${d * b}`, `${r * b} − ${d * b} = [${x * b}]`]) });
      }
      return out;
    case "share in groups|use a times fact":
      for (const [q, d] of [[8, 7], [6, 9], [7, 8], [9, 6], [7, 6]]) {
        const t = q * d;
        out.push({ nums: [t, d, q], question: `${t} ÷ ${d} = ?`, methods: ways(
          [`Share ${t} into ${d} equal groups.`, `Each group gets ${q}.`, `${t} ÷ ${d} = [${q}]`],
          [`${d} × ? = ${t}`, `${d} × ${q} = ${t}`, `So ${t} ÷ ${d} = [${q}]`]) });
      }
      return out;
    case "divide|count up in groups":
      for (const [k, q] of [[6, 9], [7, 8], [8, 6], [9, 7], [6, 7]]) {
        const t = k * q, list = Array.from({ length: q }, (_, i) => k * (i + 1)).join(", ");
        out.push({ nums: [k, t, q], question: `${k} × ? = ${t}`, methods: ways(
          [`${t} ÷ ${k} = [${q}]`, `Check: ${k} × ${q} = ${t}`],
          [`Count up in groups of ${k}: ${list}.`, `That is ${q} groups: ${k} × ${q} = ${t}.`, `The missing number is [${q}].`]) });
      }
      return out;
    case "list both sets of multiples|test multiples of the larger number":
      for (const [a, b] of [[4, 6], [6, 9], [3, 8], [10, 15]]) {
        const l = ((x, y) => { let m = x; while (m % y) m += x; return m; })(Math.max(a, b), Math.min(a, b));
        const upTo = (n: number) => Array.from({ length: l / n }, (_, i) => n * (i + 1)).join(", ");
        const hi = Math.max(a, b), lo = Math.min(a, b);
        const tests = Array.from({ length: l / hi }, (_, i) => `${hi * (i + 1)}: ${hi * (i + 1) % lo === 0 ? "yes" : "no"}`).join(". ");
        out.push({ nums: [a, b, l], question: `What is the least common multiple of ${a} and ${b}?`, methods: ways(
          [`Multiples of ${a}: ${upTo(a)}.`, `Multiples of ${b}: ${upTo(b)}.`, `First shared: [${l}].`],
          [`Is each multiple of ${hi} a multiple of ${lo}?`, `${tests}.`, `The first yes is [${l}].`]) });
      }
      return out;
  }
  return patternExamples(key, ways);
}

/** Pattern pairs: the jump, the first number, or a later number, going up or down. */
function patternExamples(key: string, ways: (a: string[], b: string[]) => [Method, Method]): Example[] | null {
  const out: Example[] = [];
  const down = key.includes("second number from the first") || key.startsWith("add one jump") || key.endsWith("take away all the jumps at once");
  const starts = [[135, 25], [260, 40], [340, 15], [415, 35], [520, 50]];
  for (const [f, j] of starts) {
    const g = down ? f - j : f + j, sign = down ? "−" : "+", verb = down ? "takes away" : "adds";
    if (key.startsWith("subtract the first number from the second") || key.startsWith("subtract the second number from the first")) {
      out.push({ nums: [f, g, j], question: `A pattern starts ${f}, ${g}. How much is ${down ? "taken away" : "added"} each time?`, methods: ways(
        [down ? `${f} − ${g} = [${j}]` : `${g} − ${f} = [${j}]`], [`Start at ${f}.`, `Count ${down ? "back" : "on"} to ${g}: that is [${j}].`]) });
    } else if (key.startsWith("take away one jump from the second number") || key.startsWith("add one jump to the second number")) {
      const s = f + j, first = down ? s + j : s - j;
      out.push({ nums: [s, j, first], question: `A pattern ${verb} ${j} each time. Its second number is ${s}. What is its first number?`, methods: ways(
        [`${s} ${down ? "+" : "−"} ${j} = [${first}]`], [`Start at ${s}.`, `Count ${down ? "on" : "back"} ${j}: [${first}].`]) });
    } else if (key.startsWith("write each number of the pattern in turn")) {
      const at = (k: number) => (down ? f - k * j : f + k * j);
      out.push({ nums: [f, j, at(4)], question: `A pattern starts ${f} and ${verb} ${j} each time. What is number 5?`, methods: ways(
        [`${[0, 1, 2, 3].map(at).join(", ")}, [${at(4)}]`], [`Number 5 is 4 jumps after the start.`, `4 × ${j} = ${4 * j}`, `${f} ${sign} ${4 * j} = [${at(4)}]`]) });
    } else return null;
  }
  return out;
}

/** A question's text as the book's tasks compare it: no spaces, one minus sign. */
export const taskText = (text: string): string => text.toLowerCase().replace(/\s+/g, "").replace(/[−–]/g, "-");

/**
 * The "Use 2 ways" strip of a pair: its first example that prints none of the question's numbers and is no question of the
 * book (`taken`, by taskText: a printed answer must never be another question's), else the first that is no question
 * of the book, else the first; null for a pair with no example.
 */
export function methodIntro(pair: MethodPair, avoid: readonly number[], taken: ReadonlySet<string> = new Set()): Intro | null {
  const list = candidates(pair);
  const free = (e: Example) => !taken.has(taskText(e.question));
  const example = list?.find((e) => free(e) && e.nums.every((n) => !avoid.includes(n))) ?? list?.find(free) ?? list?.[0];
  if (!example) return null;
  return { kind: "methods", ids: [pairKey(pair)], question: example.question, methods: example.methods.map((m) => ({ label: m.label, lines: m.lines })) };
}
