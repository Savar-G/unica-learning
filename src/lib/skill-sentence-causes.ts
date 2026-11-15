// The parent-facing words for the mistake causes a skill sentence may name (#989, review 2026-11-15).
//
// Keys are cause ids of `MISCONCEPTIONS` (src/lib/assessment/misconceptions.ts). The table's own descriptions are for the
// team: many are technical ("Treats an unknown divisor as an unknown dividend") or claim what a child believes. A parent
// sentence names a cause only when it has an entry here, in plain words that describe what happens on the page. Never
// "Thinks" or "Believes": the page shows what the child did, not what is in their head. Each text is one short line that
// ends with a full stop. Add an entry only after Cedric has read the words; a cause with no entry is never named, and the
// sentence says something else. Kept to the common primary-grade causes: place value, regrouping, subtracting across a
// zero, comparing numbers, basic fractions, the equal sign, time, perimeter and area.
export const PARENT_MISTAKE_TEXT: Readonly<Record<string, string>> = {
  // Place value and counting
  N1: "Writes a big number the way it sounds, so 407 becomes 4007.",
  N2: "Mixes up which place each digit is in, such as tens and hundreds.",
  N3: "Gets stuck counting past a hundred, such as 6100 after 699.",
  // Adding and subtracting: regrouping, zeros
  O1: "Takes the smaller digit from the larger in each column of a subtraction.",
  O2: "Subtracts the wrong way across a zero.",
  O3: "Forgets to carry when adding.",
  "operation-swap": "Adds when the story takes away, or takes away when the story adds.",
  "ignores-given": "Leaves out one of the facts in a word problem.",
  // Decimals
  O8: "Lines up decimals by the right edge, not by the decimal point.",
  F6: "Treats a longer decimal as a bigger decimal.",
  "decimal-point": "Puts the decimal point in the wrong place.",
  // Fractions
  F1: "Treats a bigger bottom number as a bigger fraction.",
  F3: "Counts parts that are not the same size as equal parts of a fraction.",
  F9: "Adds the same number to the top and bottom to make an equal fraction.",
  "fraction-flip": "Writes a fraction upside down, with the whole on top.",
  "denominator-meaning": "Does not yet link the bottom number of a fraction to its equal parts.",
  // The equal sign
  A1: "Reads the equal sign as \"the answer comes next\".",
  // Time
  "clock-fraction": "Mixes up quarter past, half past and quarter to.",
  "clock-hands": "Swaps the hour hand and the minute hand.",
  // Measuring
  M1: "Reads the end mark of a ruler and ignores where the object starts.",
  M2: "Mixes up perimeter and area.",
  // Number sense
  "factor-multiple": "Mixes up factors and multiples.",
};
