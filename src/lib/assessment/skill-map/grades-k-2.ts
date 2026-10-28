// BC skill map, Kindergarten to grade 2 (#192). Standard text is exact: grades 1-7 from
// .design/research/assessment-audit-2026-10-15/bc-math-standards.csv, K and grade 8 from
// .design/research/online-assessment/bc-math-curriculum-map.md. The 11 K standards were checked on 2026-10-27 against
// the official BC page (https://curriculum.gov.bc.ca/curriculum/mathematics/k/core, Content and elaborations); BC
// writes an em dash in K11, the map keeps the hyphen used for every grade. Skills and prerequisites: AI draft, for review (#194).
import { skill, type BcStandard } from "./kit";

export const BC_GRADES_K_2: readonly BcStandard[] = [
  { code: "K1", grade: 0, strand: "N", text: "number concepts to 10", skills: [
    skill("K1-rote-count-10", "Count forward from 1 to 10 and back from 10 to 1, without objects"),
    skill("K1-count-objects", "Count a set of up to 10 objects, one number for each object", "K1-rote-count-10"),
    skill("K1-how-many", "Tell how many are in a set: the last number said is the number of objects", "K1-count-objects"),
    skill("K1-count-scattered", "Count up to 10 objects in a line, a scattered group or a circle, keeping track of the ones already counted", "K1-count-objects"),
    skill("K1-conservation", "Know that a set keeps the same number when its objects are moved, spread out or rearranged", "K1-how-many"),
    skill("K1-recognize-numerals", "Read the numerals 0 to 10, and know that 0 means none", "K1-rote-count-10"),
    skill("K1-write-numerals", "Trace and write the numerals 0 to 10", "K1-recognize-numerals"),
    skill("K1-match-set-numeral", "Match a set of up to 10 objects to its numeral, and a numeral to a set", "K1-how-many", "K1-recognize-numerals"),
    skill("K1-count-out", "Make or draw a set with a given number of objects to 10", "K1-how-many", "K1-recognize-numerals"),
    skill("K1-number-sequence", "Say the number just before or just after a number to 10, and fill a gap in a count", "K1-rote-count-10", "K1-recognize-numerals"),
    skill("K1-order-numerals", "Put the numerals 1 to 10 in order", "K1-number-sequence"),
  ] },
  { code: "K2", grade: 0, strand: "N", text: "ways to make 5", skills: [
    skill("K2-subitize-to-5", "Recognize quantities to 5 at a glance without counting, on dot cards, dice and fingers"),
    skill("K2-five-frame", "Show a number to 5 on a five-frame, and tell how many empty spaces are left", "K2-subitize-to-5", "K1-how-many"),
    skill("K2-subitize-parts", "See a quantity to 10 as two small groups, for example \"I see 4 and 1, that makes 5\"", "K2-subitize-to-5"),
    skill("K2-make-5", "Find the part that makes 5 with a given number", "K2-five-frame"),
    skill("K2-ways-to-make-5", "Show the ways to make 5 with two parts (5 and 0, 4 and 1, 3 and 2) with fingers, objects or drawings", "K2-make-5", "K2-subitize-parts"),
    skill("K2-match-to-compare", "Compare two sets by matching their objects one to one, and tell which set has extra objects"),
    skill("K2-compare-quantities", "Compare two quantities to 10 and tell which has more, which has fewer, or that they are the same", "K2-match-to-compare", "K1-how-many"),
    skill("K2-compare-numbers", "Tell which of two numbers to 10 is greater and which is less", "K2-compare-quantities", "K1-number-sequence"),
  ] },
  { code: "K3", grade: 0, strand: "N", text: "decomposition of numbers to 10", skills: [
    skill("K3-ten-frame", "Show and read a number to 10 on a ten-frame, as 5 and some more", "K2-five-frame", "K1-how-many"),
    skill("K3-benchmarks-5-10", "Tell if a number to 10 is less than 5, more than 5, or close to 10", "K3-ten-frame", "K2-compare-numbers"),
    skill("K3-decompose-to-10", "Break a quantity to 10 into two parts in different ways, with objects or drawings", "K2-ways-to-make-5", "K3-ten-frame"),
    skill("K3-make-10", "Find the part that makes 10 with a given number", "K2-make-5", "K3-ten-frame"),
    skill("K3-part-part-whole", "Find the whole, or a missing part, of a quantity to 10", "K3-decompose-to-10"),
  ] },
  { code: "K4", grade: 0, strand: "A", text: "repeating patterns with two or three elements", skills: [
    skill("K4-sort-one-attribute", "Sort objects or pictures into groups by one attribute, such as colour, shape or size, and tell the rule"),
    skill("K4-spot-pattern", "Tell if a row of objects, pictures, sounds or actions is a repeating pattern, also in art and beadwork"),
    skill("K4-extend-repeating", "Continue a repeating pattern with two or three elements", "K4-spot-pattern"),
    skill("K4-missing-element", "Find the missing element in a repeating pattern with two or three elements", "K4-extend-repeating"),
    skill("K4-identify-core", "Find the part of a pattern that repeats", "K4-extend-repeating"),
    skill("K4-create-pattern", "Make a repeating pattern with two or three elements, such as AB, AAB or ABC", "K4-identify-core"),
    skill("K4-represent-pattern", "Show the same repeating pattern in another way, for example red-blue as clap-stomp", "K4-identify-core"),
  ] },
  { code: "K5", grade: 0, strand: "A", text: "change in quantity to 10, using concrete materials", skills: [
    skill("K5-one-more-less", "Find 1 more and 1 less than a quantity to 10", "K1-number-sequence", "K1-how-many"),
    skill("K5-two-more-less", "Find 2 more and 2 less than a quantity to 10", "K5-one-more-less"),
    skill("K5-add-on-change", "Find a quantity to 10 after some objects are added", "K1-count-objects"),
    skill("K5-take-away-change", "Find a quantity to 10 after some objects are taken away", "K1-count-objects"),
    skill("K5-build-and-change", "Tell what to add or take away to change one quantity to another within 10, for example 4 cubes to 6 or to 3", "K5-add-on-change", "K5-take-away-change", "K2-compare-quantities"),
  ] },
  { code: "K6", grade: 0, strand: "A", text: "equality as a balance and inequality as an imbalance", skills: [
    skill("K6-equal-sets", "Tell if two sets to 10 have the same number of objects (equal) or not (not equal)", "K2-compare-quantities"),
    skill("K6-balance", "Tell if the two sides of a balance hold equal or unequal amounts", "K6-equal-sets"),
    skill("K6-make-equal", "Make two unequal sets or balance sides equal by adding or taking away objects", "K6-balance", "K5-build-and-change"),
  ] },
  { code: "K7", grade: 0, strand: "MG", text: "direct comparative measurement (e.g., linear, mass, capacity)", skills: [
    skill("K7-baseline", "Line up two objects at the same starting line before comparing their lengths"),
    skill("K7-compare-length", "Compare two lengths directly with longer, shorter and taller, and widths with wider", "K7-baseline"),
    // The id names mass and capacity; since 2026-10-27 it covers mass and K7-compare-capacity covers capacity.
    skill("K7-compare-mass-capacity", "Compare two masses by holding them or on a pan balance (heavier, lighter, same as)"),
    skill("K7-compare-capacity", "Compare two containers by filling or pouring (holds more, holds less, holds the same)"),
    skill("K7-which-attribute", "Tell if two objects are compared by length, mass or capacity, and choose the matching words", "K7-compare-length", "K7-compare-mass-capacity", "K7-compare-capacity"),
  ] },
  { code: "K8", grade: 0, strand: "MG", text: "single attributes of 2D shapes and 3D objects", skills: [
    skill("K8-positional-words", "Use beside, on top of, under, in front of and behind to tell where an object is"),
    skill("K8-describe-2d", "Describe a 2D shape by one attribute, such as straight or curved sides, corners or size"),
    skill("K8-describe-3d", "Describe a 3D object by one attribute, such as whether it rolls, stacks or slides, or what it is shaped like (a can, a box, a ball)"),
    skill("K8-same-shape", "Find shapes of the same kind when they are turned or a different size", "K8-describe-2d"),
    skill("K8-create-2d", "Make a picture or a new shape by putting 2D shapes together", "K8-describe-2d"),
    skill("K8-shape-attributes", "Sort 2D shapes and 3D objects by one attribute (sides, corners, rolls or stacks) and tell the rule", "K8-describe-2d", "K8-describe-3d", "K4-sort-one-attribute"),
  ] },
  { code: "K9", grade: 0, strand: "DP", text: "concrete or pictorial graphs as a visual tool", skills: [
    skill("K9-make-graph", "Make a concrete or picture graph from sorted objects, one object or picture for each item, from a shared starting line", "K4-sort-one-attribute", "K1-count-objects"),
    skill("K9-count-in-graph", "Tell how many are in each group of a concrete or picture graph", "K1-how-many"),
    skill("K9-read-concrete-graph", "Read a concrete or pictorial graph and tell which group has more", "K2-compare-quantities"),
  ] },
  { code: "K10", grade: 0, strand: "DP", text: "likelihood of familiar life events", skills: [
    skill("K10-likelihood-words", "Describe a familiar event as likely or unlikely"),
    skill("K10-which-more-likely", "Tell which of two familiar events is more likely, for example rain or snow in July", "K10-likelihood-words"),
  ] },
  { code: "K11", grade: 0, strand: "N", text: "financial literacy - attributes of coins, and financial role-play", skills: [
    skill("K11-describe-coins", "Describe Canadian coins by colour, size and the pictures on them"),
    skill("K11-coin-attributes", "Name the Canadian coins (nickel, dime, quarter, loonie, toonie) from their colour, size and pictures", "K11-describe-coins"),
    skill("K11-role-play-purchase", "Find the total of a pretend purchase in whole dollars to 10, for example a $2 muffin and a $1 juice", "K5-add-on-change", "K1-recognize-numerals"),
    skill("K11-wants-needs", "Tell a want from a need in a familiar situation"),
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
    // Added with the skill tags (#193): no skill above covers comparing surfaces.
    skill("1.7-compare-by-covering", "Compare the size of two surfaces by covering each with same-size units and comparing the counts", "1.7-non-standard-units"),
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
