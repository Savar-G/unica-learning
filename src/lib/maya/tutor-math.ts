// The tutor core's reader of math claims in Maya's own words (D-345, review of #1002): every relation between numbers
// and place quantities in a sentence, in digits or words, chained or not. "1 ten is 10 ones", "52 is 4 tens and 12
// ones", "12 − 8 = 4" and "4 tens minus 2 tens is 2 tens" are read and computed; a false one is refused. An "=" the
// reader cannot read is refused too. Trades ("2 ones become 12") are read by tutor.ts.

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const NUM = String.raw`(?:\d+|(?:${TENS.join("|")})(?:[- ](?:${SMALL.slice(1, 10).join("|")}))?|${SMALL.join("|")})`;
const UNIT = String.raw`(?:ones?|tens?|hundreds?)\b`;
/** A place quantity: "4 tens and 12 ones", "a ten", "one hundred". */
const QUANTITY = String.raw`(?:(?:${NUM}|an?)\s+${UNIT})(?:\s+and\s+(?:${NUM}|an?)\s+${UNIT})*`;
const OP = String.raw`(?:plus|\+|minus|take away|-)`;
const REL = String.raw`(?:is not equal to|isn't equal to|is not|isn't|are not|aren't|is the same as|is equal to|equals|is now|are now|is still|=|is|are|makes|make|gives)`;
const TOKEN = new RegExp(String.raw`(${QUANTITY})|(${NUM})(?!\s+${UNIT})|(${OP})(?=\s|\d|$)|(${REL})(?=\s|\d|$)|([a-z']+|[^\sa-z0-9])`, "gi");

type Item = { kind: "term"; value: number; unit: boolean; one?: true } | { kind: "op"; sign: 1 | -1 } | { kind: "rel"; negated: boolean; eq: boolean; now: boolean } | { kind: "other"; word?: string };

/** A number in digits or words (0 to 99), or "a"/"an" (1). */
function numberOf(word: string): number | null {
  const w = word.toLowerCase().trim();
  if (/^\d+$/.test(w)) return Number(w);
  if (w === "a" || w === "an") return 1;
  const small = SMALL.indexOf(w);
  if (small !== -1) return small;
  const [t, u] = w.split(/[- ]/);
  const tens = TENS.indexOf(t);
  if (tens === -1) return null;
  const unit = u === undefined ? 0 : SMALL.indexOf(u);
  return unit < 1 && u !== undefined ? null : (tens + 2) * 10 + unit;
}

const PLACE: Record<string, number> = { one: 1, ten: 10, hundred: 100 };

/** The value of a place quantity ("4 tens and 12 ones" is 52), or null. */
function quantityOf(text: string): number | null {
  let total = 0;
  for (const part of text.toLowerCase().split(/\s+and\s+/)) {
    const m = /^(.+?)\s+(one|ten|hundred)s?$/.exec(part.trim());
    const n = m ? numberOf(m[1]) : null;
    if (!m || n === null) return null;
    total += n * PLACE[m[2]];
  }
  return total;
}

function itemsOf(sentence: string): Item[] {
  const text = sentence.replace(/[−–]/g, "-").replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/,/g, " ");
  const items: Item[] = [];
  for (const m of text.matchAll(TOKEN)) {
    if (m[1]) {
      const v = quantityOf(m[1]);
      items.push(v === null ? { kind: "other" } : { kind: "term", value: v, unit: true });
    } else if (m[2]) {
      const v = numberOf(m[2]);
      // "one" alone is often a pronoun ("this one"): it is a number only beside an operator or a relation.
      items.push(v === null ? { kind: "other" } : { kind: "term", value: v, unit: false, ...(m[2].toLowerCase() === "one" ? { one: true as const } : {}) });
    } else if (m[3]) items.push({ kind: "op", sign: /^(?:plus|\+)$/i.test(m[3]) ? 1 : -1 });
    else if (m[4]) {
      const r = m[4].toLowerCase();
      items.push({ kind: "rel", negated: /not|n't/.test(r), eq: r === "=", now: /\bnow\b/.test(r) });
    } else items.push({ kind: "other", word: m[5]?.toLowerCase() });
  }
  return items;
}

/** Words after a claim that end it: the claim before them stands alone. */
const CONNECTORS = new Set(["and", "so", "then", "but", "or", "because", "now", "too", "again", "right", "yes", "not", "isn't", "here", "there", "in", "on", "at", "for", "with", "from", "to", "of", "that", "which", "when", "after", "before", "this", "the", "a", "we", "you", "i", "it", "let's"]);

/** One side of a relation: terms joined by operators, with whether any term is a place quantity. */
interface Side { value: number; unitless: number | null }

/**
 * The math claims of a sentence that do not hold, as reasons; empty when every claim holds. A claim is a chain
 * `side REL side (REL side)*`, each side terms joined by plus or minus. A side said with no unit beside a side with
 * units is also read in that unit ("4 tens minus 2 tens is 2"), and the claim holds when either reading is true.
 */
export function falseClaims(sentence: string): string[] {
  const items = itemsOf(sentence);
  const problems: string[] = [];
  let i = 0;
  let eqSeen = 0;
  let eqRead = 0;
  for (const it of items) if (it.kind === "rel" && it.eq) eqSeen++;
  const side = (at: number): { side: Side; units: boolean; next: number } | null => {
    if (items[at]?.kind !== "term") return null;
    const first = items[at] as Extract<Item, { kind: "term" }>;
    // "one" alone is a pronoun ("this one is tricky"), never a side; beside an operator it is a number.
    if (first.one && items[at + 1]?.kind !== "op" && items[at - 1]?.kind !== "op") return null;
    let value = first.value;
    let units = first.unit;
    let next = at + 1;
    while (items[next]?.kind === "op" && items[next + 1]?.kind === "term") {
      const t = items[next + 1] as Extract<Item, { kind: "term" }>;
      value += (items[next] as Extract<Item, { kind: "op" }>).sign * t.value;
      units ||= t.unit;
      next += 2;
    }
    return { side: { value, unitless: units ? null : value }, units, next };
  };
  while (i < items.length) {
    const left = side(i);
    if (!left || items[left.next]?.kind !== "rel") { i++; continue; }
    const chain = [left];
    const rels: Extract<Item, { kind: "rel" }>[] = [];
    let at = left.next;
    while (items[at]?.kind === "rel") {
      const right = side(at + 1);
      if (!right) break;
      rels.push(items[at] as Extract<Item, { kind: "rel" }>);
      chain.push(right);
      at = right.next;
    }
    if (chain.length < 2) { i = left.next + 1; continue; }
    // Not a claim of equality: a counting list ("9, 10, 11, 12 is 4 steps") or a number that goes on into a word that
    // is not a place ("12 is 4 steps", "8 and 4 more make 12"). An "=" is always read.
    const list = items[i - 1]?.kind === "term";
    const after = items[at];
    const runsOn = after?.kind === "other" && !!after.word && /^[a-z']+$/.test(after.word) && !CONNECTORS.has(after.word);
    if ((list || runsOn) && !rels.some((r) => r.eq)) { i = at; continue; }
    // The place unit of the chain, for a side said with no unit (only when one unit is used).
    const anyUnits = chain.some((c) => c.units);
    for (let k = 0; k < rels.length; k++) {
      const [a, b] = [chain[k], chain[k + 1]];
      const readings = [[a.side.value, b.side.value]];
      if (anyUnits) {
        for (const scale of [10, 100]) {
          if (!a.units && b.units) readings.push([a.side.value * scale, b.side.value]);
          if (a.units && !b.units) readings.push([a.side.value, b.side.value * scale]);
        }
      }
      // "is now" / "are now" also says a trade: "5 tens are now 4 tens", "the 2 ones are now 12 ones".
      const equal = readings.some(([x, y]) => x === y || (rels[k].now && a.units && b.units && Math.abs(x - y) === 10));
      const allEqual = readings.every(([x, y]) => x === y);
      if (rels[k].eq) eqRead++;
      if (!rels[k].negated && !equal) problems.push(`it says ${a.side.value} and ${b.side.value} are the same`);
      if (rels[k].negated && allEqual) problems.push(`it says ${a.side.value} and ${b.side.value} are not the same`);
    }
    i = at;
  }
  if (eqRead < eqSeen) problems.push("it has an \"=\" code cannot read");
  return problems;
}
