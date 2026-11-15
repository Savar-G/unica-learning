// The tutor core's reader of math claims in Maya's own words (D-345, review of #1002): every relation between numbers
// and place quantities in a sentence, in digits or words, chained or not. "1 ten is 10 ones", "52 is 4 tens and 12
// ones", "12 − 8 = 4" and "4 tens minus 2 tens is 2 tens" are read and computed; a false one is refused. An "=" the
// reader cannot read is refused too. Trades ("2 ones become 12") are read by tutor.ts.

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const NUM = String.raw`(?:\d+|(?:${TENS.join("|")})(?:[- ](?:${SMALL.slice(1, 10).join("|")}))?|${SMALL.join("|")})`;
const UNIT = String.raw`(?:ones?|tens?|hundreds?)\b`;
/** A place quantity: "4 tens and 12 ones", "a ten", "one hundred". */
const QUANTITY = String.raw`(?:(?:${NUM}|an?)\s+${UNIT})(?:\s+(?:and\s+)?(?:${NUM}|an?)\s+${UNIT})*`;
const OP = String.raw`(?:plus|\+|minus|take away|-|times|multiplied by|×|\*|x|divided by|÷|/)`;
const REL = String.raw`(?:is not equal to|isn't equal to|is not|isn't|are not|aren't|is the same as|is equal to|equals|is now|are now|is still|becomes|become|became|turns into|turn into|turned into|=|is|are|makes|make|gives)`;
const TOKEN = new RegExp(String.raw`(${QUANTITY})|(${NUM})(?!\s+${UNIT})|(${OP})(?=\s|\d|$)|(${REL})(?=\s|\d|$)|([a-z']+|[^\sa-z0-9])`, "gi");

type Item = { kind: "term"; value: number; unit: boolean; place?: number; word?: true } | { kind: "op"; op: "+" | "-" | "*" | "/" } | { kind: "rel"; negated: boolean; eq: boolean; now: boolean } | { kind: "other"; word?: string };

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

/** The parts of a place quantity ("4 tens and 12 ones": 4 of place 10, 12 of place 1), or null. */
function quantityParts(text: string): { n: number; place: number }[] | null {
  const parts: { n: number; place: number }[] = [];
  const re = new RegExp(String.raw`(${NUM}|an?)\s+(one|ten|hundred)s?\b`, "gi");
  for (const m of text.toLowerCase().replace(/\band\b/g, " ").matchAll(re)) {
    const n = numberOf(m[1]);
    if (n === null) return null;
    parts.push({ n, place: PLACE[m[2]] });
  }
  return parts.length ? parts : null;
}

function itemsOf(sentence: string): Item[] {
  const text = sentence.replace(/[−–]/g, "-").replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/,/g, " ");
  const items: Item[] = [];
  for (const m of text.matchAll(TOKEN)) {
    if (m[1]) {
      // The place of each part comes from its unit word only ("one ten" is 1 of place 10).
      const parts = quantityParts(m[1]);
      const places = [...new Set((parts ?? []).map((x) => x.place))];
      items.push(parts === null ? { kind: "other" } : { kind: "term", value: parts.reduce((t, x) => t + x.n * x.place, 0), unit: true, ...(places.length === 1 && parts.length === 1 ? { place: places[0] } : {}) });
    } else if (m[2]) {
      const v = numberOf(m[2]);
      // "one" after a word such as "this" or "each" is a pronoun ("this one is tricky"), not the number 1.
      const prev = items.at(-1);
      const pronoun = m[2].toLowerCase() === "one" && prev?.kind === "other" && !!prev.word && DETERMINERS.has(prev.word);
      items.push(v === null || pronoun ? { kind: "other", word: m[2].toLowerCase() } : { kind: "term", value: v, unit: false, ...(/^\d+$/.test(m[2]) ? {} : { word: true as const }) });
    } else if (m[3]) {
      const w = m[3].toLowerCase();
      // "x" is an operator only between two numbers ("6 x 4").
      if (w === "x" && items.at(-1)?.kind !== "term") { items.push({ kind: "other", word: "x" }); continue; }
      items.push({ kind: "op", op: /^(?:plus|\+)$/.test(w) ? "+" : /^(?:times|multiplied by|×|\*|x)$/.test(w) ? "*" : /^(?:divided by|÷|\/)$/.test(w) ? "/" : "-" });
    }
    else if (m[4]) {
      const r = m[4].toLowerCase();
      items.push({ kind: "rel", negated: /not|n't/.test(r), eq: r === "=", now: /\bnow\b|becom|became|turn/.test(r) });
    } else {
      const word = m[5]?.toLowerCase();
      // "the" after an operator changes nothing ("12 minus the 8 is 4").
      if (word === "the" && items.at(-1)?.kind === "op") continue;
      items.push({ kind: "other", word });
    }
  }
  return items;
}

/** "a ÷ b = q R r", in digits or words. */
const REMAINDER = /(\d+)\s*(?:÷|\/|divided by)\s*(\d+)\s*(?:=|is|equals|makes)\s*(\d+)\s*(?:R|r|remainder|with a remainder of|with remainder)\s*(\d+)/g;

/** Words before "one" that make it a pronoun. */
const DETERMINERS = new Set(["this", "that", "each", "every", "which", "another", "next", "last", "first", "other", "any", "no", "new", "same", "easier", "harder", "tricky", "hard", "easy"]);

/**
 * Words a number may run on into that make it a count, not a claim of equality ("12 is 4 steps", "8 and 4 more make
 * 12", "12 is 4 bigger than 8"). Any other word after a claim leaves the claim checked (fail closed: "4 is 4 tens left").
 */
const COUNT_WORDS = new Set(["steps", "step", "jumps", "jump", "fingers", "finger", "more", "less", "fewer", "bigger", "smaller", "greater", "larger", "away", "apart", "times", "blocks", "block", "sticks", "stick", "counts", "numbers", "after", "before", "up", "down", "from", "than"]);

/** One side of a relation: its value, whether any term is a place quantity, and its one place when it has one. */
interface Side { value: number; units: boolean; place: number | null; next: number; ops: boolean }

/**
 * The math claims of a sentence that do not hold, as reasons; empty when every claim holds. A claim is a chain
 * `side REL side (REL side)*`, each side terms joined by plus or minus. Values are compared exactly: a number said with
 * no unit is that number ("4 is 4 tens" is false). "is now" / "are now" between two quantities of one place also says a
 * trade of the question's operation (`op`, a subtraction when not given): in a subtraction the ones gain 10 and the tens give 1 ten ("the 2 ones are
 * now 12 ones", "the 5 tens are now 4 tens"); in an addition the ones give 10 and the tens gain 1 ten.
 */
export function falseClaims(sentence: string, op?: "add" | "subtract"): string[] {
  const problems: string[] = [];
  // A division with a remainder ("15 ÷ 6 = 2 R 3", "15 divided by 6 is 2 remainder 3") is read whole, then left out.
  sentence = sentence.replace(REMAINDER, (all, a: string, b: string, q: string, r: string) => {
    const [x, y, z, w] = [a, b, q, r].map(Number);
    if (!(y > 0 && x === y * z + w && w < y)) problems.push(`${x} divided by ${y} is not ${z} remainder ${w}`);
    return " ";
  });
  const items = itemsOf(sentence);
  let i = 0;
  let eqSeen = 0;
  let eqRead = 0;
  for (const it of items) if (it.kind === "rel" && it.eq) eqSeen++;
  const side = (at: number): Side | null => {
    if (items[at]?.kind !== "term") return null;
    const first = items[at] as Extract<Item, { kind: "term" }>;
    const values = [first.value];
    const signs: ("+" | "-" | "*" | "/")[] = [];
    let units = first.unit;
    let place: number | null = first.place ?? null;
    let next = at + 1;
    let ops = false;
    while (items[next]?.kind === "op" && items[next + 1]?.kind === "term") {
      ops = true;
      const t = items[next + 1] as Extract<Item, { kind: "term" }>;
      signs.push((items[next] as Extract<Item, { kind: "op" }>).op);
      values.push(t.value);
      units ||= t.unit;
      place = null;
      next += 2;
    }
    // Products and quotients first, then sums and differences, left to right.
    let total = 0;
    let term = values[0];
    let sign = 1;
    for (let k = 0; k < signs.length; k++) {
      const op = signs[k];
      if (op === "*") { term *= values[k + 1]; continue; }
      if (op === "/") { term = values[k + 1] === 0 ? NaN : term / values[k + 1]; continue; }
      total += sign * term;
      sign = op === "+" ? 1 : -1;
      term = values[k + 1];
    }
    const value = total + sign * term;
    return { value, units, place, next, ops };
  };
  // A column's sum of digits said in its place: "1 + 2 + 3 = 6 tens" (never a bare "4 is 4 tens").
  const inPlace = (a: Side, b: Side): boolean =>
    (a.ops && !a.units && b.place !== null && a.value * b.place === b.value) || (b.ops && !b.units && a.place !== null && b.value * a.place === a.value);
  const trade = (a: Side, b: Side): boolean => {
    // Two digits with no place ("the 2 becomes 12", "the 5 becomes 4"): the ones gain 10 or the tens give 1.
    if (!a.units && !b.units) return b.value === a.value + 10 || b.value === a.value - 1;
    // A number with no unit after a place quantity is in its place ("2 ones become 12", "5 tens become 4").
    const place = a.place ?? (b.units ? null : null);
    const bValue = b.units ? b.value : a.place !== null ? b.value * a.place : null;
    if (place === null || bValue === null || (b.units && b.place !== place)) return false;
    const gainsTen = place === 1 ? op !== "add" : op === "add";
    const delta = place === 1 ? 10 : place;
    return gainsTen ? bValue === a.value + delta : bValue === a.value - delta;
  };
  while (i < items.length) {
    const left = side(i);
    if (!left || items[left.next]?.kind !== "rel") { i++; continue; }
    const chain = [left];
    const rels: Extract<Item, { kind: "rel" }>[] = [];
    let at = left.next;
    while (items[at]?.kind === "rel") {
      // "the" before a number word alone names a thing ("the 1 is the ten we carried"); before a digit or a place
      // quantity it is read through ("52 is the 4 tens and 2 ones").
      const article = items[at + 1]?.kind === "other" && (items[at + 1] as { word?: string }).word === "the";
      const named = article && items[at + 2]?.kind === "term" && (items[at + 2] as Extract<Item, { kind: "term" }>).word === true && !(items[at + 2] as Extract<Item, { kind: "term" }>).unit;
      const right = named ? null : side(at + (article ? 2 : 1));
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
    const runsOn = after?.kind === "other" && !!after.word && COUNT_WORDS.has(after.word);
    if ((list || runsOn) && !rels.some((r) => r.eq)) { i = at; continue; }
    for (let k = 0; k < rels.length; k++) {
      const [a, b] = [chain[k], chain[k + 1]];
      const same = Math.abs(a.value - b.value) < 1e-9;
      const equal = same || inPlace(a, b) || (rels[k].now && trade(a, b));
      if (rels[k].eq) eqRead++;
      if (!rels[k].negated && !equal) problems.push(`it says ${a.value} and ${b.value} are the same`);
      if (rels[k].negated && same) problems.push(`it says ${a.value} and ${b.value} are not the same`);
    }
    i = at;
  }
  if (eqRead < eqSeen) problems.push("it has an \"=\" code cannot read");
  return problems;
}
