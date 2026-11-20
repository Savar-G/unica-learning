import type { StepTemplate } from "./types";

/** Later practice transfers the day's idea to decisions, corrections and representations. */
export interface U10ApplicationEntry {
  skill: string;
  step: number;
  name: string;
  templates: StepTemplate[];
}

function groupedEstimates(maximum: number): StepTemplate[] {
  return [
    { format: "story", difficulty: "medium",
      text: "{name} estimates {n} trays with about {g} seeds per tray by adding {n} + {g}. Use {g} per tray and write the correct estimate.",
      answer: "n * g", slots: { n: "groups", g: "group_size" } },
    { format: "true-false", difficulty: "medium",
      text: "Use about {g} beads per bag to estimate {n} bags. True or false: that estimate fits in a box that can hold {capacity} beads.",
      answer: "'true' if n * g <= capacity else 'false'", slots: { n: "groups", g: "group_size", f: "template_flip" },
      derived: { capacity: "(n + 1 - 2 * f) * g" }, check: `capacity <= ${maximum}` },
    { format: "choose", difficulty: "medium",
      text: "Use about {g} seeds per tray for {n} trays. Which estimates all the seeds? A) {oa}  B) {ob}",
      answer: "'A' if f == 0 else 'B'", slots: { n: "groups", g: "group_size", f: "template_flip" },
      derived: { product: "str(n) + ' × ' + str(g)", addition: "str(n) + ' + ' + str(g)",
        oa: "product if f == 0 else addition", ob: "addition if f == 0 else product" } },
  ];
}

function patternApplications(down: boolean, maximum: number): StepTemplate[] {
  const rule = down ? "subtract" : "add";
  const b = down ? "a - d" : "a + d";
  const c = down ? "a - 2 * d" : "a + 2 * d";
  return [
    { format: "story", difficulty: "medium",
      text: down
        ? "A roll has {a} stickers and loses {d} each turn. After one turn, will at least {target} stickers remain? Circle yes or no."
        : "A display has {a} lights and gains {d} each round. After one round, will it have at least {target} lights? Circle yes or no.",
      answer: "'yes' if b >= target else 'no'", slots: { a: "start", d: "step", f: "template_flip" },
      derived: { b, target: "b + 1 - 2 * f" }, check: `b >= 2 and target >= 2 and b <= ${maximum} and target <= ${maximum}` },
    { format: "missing", difficulty: "medium",
      text: `{name} copies "${rule} {d}" as {a}, {b}, {wrong}. The first two numbers are correct. What should replace {wrong}?`,
      answer: c, slots: { a: "start", d: "step", f: "template_flip" }, derived: { b, correct: c, wrong: "correct + 1 - 2 * f" },
      check: `correct >= 2 and wrong >= 2 and correct <= ${maximum} and wrong <= ${maximum}` },
    { format: "choose", difficulty: "medium",
      text: `Two patterns start at {a}. A) ${rule} {d} each time. B) ${rule} {e} each time. Which has the greater number after one jump? Write A or B.`,
      answer: down ? "'A' if d < e else 'B'" : "'A' if d > e else 'B'", slots: { a: "start", d: "step", e: "step" },
      check: down ? "d != e and a - d >= 2 and a - e >= 2" : `d != e and a + d <= ${maximum} and a + e <= ${maximum}` },
  ];
}

/** The nine steps reached by the first U10 sequence; other steps keep their existing pools. */
export const U10_APPLICATION_TEMPLATES: readonly U10ApplicationEntry[] = [
  {
    skill: "3.1-place-value-1000", step: 1, name: "Hundreds, tens and ones",
    templates: [
      { format: "story", difficulty: "medium",
        text: "A shop has {n} pencils: {h} boxes of 100, {o} loose pencils and some packs of 10. How many packs of 10 are there?",
        answer: "t", slots: { n0: "number" }, derived: { h: "n0 // 100", t: "1 + n0 // 10 % 9", o: "1 + n0 % 9", n: "100 * h + 10 * t + o" } },
      { format: "missing", difficulty: "medium",
        text: "{name} writes {wrong} for {h} hundreds, {t} tens and {o} ones. Replace that number with the correct number: __.",
        answer: "100 * h + 10 * t + o", slots: { n0: "number" },
        derived: { h: "n0 // 100", t: "1 + n0 // 10 % 9", o: "1 + n0 % 9", wrong: "100 * h + 10 * o + t" }, check: "t != o" },
      { format: "choose", difficulty: "medium",
        text: "Two scores have {h} hundreds and {o} ones. A) {t} tens. B) {u} tens. Which score is greater? Write A or B.",
        answer: "'A' if t > u else 'B'", slots: { n0: "number", u0: "digit" },
        derived: { h: "n0 // 100", t: "1 + n0 // 10 % 9", o: "1 + n0 % 9", u: "1 + u0 % 9" }, check: "t != u" },
    ],
  },
  {
    skill: "3.1-place-value-1000", step: 2, name: "Zero as a placeholder",
    templates: [
      { format: "story", difficulty: "medium",
        text: "A shop has {h} boxes of 100 buttons and {t} packs of 10 buttons, with no loose buttons. How many buttons are there?",
        answer: "100 * h + 10 * t", slots: { n0: "number" }, derived: { h: "n0 // 100", t: "1 + n0 % 9" } },
      { format: "missing", difficulty: "medium",
        text: "A ticket number is {n}. Its tens and ones digits get swapped. What number is printed now?",
        answer: "100 * h + 10 * o if f == 0 else 100 * h + o", slots: { n0: "number", f: "template_flip" },
        derived: { h: "n0 // 100", o: "1 + n0 % 9", n: "100 * h + o if f == 0 else 100 * h + 10 * o" } },
      { format: "choose", difficulty: "medium",
        text: "The number is {n}. What does the zero mean? A) {oa}. B) {ob}. Write A or B.",
        answer: "'A' if f == 0 else 'B'", slots: { n0: "number", sv: "template_sv", f: "template_flip" },
        derived: { h: "n0 // 100", o: "1 + n0 % 9", n: "100 * h + o if sv % 2 == 0 else 100 * h + 10 * o",
          right: "'no tens' if sv % 2 == 0 else 'no ones'", wrong: "'no ones' if sv % 2 == 0 else 'no tens'",
          oa: "right if f == 0 else wrong", ob: "wrong if f == 0 else right" } },
    ],
  },
  {
    skill: "3.1-place-value-1000", step: 3, name: "Trading tens and ones (up to 19 tens)",
    templates: [
      { format: "story", difficulty: "medium",
        text: "A shop has {t} packs of 10 buttons. It seals 10 packs into one box. How many packs remain outside the box?",
        answer: "t - 10", slots: { t0: "tens" }, derived: { t: "10 + t0 % 10" } },
      { format: "missing", difficulty: "medium",
        text: "Trade 10 tens for one hundred: {h} hundreds and {t} tens = __ hundreds and {left} tens.",
        answer: "h + 1", slots: { h0: "hundreds", t0: "tens" }, derived: { h: "1 + h0 % 8", t: "10 + t0 % 10", left: "t - 10" } },
      { format: "choose", difficulty: "medium",
        text: "A bag has {o} loose beads. Trade 10 beads for one pack of 10. What remains? A) one pack and {oa} loose. B) one pack and {ob} loose.",
        answer: "'A' if f == 0 else 'B'", slots: { o0: "ones", f: "template_flip" },
        derived: { o: "10 + o0 % 10", left: "o - 10", wrong: "left + 1", oa: "left if f == 0 else wrong", ob: "wrong if f == 0 else left" } },
    ],
  },
  { skill: "3.1-estimate-quantity", step: 1, name: "Estimate with a group of 10 or 25", templates: groupedEstimates(250) },
  { skill: "3.1-estimate-quantity", step: 2, name: "Estimate with a group of 100", templates: groupedEstimates(1000) },
  {
    skill: "3.1-estimate-quantity", step: 3, name: "Choose a sensible estimate",
    templates: [
      { format: "story", difficulty: "medium",
        text: "Use about {b} books per classroom shelf as a guide. {name} fills two similar shelves. About how many books is that in all?",
        answer: "2 * b", slots: { x: "choices" }, derived: { b: "20 + x % 8" } },
      { format: "missing", difficulty: "medium",
        // (For three classes: the corrected estimate is never the printed guide, the live U10 Book 1, 2026-11-17.)
        text: "Use about {b} children per class as a guide. An estimate of {bad} children in 3 classes has an extra zero. Divide by 10 to correct it. Corrected estimate: __.",
        answer: "bad // 10", slots: { x: "choices" }, derived: { b: "20 + x % 8", bad: "30 * b" } },
      { format: "choose", difficulty: "medium",
        text: "Use about {b} pages per short book as a guide. Which guess is closer for 2 short books? A) {oa} pages. B) {ob} pages. Write A or B.",
        answer: "'A' if abs(oa - 2 * b) < abs(ob - 2 * b) else 'B'", slots: { x: "choices", f: "template_flip", p: "template_pos" },
        derived: { b: "20 + x % 8", near: "2 * b + 1 + f", far: "10 * near", oa: "near if p % 2 == 0 else far", ob: "far if p % 2 == 0 else near" } },
    ],
  },
  { skill: "3.6-increasing-pattern", step: 1, name: "Add 2, 5 or 10", templates: patternApplications(false, 100) },
  { skill: "3.6-increasing-pattern", step: 2, name: "Other jumps", templates: patternApplications(false, 500) },
  { skill: "3.6-decreasing-pattern", step: 1, name: "Take away 1, 2, 5 or 10", templates: patternApplications(true, 100) },
];
