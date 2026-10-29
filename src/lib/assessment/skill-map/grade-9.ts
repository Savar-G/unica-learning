// BC skill map, Grade 9. Standard text is exact, from the Content of BC Mathematics 9
// (https://curriculum.gov.bc.ca/curriculum/mathematics/9/core, read 2026-10-27); as in the other grades, the em dash of
// the financial literacy heading is written " - ". The assessment does not test grade 9: these standards extend the map
// for the workbooks (K-9). Skills and prerequisites: AI draft, for review (#194). Powers are written n^2.
//
// Who gets grade 9 work (D-153): BC Mathematics 9 is the first year of high school. A grade 7 or 8 child may get a
// grade 9 skill as stretch work only through the workbook level progression: after passing the level test for the
// grade 8 skills that the grade 9 skill requires (its prerequisite edges here). Never from the assessment: one
// placement test is too thin evidence to start high-school algebra, so the assessment's next challenges, workbook plan
// and report stay K-8 (BC_LEVEL_STANDARDS in ../skill-map.ts leaves grade 9 out). Equations with brackets are here, in
// 9.5-distribute, not in grade 8.
import { skill, type BcStandard } from "./kit";

export const BC_GRADE_9: readonly BcStandard[] = [
  { code: "9.1", grade: 9, strand: "O", text: "operations with rational numbers (addition, subtraction, multiplication, division, and order of operations)", skills: [
    skill("9.1-compare-order", "Compare and order rational numbers, such as -3/4, -0.7 and 2/3, on a number line", "7.2-compare-integers", "7.4-compare-forms"),
    skill("9.1-add-subtract", "Add and subtract rational numbers, as fractions or decimals, also negative ones", "9.1-compare-order", "7.2-subtract-integers", "8.5-add-subtract-unlike"),
    skill("9.1-multiply-divide", "Multiply and divide rational numbers with the sign rules, for example (-3/4) / (1/5)", "7.2-multiply-divide-integers", "8.5-divide-fractions", "7.3-divide-decimals"),
    skill("9.1-order-of-operations", "Use the order of operations with rational numbers, brackets and powers, for example 1 - 2 x (4/5)^2", "9.1-add-subtract", "9.1-multiply-divide", "9.2-evaluate-power", "8.5-fraction-order-of-operations"),
    skill("9.1-word-problems", "Solve a word problem with rational numbers, for example a temperature that drops 2.5 degrees an hour", "9.1-add-subtract", "9.1-multiply-divide"),
  ] },
  { code: "9.2", grade: 9, strand: "N", text: "exponents and exponent laws with whole-number exponents", skills: [
    skill("9.2-power-parts", "Name the base and the exponent of a power, and write it as a repeated multiplication, for example n^4 = n x n x n x n", "8.1-squares-cubes"),
    skill("9.2-evaluate-power", "Find the value of a power, also with a negative base, and tell (-3)^2 = 9 from -3^2 = -9", "9.2-power-parts", "7.2-multiply-divide-integers"),
    skill("9.2-zero-one-exponent", "Use the exponents 0 and 1, for example 6^0 = 1 and m^1 = m", "9.2-power-parts"),
    skill("9.2-product-quotient-laws", "Multiply and divide powers with the same base, for example n^5 x n^3 = n^8 and y^7 / y^3 = y^4", "9.2-power-parts"),
    skill("9.2-power-laws", "Raise a power, a product or a quotient to a power, for example (3^2)^4 = 3^8 and (5n)^3 = 125n^3", "9.2-product-quotient-laws"),
    skill("9.2-simplify-evaluate", "Simplify an expression with the exponent laws, then find its value", "9.2-power-laws", "9.2-zero-one-exponent", "9.2-evaluate-power"),
  ] },
  { code: "9.3", grade: 9, strand: "A", text: "operations with polynomials, of degree less than or equal to 2", skills: [
    skill("9.3-vocabulary", "Name the variable, the degree, the number of terms and the coefficients of a polynomial, including the constant term", "8.7-combine-terms", "8.7-parts"),
    skill("9.3-algebra-tiles", "Model a polynomial with algebra tiles, and write the polynomial that a tile model shows", "9.3-vocabulary"),
    skill("9.3-like-terms", "Tell like terms from unlike terms, such as 3n^2 and 3n", "9.3-vocabulary", "9.2-power-parts"),
    skill("9.3-add", "Add polynomials, for example (n^2 + 2n - 4) + (2n^2 - 3n - 4)", "9.3-like-terms", "7.2-add-integers"),
    skill("9.3-subtract", "Subtract polynomials by taking the opposite of each term subtracted, for example (5n - 7) - (2n + 3)", "9.3-add", "7.2-subtract-integers"),
    skill("9.3-multiply-monomial", "Multiply a polynomial by a monomial, for example 2n(n + 7) = 2n^2 + 14n", "9.3-like-terms", "9.2-product-quotient-laws", "5.9-distributive"),
    skill("9.3-divide-monomial", "Divide a polynomial by a monomial, for example (15k^2 - 10k) / 5k = 3k - 2", "9.3-multiply-monomial"),
  ] },
  { code: "9.4", grade: 9, strand: "A", text: "two-variable linear relations, using graphing, interpolation, and extrapolation", skills: [
    skill("9.4-table-of-values", "Make a table of values for a linear relation such as y = 2x - 3, also with fraction or decimal values", "8.6-evaluate-relation", "9.1-multiply-divide", "8.6-table-of-values"),
    skill("9.4-write-relation", "Write a linear relation for a situation or a table of values, for example a cost of $5 plus $2 an hour", "8.6-table-to-relation", "8.6-relation-in-context"),
    skill("9.4-graph-line", "Graph a linear relation from its table or its equation, with rational coordinates", "9.4-table-of-values", "7.9-plot-integer-points", "8.6-graph-relation", "8.6-scale-axes"),
    skill("9.4-horizontal-vertical", "Graph and name horizontal and vertical lines, such as y = 3 and x = -2", "7.9-plot-integer-points"),
    skill("9.4-analyze-graph", "Tell what a linear graph shows: its starting value, how much it rises each step, and whether it is linear", "9.4-graph-line", "8.6-discrete-points"),
    skill("9.4-interpolate", "Estimate a value between known points from a graph (interpolation)", "9.4-graph-line", "8.6-read-graph"),
    skill("9.4-extrapolate", "Estimate a value past the known points by extending the line (extrapolation)", "9.4-graph-line"),
  ] },
  { code: "9.5", grade: 9, strand: "A", text: "multi-step one-variable linear equations", skills: [
    skill("9.5-model-pictorially", "Model and solve an equation with a drawing of a balance or algebra tiles", "6.10-preserve-equality", "9.3-algebra-tiles", "8.8-model-balance"),
    skill("9.5-distribute", "Solve an equation with brackets by distributing first, for example 2(x + 3) = -8 or 3(n - 4) = 15", "8.8-solve-two-step-integers", "9.3-multiply-monomial"),
    skill("9.5-collect-like-terms", "Collect like terms, then solve, for example 4n - 7 + 2n = 23", "8.8-solve-two-step-integers", "8.7-combine-terms"),
    skill("9.5-variables-both-sides", "Solve an equation with the variable on both sides, for example 5n + 3 = 2n - 9", "9.5-collect-like-terms", "6.10-preserve-equality"),
    skill("9.5-rational-coefficients", "Solve an equation with fraction or decimal coefficients, constants or solutions, for example n/3 + 2 = 5/6", "8.8-solve-two-step-integers", "9.1-add-subtract", "9.1-multiply-divide"),
    skill("9.5-multi-step", "Solve and verify a multi-step equation, for example 1 + 2x = 3 - 2/3(x + 6)", "9.5-distribute", "9.5-variables-both-sides", "9.5-rational-coefficients", "8.8-verify"),
    skill("9.5-word-problems", "Write and solve a multi-step equation for a word problem", "9.5-multi-step", "7.6-model-problem", "8.8-word-problems"),
  ] },
  { code: "9.6", grade: 9, strand: "MG", text: "spatial proportional reasoning", skills: [
    skill("9.6-metric-conversions", "Change between metric units of length: mm, cm, m and km", "3.9-metric-units", "6.8-multiply-decimal", "6.8-divide-decimal"),
    skill("9.6-scale-factor", "Find the scale factor of an enlargement or a reduction", "6.6-equivalent-ratios", "8.4-rates"),
    skill("9.6-draw-scale-diagram", "Draw a scale diagram that enlarges or reduces a 2D shape by a scale factor", "9.6-scale-factor"),
    skill("9.6-use-scale", "Use a scale such as 1 cm : 50 m to find an actual length or a length on a drawing", "9.6-scale-factor", "9.6-metric-conversions", "8.4-proportion-problems"),
    skill("9.6-similar-shapes", "Tell if two triangles or polygons are similar from their angles and the ratios of their sides", "6.6-equivalent-ratios", "6.13-measure-angles"),
    skill("9.6-similar-missing-side", "Find a missing side of similar triangles or polygons with a proportion", "9.6-similar-shapes", "9.6-scale-factor", "8.4-solve-proportion"),
    skill("9.6-indirect-measurement", "Use similar triangles to find a length you cannot measure, for example a tree's height from its shadow", "9.6-similar-missing-side"),
  ] },
  { code: "9.7", grade: 9, strand: "DP", text: "statistics in society", skills: [
    skill("9.7-population-sample", "Tell a population from a sample, and say when to use a sample", "5.17-double-bar-graph"),
    skill("9.7-sampling-methods", "Choose a sampling method that gives a fair sample, for example random rather than only friends", "9.7-population-sample"),
    skill("9.7-bias", "Find bias in a survey question or a sample, such as a leading question", "9.7-population-sample"),
    skill("9.7-collection-issues", "Name problems in collecting data: ethics, cost, time and timing, privacy and cultural sensitivity", "9.7-population-sample"),
    skill("9.7-misleading-stats", "Tell how a graph or a statistic misleads, for example an axis that does not start at 0 or a very small sample", "6.17-read-line-graph", "7.11-read-circle-graph", "8.12-mean", "8.12-outlier", "8.12-choose-measure"),
    skill("9.7-sample-to-population", "Use a sample's result to estimate for the population, for example 12 of 40 students is 30%", "9.7-sampling-methods", "6.7-percent-of", "7.4-fraction-decimal-percent"),
  ] },
  { code: "9.8", grade: 9, strand: "F", text: "financial literacy - simple budgets and transactions", skills: [
    skill("9.8-budget", "Make a simple budget with income and expenses, and find what is left", "5.19-budget", "6.8-decimal-word-problems"),
    skill("9.8-bank-record", "Keep a running balance of deposits, withdrawals and fees in a bank account record", "6.8-decimal-word-problems", "7.2-integer-contexts"),
    skill("9.8-simple-interest", "Find simple interest (interest = principal x rate x time) and the total amount", "6.7-percent-of", "7.3-multiply-decimals", "8.3-decimal-percent-of"),
    skill("9.8-planned-purchase", "Plan savings for a purchase, and compare saving first with paying over time", "9.8-budget", "9.8-simple-interest", "6.19-saving-plan", "8.14-compare-services"),
  ] },
];
