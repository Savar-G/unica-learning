// BC skill map, Kindergarten to grade 2 (#192). Standard text is exact: grades 1-7 from
// .design/research/assessment-audit-2026-10-15/bc-math-standards.csv, K and grade 8 from
// .design/research/online-assessment/bc-math-curriculum-map.md. Skills and prerequisites: AI draft, for review (#194).
import { skill, type BcStandard } from "./kit";

export const BC_GRADES_K_2: readonly BcStandard[] = [
  { code: "K1", grade: 0, strand: "N", text: "number concepts to 10", skills: [
    skill("K1-count-objects", "Count a set of up to 10 objects, one number for each object"),
    skill("K1-number-sequence", "Say the number just before or just after a number to 10, and fill a gap in a count", "K1-count-objects"),
  ] },
  { code: "K2", grade: 0, strand: "N", text: "ways to make 5", skills: [
    skill("K2-compare-quantities", "Compare two quantities to 10 and tell which has more", "K1-count-objects"),
    skill("K2-make-5", "Find the part that makes 5 with a given number", "K1-count-objects"),
  ] },
  { code: "K3", grade: 0, strand: "N", text: "decomposition of numbers to 10", skills: [
    skill("K3-make-10", "Find the part that makes 10 with a given number", "K2-make-5"),
    skill("K3-part-part-whole", "Find the whole, or a missing part, of a quantity to 10", "K3-make-10"),
  ] },
  { code: "K4", grade: 0, strand: "A", text: "repeating patterns with two or three elements", skills: [
    skill("K4-extend-repeating", "Continue a repeating pattern with two or three elements"),
    skill("K4-identify-core", "Find the part of a pattern that repeats", "K4-extend-repeating"),
  ] },
  { code: "K5", grade: 0, strand: "A", text: "change in quantity to 10, using concrete materials", skills: [
    skill("K5-add-on-change", "Find a quantity to 10 after some objects are added", "K1-count-objects"),
    skill("K5-take-away-change", "Find a quantity to 10 after some objects are taken away", "K1-count-objects"),
  ] },
  { code: "K6", grade: 0, strand: "A", text: "equality as a balance and inequality as an imbalance", skills: [
    skill("K6-balance", "Tell if the two sides of a balance hold equal or unequal amounts", "K2-compare-quantities"),
  ] },
  { code: "K7", grade: 0, strand: "MG", text: "direct comparative measurement (e.g., linear, mass, capacity)", skills: [
    skill("K7-compare-length", "Compare two lengths directly with longer, shorter and taller"),
    skill("K7-compare-mass-capacity", "Compare masses on a balance (heavier, lighter) and capacities (holds more, holds less)"),
  ] },
  { code: "K8", grade: 0, strand: "MG", text: "single attributes of 2D shapes and 3D objects", skills: [
    skill("K8-shape-attributes", "Describe and sort 2D shapes and 3D objects by one attribute (sides, corners, rolls or stacks)"),
  ] },
  { code: "K9", grade: 0, strand: "DP", text: "concrete or pictorial graphs as a visual tool", skills: [
    skill("K9-read-concrete-graph", "Read a concrete or pictorial graph and tell which group has more", "K2-compare-quantities"),
  ] },
  { code: "K10", grade: 0, strand: "DP", text: "likelihood of familiar life events", skills: [
    skill("K10-likelihood-words", "Describe a familiar event as likely or unlikely"),
  ] },
  { code: "K11", grade: 0, strand: "N", text: "financial literacy - attributes of coins, and financial role-play", skills: [
    skill("K11-coin-attributes", "Name Canadian coins and describe their colour, size and pictures"),
  ] },
  { code: "1.1", grade: 1, strand: "N", text: "number concepts to 20", skills: [
    skill("1.1-count-to-20", "Count forward and back to 20, and say the number before or after a number", "K1-number-sequence"),
    skill("1.1-skip-count-2-5", "Skip-count by 2s and 5s", "1.1-count-to-20"),
    skill("1.1-compare-order-20", "Compare and order numbers to 20", "1.1-count-to-20", "K2-compare-quantities"),
    skill("1.1-ten-and-ones", "Show a number from 11 to 20 as 10 and some more", "1.1-count-to-20", "K3-make-10"),
  ] },
  { code: "1.2", grade: 1, strand: "N", text: "ways to make 10", skills: [
    skill("1.2-ways-to-make-10", "Find the ways to make 10 with two parts", "K3-make-10"),
    skill("1.2-benchmarks-10-20", "Use 10 and 20 as benchmarks for the size of a number", "1.2-ways-to-make-10", "1.1-compare-order-20"),
  ] },
  { code: "1.3", grade: 1, strand: "O", text: "addition and subtraction to 20 (understanding of operation and process)", skills: [
    skill("1.3-add-within-20", "Add within 20 by counting on, making 10 or using doubles", "K5-add-on-change", "1.2-ways-to-make-10"),
    skill("1.3-subtract-within-20", "Subtract within 20 by counting back or with the related addition", "K5-take-away-change", "1.3-add-within-20"),
    skill("1.3-word-problems-20", "Solve join, take-away and compare word problems within 20", "1.3-add-within-20", "1.3-subtract-within-20"),
  ] },
  { code: "1.4", grade: 1, strand: "A", text: "repeating patterns with multiple elements and attributes", skills: [
    skill("1.4-extend-repeating", "Continue a repeating pattern with several elements or attributes", "K4-extend-repeating"),
    skill("1.4-describe-core", "Name the core of a pattern, also with letters such as A A B", "K4-identify-core", "1.4-extend-repeating"),
    skill("1.4-predict-element", "Predict a later element of a repeating pattern, for example the 8th shape", "1.4-describe-core"),
  ] },
  { code: "1.5", grade: 1, strand: "A", text: "change in quantity to 20, concretely and verbally", skills: [
    skill("1.5-describe-change", "Describe a change in quantity in words, for example \"build 7, add 3 to make 10\"", "K5-add-on-change", "K5-take-away-change"),
    skill("1.5-change-unknown", "Find how many to add or take away to change one quantity to another within 20", "1.5-describe-change", "1.3-subtract-within-20"),
  ] },
  { code: "1.6", grade: 1, strand: "A", text: "meaning of equality and inequality", skills: [
    skill("1.6-equal-or-not", "Tell if two quantities or two sums are equal or not equal", "K6-balance", "1.3-add-within-20"),
    skill("1.6-balance-sides", "Find what makes the two sides of a balance equal", "1.6-equal-or-not"),
  ] },
  { code: "1.7", grade: 1, strand: "MG", text: "direct measurement with non-standard units (non-uniform and uniform)", skills: [
    skill("1.7-non-standard-units", "Measure a length by repeating one non-standard unit with no gaps or overlaps", "K7-compare-length"),
    skill("1.7-unit-size", "Explain why a smaller unit gives a larger count", "1.7-non-standard-units"),
    skill("1.7-order-by-measure", "Order three objects by length or mass from two comparisons", "K7-compare-length", "K7-compare-mass-capacity"),
  ] },
  { code: "1.8", grade: 1, strand: "MG", text: "comparison of 2D shapes and 3D objects", skills: [
    skill("1.8-sort-shapes", "Sort 2D shapes and 3D objects by one attribute and explain the sorting rule", "K8-shape-attributes"),
    skill("1.8-count-sides", "Count the sides and corners of 2D shapes", "K8-shape-attributes", "1.1-count-to-20"),
  ] },
  { code: "1.9", grade: 1, strand: "DP", text: "concrete graphs, using one-to-one correspondence", skills: [
    skill("1.9-read-concrete-graph", "Read a concrete graph with one-to-one correspondence and compare the groups", "K9-read-concrete-graph", "1.3-subtract-within-20"),
  ] },
  { code: "1.10", grade: 1, strand: "DP", text: "likelihood of familiar life events, using comparative language", skills: [
    skill("1.10-likelihood-words", "Use never, sometimes, always, more likely and less likely for familiar events", "K10-likelihood-words"),
  ] },
  { code: "1.11", grade: 1, strand: "N", text: "financial literacy - values of coins, and monetary exchanges", skills: [
    skill("1.11-coin-values", "Name the value of a nickel, dime, quarter, loonie and toonie", "K11-coin-attributes"),
    skill("1.11-count-one-coin-type", "Find the value of a set of coins of one type", "1.11-coin-values", "1.1-skip-count-2-5"),
  ] },
  { code: "2.1", grade: 2, strand: "N", text: "number concepts to 100", skills: [
    skill("2.1-count-to-100", "Count forward and back to 100, and skip-count by 2s, 5s and 10s from any number", "1.1-skip-count-2-5"),
    skill("2.1-place-value-tens-ones", "Tell the value of each digit in a two-digit number", "1.1-ten-and-ones"),
    skill("2.1-compare-order-100", "Compare and order numbers to 100", "2.1-place-value-tens-ones", "1.1-compare-order-20"),
    skill("2.1-ten-more-less", "Find 10 more or 10 less than a number to 100", "2.1-place-value-tens-ones"),
    skill("2.1-even-odd", "Tell if a number is even or odd", "1.1-skip-count-2-5"),
  ] },
  { code: "2.2", grade: 2, strand: "N", text: "benchmarks of 25, 50, and 100 and personal referents", skills: [
    skill("2.2-benchmarks-25-50-100", "Use 25, 50 and 100 as benchmarks to estimate and compare quantities", "2.1-compare-order-100", "1.2-benchmarks-10-20"),
  ] },
  { code: "2.3", grade: 2, strand: "O", text: "addition and subtraction facts to 20 (introduction of computational strategies)", skills: [
    skill("2.3-fact-strategies-20", "Find addition and subtraction facts to 20 by making 10, using doubles or decomposing", "1.3-add-within-20", "1.3-subtract-within-20"),
    skill("2.3-think-addition", "Find a difference by adding on", "2.3-fact-strategies-20"),
  ] },
  { code: "2.4", grade: 2, strand: "O", text: "addition and subtraction to 100", skills: [
    skill("2.4-add-within-100", "Add two-digit numbers within 100, with and without regrouping", "2.1-place-value-tens-ones", "2.3-fact-strategies-20"),
    skill("2.4-subtract-within-100", "Subtract two-digit numbers within 100, with and without regrouping", "2.1-place-value-tens-ones", "2.3-think-addition"),
    skill("2.4-estimate-100", "Estimate a sum or a difference with friendly numbers", "2.1-ten-more-less"),
    skill("2.4-word-problems-100", "Solve one- and two-step word problems within 100", "2.4-add-within-100", "2.4-subtract-within-100", "1.3-word-problems-20"),
  ] },
  { code: "2.5", grade: 2, strand: "A", text: "repeating and increasing patterns", skills: [
    skill("2.5-repeating-core", "Find the core of a repeating pattern and predict a later element", "1.4-predict-element"),
    skill("2.5-increasing-pattern", "Continue an increasing pattern and find a missing term", "2.1-count-to-100"),
  ] },
  { code: "2.6", grade: 2, strand: "A", text: "change in quantity, using pictorial and symbolic representation", skills: [
    skill("2.6-missing-addend", "Find the unknown in a change shown with symbols, for example 6 + n = 10", "1.5-change-unknown", "2.3-think-addition"),
  ] },
  { code: "2.7", grade: 2, strand: "A", text: "symbolic representation of equality and inequality", skills: [
    skill("2.7-equal-sign", "Read = as \"the same amount as\" and complete an equation such as 5 + 4 = ? + 2", "1.6-balance-sides"),
    skill("2.7-true-false-equations", "Tell if an equation or an inequality is true", "2.7-equal-sign"),
  ] },
  { code: "2.8", grade: 2, strand: "MG", text: "direct linear measurement, introducing standard metric units", skills: [
    skill("2.8-measure-cm-m", "Measure and record a length in centimetres or metres, from any start on a ruler", "1.7-non-standard-units"),
    skill("2.8-choose-unit", "Choose centimetres or metres for a length, and estimate a length", "2.8-measure-cm-m"),
    skill("2.8-compare-lengths", "Find how much longer one length is than another", "2.8-measure-cm-m", "2.4-subtract-within-100"),
  ] },
  { code: "2.9", grade: 2, strand: "MG", text: "multiple attributes of 2D shapes and 3D objects", skills: [
    skill("2.9-two-attributes", "Sort 2D shapes and 3D objects by two attributes", "1.8-sort-shapes"),
    skill("2.9-name-2d-shapes", "Name and describe triangles, squares, rectangles and circles in any position", "1.8-count-sides"),
    skill("2.9-faces-of-3d", "Find 2D shapes as the faces of 3D objects", "2.9-name-2d-shapes"),
  ] },
  { code: "2.10", grade: 2, strand: "DP", text: "pictorial representation of concrete graphs, using one-to-one correspondence", skills: [
    skill("2.10-read-pictograph", "Read a pictorial graph where one symbol is one item, and compare the groups", "1.9-read-concrete-graph"),
  ] },
  { code: "2.11", grade: 2, strand: "DP", text: "likelihood of familiar life events, using comparative language", skills: [
    skill("2.11-compare-likelihood", "Use certain, uncertain, more likely, less likely and equally likely", "1.10-likelihood-words"),
  ] },
  { code: "2.12", grade: 2, strand: "O", text: "financial literacy - coin combinations to 100 cents, and spending and saving", skills: [
    skill("2.12-count-mixed-coins", "Find the value of a mix of coins to 100 cents", "1.11-count-one-coin-type", "2.4-add-within-100"),
    skill("2.12-spend-save", "Tell spending from saving, and wants from needs"),
  ] },
];
