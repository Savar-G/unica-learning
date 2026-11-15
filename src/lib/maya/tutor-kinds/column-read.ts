// The column kind's own read of Maya's words about the work (two-layer true math, coverage round of 2026-11-15):
// clauses that say what a column holds and does ("we have 4 tens and take away 2 tens", "we use the 12 ones from the
// trade", "we traded 1 ten away", "the ones are 2 minus 8"), read whole and checked against the column steps code
// computed (tutorSteps). The kind names each such clause it found true (TutorKind.coveredClaims); the core counts it as
// read by code. A clause of another shape, or with any number that is not the column's, is not named: it goes to the
// math-truth review. Nothing here refuses: the core and claimProblems refuse.
import type { OperationPackage } from "@/lib/question-package";
import { numberOf } from "../tutor-math";
import { splitClauses } from "../tutor-read";
import { tutorSteps, type TutorStep } from "./column";

const WORD = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
const N = String.raw`(?:\d+|${WORD})`;
const P = String.raw`(?:hundred thousands?|ten thousands?|ones?|tens?|hundreds?|thousands?)`;
const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands"];
/** "ten" and "tens" are the tens; "one" and "ones" the ones. */
const placeName = (w: string | undefined) => (w ? PLACES.find((p) => p === w.toLowerCase() || p === `${w.toLowerCase()}s`) ?? null : null);
const num = (w: string | undefined) => (w === undefined ? null : /^(?:a|an)$/i.test(w) ? 1 : numberOf(w));

/** Spoken words before the clause's math that add no claim. */
const LEAD = String.raw`^(?:(?:so|and|but|now|then|yes|okay|ok|first|next|remember|because|since)\s+)*`;
const WHO = String.raw`(?:(?:we|you|i|let's)(?:'ll| will| can| just| already| still| do| then| now)*\s+)?`;
/** Why the ones have more now: the trade, said in any of the usual words. */
const FROM_TRADE = String.raw`(?:(?:that\s+)?(?:we|you)\s+got\s+)?(?:from|after)\s+(?:the\s+|our\s+|we\s+|you\s+)?(?:trade|trading|borrow|borrowing|borrowed|regroup|regrouping|regrouped)`;

/** What one place of the column shows, as the kind's words may say it. */
interface PlaceFacts {
  place: string;
  /** Subtraction: the printed top digit; addition: the printed digits. */
  printed: number[];
  /** Subtraction: the top after the trades (12 ones in 52 − 28), when a trade changed it. */
  traded: number | null;
  /** Subtraction: the bottom digit taken away. */
  bottom: number | null;
  /** The digit written in the answer. */
  write: number;
  /** Subtraction: this place gave 1 to the right; addition: this place carries 1 to the left. */
  gave: boolean;
  /** Subtraction: this place took 10 from the left. */
  took: boolean;
}

function placeFacts(pkg: OperationPackage): PlaceFacts[] {
  return tutorSteps(pkg).map((st: TutorStep) => {
    if (st.op === "-") {
      const changed = st.printedTop !== undefined && st.operands[0] !== st.printedTop;
      return { place: st.place, printed: st.printedTop === undefined ? [] : [st.printedTop], traded: changed ? st.operands[0] : null, bottom: st.operands[1] ?? null, write: st.write, gave: !!st.lent, took: st.trade };
    }
    // Addition: the readers here read subtraction words only; a place of an addition matches none of them.
    return { place: st.place, printed: [], traded: null, bottom: null, write: st.write, gave: st.trade, took: false };
  });
}

type Reader = (m: RegExpExecArray, facts: PlaceFacts[], pkg: OperationPackage) => boolean;

/** A count with its place word, or a count in the place another part names. */
const at = (facts: PlaceFacts[], place: string | null) => (place === null ? null : facts.find((f) => f.place === place) ?? null);

const READERS: readonly [RegExp, Reader][] = [
  // "we have 4 tens and take away 2 tens", "you have 12 ones and we take away 8 ones"
  [new RegExp(String.raw`${LEAD}${WHO}(have|had)\s+(${N})\s+(${P})(\s+(?:left|now|on top))?(\s+after the trade)?\s+and\s+${WHO}(?:take|took)\s+away\s+(?:the\s+)?(${N})\s+(${P})$`, "i"), (m, facts) => {
    const f = at(facts, placeName(m[3]));
    const [a, b] = [num(m[2]), num(m[6])];
    if (!f || placeName(m[7]) !== f.place || a === null || b === null || b !== f.bottom) return false;
    // Every word of the time is read (review of #1047): "had" with no "after" is the printed top; "have", "left",
    // "now" or "after the trade" is the top after the trade.
    const before = /^had$/i.test(m[1]) && !m[4] && !m[5];
    return before ? f.printed.includes(a) : (f.traded ?? f.printed[0]) === a;
  }],
  // "we have 4 tens left after the trade", "after the trade we have 12 ones", "there are 4 tens left"
  [new RegExp(String.raw`${LEAD}(?:after (?:the trade|we borrow|we borrowed|the borrow)\s+)?(?:${WHO}(?:have|do have|still have)|there\s+(?:are|is))\s+(${N})\s+(${P})(\s+(?:left|now|on top))?(\s+(?:now|after the trade|after we borrowed|after borrowing|after the borrow))?$`, "i"), (m, facts) => {
    const f = at(facts, placeName(m[2]));
    const a = num(m[1]);
    if (!f || a === null || f.bottom === null) return false;
    // Every word is read: "have", "left", "now", "on top" and "after the trade" all mean the top after the trade, which
    // only a place that traded has (review of #1047).
    return f.traded !== null && a === f.traded;
  }],
  // "we had 5 tens"
  [new RegExp(String.raw`${LEAD}${WHO}(?:had|started with)\s+(${N})\s+(${P})$`, "i"), (m, facts) => {
    const f = at(facts, placeName(m[2]));
    const a = num(m[1]);
    return !!f && f.bottom !== null && a !== null && f.printed.includes(a);
  }],
  // "we take away 2 tens", "take away the 2 tens from 28", "now take 8 from those 12 ones", "take 2 tens away from 4 tens"
  [new RegExp(String.raw`${LEAD}${WHO}(?:take|took|takes|subtract|subtracted)(?:\s+away)?\s+(?:the\s+)?(${N})(?:\s+(${P}))?(?:\s+away)?(?:\s+from\s+(?:the\s+|those\s+|our\s+)?(\d+|${N})(?:\s+(${P}))?)?$`, "i"), (m, facts, pkg) => {
    const b = num(m[1]);
    const from = num(m[3]);
    const place = placeName(m[2]) ?? placeName(m[4]);
    const f = at(facts, place);
    if (!f || b === null || f.bottom === null || b !== f.bottom) return false;
    if (m[3] === undefined) return !!m[2];
    // From the place's top ("from those 12 ones"), or from the bottom number whose digit it is ("the 2 tens from 28").
    if (m[4] !== undefined) return placeName(m[4]) === f.place && from !== null && (f.traded ?? f.printed[0]) === from;
    const bottomNumber = pkg.operation.operands[1];
    return !!m[2] && from === bottomNumber;
  }],
  // "we use the 12 ones from the trade", "you used the 12 we got from borrowing", "so use the 12 ones after we borrowed"
  [new RegExp(String.raw`${LEAD}${WHO}(?:use|used|uses)\s+the\s+(${N})(?:\s+(${P}))?\s+${FROM_TRADE}$`, "i"), (m, facts) => {
    const a = num(m[1]);
    const place = placeName(m[2]);
    return a !== null && facts.some((f) => f.took && f.traded === a && (place === null || f.place === place));
  }],
  // "we traded 1 ten away", "you borrowed a ten", "we took one ten", "we traded 1 ten for ones"
  [new RegExp(String.raw`${LEAD}${WHO}(?:traded|borrowed|borrow|took|take|trade|regrouped|used the (?:borrowed|traded))\s+(?:(?:1|one|a|the)\s+)?(ten|hundred|thousand)(?:\s+away(?:\s+for\s+(${P}))?|\s+(?:for|into)\s+(?:(?:10|ten)\s+)?(${P})|\s+to the (${P}))?(?:\s+to\s+(?:get|make)\s+(${N})\s+(${P})|\s+and it worked)?$`, "i"), (m, facts) => {
    const place = placeName(m[1]);
    const gave = facts.findIndex((f) => f.place === place && f.gave && f.bottom !== null);
    if (gave < 1) return false;
    const got = facts[gave - 1];
    // Where the traded unit went, when said, is the place on its right (review of #1047: "1 ten to the hundreds").
    const to = m[2] ?? m[3] ?? m[4];
    if (to !== undefined && placeName(to) !== got.place) return false;
    // "to get 12 ones": the place it gave to, after the trade.
    if (m[5] === undefined) return true;
    return placeName(m[6]) === got.place && got.traded === num(m[5]);
  }],
  // "so we borrow", "we borrowed": a subtraction here trades.
  [new RegExp(String.raw`${LEAD}${WHO}(?:borrow|borrowed|trade|traded|regroup|regrouped)$`, "i"), (_m, facts) => facts.some((f) => f.took && f.bottom !== null)],
  // "which is why we traded", "and that's why we borrowed": a subtraction here trades.
  [new RegExp(String.raw`${LEAD}(?:which is|that's|that is)\s+why\s+(?:we|you)\s+(?:traded|borrowed|regrouped|needed to trade|needed to borrow)$`, "i"), (_m, facts) => facts.some((f) => f.took && f.bottom !== null)],
  // "the number is still 52", "the number 52 stays the same", "the number stayed 52": a trade keeps the number.
  [new RegExp(String.raw`${LEAD}the number(?:\s+(\d+))?\s+(?:is still|is|stays|stayed|is the same,?|still is)\s+(\d+|the same)(?:,?\s+just split a new way)?$`, "i"), (m, facts, pkg) => {
    const top = pkg.operation.operands[0];
    const said = [m[1], m[2]].filter((x) => x !== undefined && /^\d+$/.test(x)).map(Number);
    return facts.some((f) => f.took) && said.length > 0 && said.every((n) => n === top);
  }],
  // "the ones are 4 and the tens are 2", "now the ones digit is 4": the answer's digits once written.
  [new RegExp(String.raw`${LEAD}the\s+(${P})(\s+digit|\s+answer)?\s+(?:are|is)\s+(${N})(\s+now)?(?:\s+and\s+the\s+(${P})(\s+digit|\s+answer)?\s+(?:are|is)\s+(${N})(\s+now)?)?$`, "i"), (m, facts) => {
    // "the ones digit is 4", "the ones answer is 4": the digit written, 0 to 9 (review of #1047: "The ones digit is 12"
    // names a place amount, not a digit). "The ones are 12 now": what the place shows after the trade.
    const ok = (p: string | undefined, named: string | undefined, n: string | undefined, now: string | undefined) => {
      const f = at(facts, placeName(p));
      const a = num(n);
      if (!f || a === null) return false;
      if (named) return !now && a >= 0 && a <= 9 && a === f.write;
      return a === f.write || (f.traded !== null && a === f.traded);
    };
    return ok(m[1], m[2], m[3], m[4]) && (m[5] === undefined || ok(m[5], m[6], m[7], m[8]));
  }],
  // "put the 2 tens next to the 4 ones": the answer's digits.
  [new RegExp(String.raw`${LEAD}${WHO}(?:put|write)\s+the\s+(${N})\s+(${P})\s+next to\s+the\s+(${N})\s+(${P})$`, "i"), (m, facts) => {
    const ok = (p: string, n: string) => { const f = at(facts, placeName(p)); return !!f && f.write === num(n); };
    return ok(m[2], m[1]) && ok(m[4], m[3]);
  }],
  // "the ones are 2 minus 8", "the ones are 2 and 8", "the ones column is 2 minus 8"
  [new RegExp(String.raw`${LEAD}(?:in\s+(\d+)\s*-\s*(\d+)\s+)?the\s+(${P})(?:\s+column)?\s+(?:are|is)\s+(${N})\s+(?:and|minus|-|take away)\s+(${N})$`, "i"), (m, facts, pkg) => {
    // "in 52 − 28 the ones are 2 and 8": the question's own subtraction only.
    if (m[1] !== undefined && (Number(m[1]) !== pkg.operation.operands[0] || Number(m[2]) !== pkg.operation.operands[1])) return false;
    const f = at(facts, placeName(m[3]));
    const [a, b] = [num(m[4]), num(m[5])];
    return !!f && f.bottom !== null && a !== null && f.printed[0] === a && b === f.bottom;
  }],
  // "now the ones are 12", "the tens are now 4", "the tens column now has 4 tens", "4 tens are left", "the ones digit is 4"
  [new RegExp(String.raw`${LEAD}(?:the\s+(${P})(?:\s+column)?\s+(?:are now|is now|now (?:have|has|show)|now)\s+|(?:the\s+(${P})\s+(?:column\s+)?(?:has|have)\s+))(${N})(?:\s+(${P}))?$`, "i"), (m, facts) => {
    const f = at(facts, placeName(m[1] ?? m[2]));
    const a = num(m[3]);
    if (!f || f.bottom === null || a === null || (m[4] !== undefined && placeName(m[4]) !== f.place)) return false;
    return f.traded !== null && a === f.traded;
  }],
  // "4 tens minus 2 tens", "12 ones take away 8 ones": one place's own subtraction.
  [new RegExp(String.raw`${LEAD}(${N})\s+(${P})\s+(?:minus|take away|-)\s+(${N})\s+(${P})$`, "i"), (m, facts) => {
    const f = at(facts, placeName(m[2]));
    const [a, b] = [num(m[1]), num(m[3])];
    return !!f && placeName(m[4]) === f.place && f.bottom !== null && b === f.bottom && a === (f.traded ?? f.printed[0]);
  }],
  [new RegExp(String.raw`${LEAD}(${N})\s+(${P})\s+(?:are|is)\s+left(?:\s+on top)?(?:\s+after the trade)?$`, "i"), (m, facts) => {
    const f = at(facts, placeName(m[2]));
    const a = num(m[1]);
    return !!f && f.bottom !== null && a !== null && f.traded === a && f.gave;
  }],
];

/** The clauses of `sentence` the column kind read whole and found true (TutorKind.coveredClaims). */
export function columnCoveredClaims(pkg: OperationPackage, sentence: string): string[] {
  const facts = placeFacts(pkg);
  const parts = splitClauses(sentence);
  const out: string[] = [];
  for (let k = 0; k < parts.length; k += 2) {
    const clause = parts[k].trim().replace(/\{name\}\s*/gi, "").trim();
    if (READERS.some(([re, read]) => { const m = re.exec(clause); return !!m && read(m, facts, pkg); })) out.push(parts[k]);
  }
  return out;
}
