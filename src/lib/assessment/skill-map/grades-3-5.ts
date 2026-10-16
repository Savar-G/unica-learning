// BC skill map, Grades 3 to 5 (#192). Standard text is exact: grades 1-7 from
// .design/research/assessment-audit-2026-10-15/bc-math-standards.csv, K and grade 8 from
// .design/research/online-assessment/bc-math-curriculum-map.md. Skills and prerequisites: AI draft, for review (#194).
import { skill, type BcStandard } from "./kit";

export const BC_GRADES_3_5: readonly BcStandard[] = [
  { code: "3.1", grade: 3, strand: "N", text: "number concepts to 1000", skills: [
    skill("3.1-place-value-1000", "Tell the value of each digit in a three-digit number, with zero as a placeholder", "2.1-place-value-tens-ones"),
    skill("3.1-compare-order-1000", "Compare and order numbers to 1000", "3.1-place-value-1000", "2.1-compare-order-100"),
    skill("3.1-count-1000", "Count and skip-count to 1000 from any number, also across a hundred", "2.1-count-to-100", "3.1-place-value-1000"),
    skill("3.1-estimate-quantity", "Estimate a large quantity with a benchmark", "2.2-benchmarks-25-50-100"),
  ] },
  { code: "3.2", grade: 3, strand: "F", text: "fraction concepts", skills: [
    skill("3.2-equal-parts", "Know that the parts of a fraction must be equal in size"),
    skill("3.2-name-fraction-region", "Name a fraction of a region or of a whole", "3.2-equal-parts"),
    skill("3.2-fraction-of-set", "Name a fraction of a set, and find a fraction of a set", "3.2-name-fraction-region", "3.5-equal-sharing"),
    skill("3.2-fraction-number-line", "Place a fraction between 0 and 1 on a number line", "3.2-name-fraction-region"),
    skill("3.2-fraction-whole", "Tell how many parts make a whole, and what fraction is left", "3.2-name-fraction-region"),
  ] },
  { code: "3.3", grade: 3, strand: "O", text: "addition and subtraction to 1000", skills: [
    skill("3.3-add-within-1000", "Add within 1000 with regrouping", "3.1-place-value-1000", "2.4-add-within-100"),
    skill("3.3-subtract-within-1000", "Subtract within 1000 with regrouping, also across zeros", "3.1-place-value-1000", "2.4-subtract-within-100"),
    skill("3.3-word-problems-1000", "Solve word problems within 1000", "3.3-add-within-1000", "3.3-subtract-within-1000", "2.4-word-problems-100"),
  ] },
  { code: "3.4", grade: 3, strand: "O", text: "addition and subtraction facts to 20 (emerging computational fluency)", skills: [
    skill("3.4-recall-addition-20", "Recall addition facts to 20", "2.3-fact-strategies-20"),
    skill("3.4-subtraction-facts-20", "Find subtraction facts to 20 from the related addition facts", "3.4-recall-addition-20"),
  ] },
  { code: "3.5", grade: 3, strand: "O", text: "multiplication and division concepts", skills: [
    skill("3.5-equal-groups", "Find the total of equal groups or of an array", "2.1-count-to-100"),
    skill("3.5-equal-sharing", "Share a quantity equally and find the size of each share", "3.5-equal-groups"),
    skill("3.5-grouping-division", "Find how many equal groups a quantity makes", "3.5-equal-groups"),
    skill("3.5-relate-multiply-divide", "Relate multiplication and division", "3.5-equal-sharing", "3.5-grouping-division"),
  ] },
  { code: "3.6", grade: 3, strand: "A", text: "increasing and decreasing patterns", skills: [
    skill("3.6-increasing-pattern", "Continue an increasing pattern and find a missing term", "2.5-increasing-pattern"),
    skill("3.6-decreasing-pattern", "Continue a decreasing pattern", "2.5-increasing-pattern", "2.4-subtract-within-100"),
    skill("3.6-growth-amount", "Find how much a pattern grows at each step, also when it doubles", "3.6-increasing-pattern"),
  ] },
  { code: "3.7", grade: 3, strand: "A", text: "pattern rules using words and numbers, based on concrete experiences", skills: [
    skill("3.7-describe-rule", "Describe a pattern rule in words and numbers, with a start and a change", "3.6-growth-amount"),
    skill("3.7-use-rule", "Use a rule to find a later term, also from a concrete pattern", "3.7-describe-rule"),
  ] },
  { code: "3.8", grade: 3, strand: "A", text: "one-step addition and subtraction equations with an unknown number", skills: [
    skill("3.8-unknown-result-change", "Solve an addition or subtraction equation with the unknown in the result or the change", "2.6-missing-addend"),
    skill("3.8-unknown-start", "Solve an equation with the unknown at the start, for example ? - 7 = 6", "3.8-unknown-result-change"),
    skill("3.8-balance-equations", "Find the unknown that makes both sides equal, for example 16 + 4 = 18 + ?", "2.7-equal-sign", "3.8-unknown-result-change"),
    skill("3.8-write-equation", "Write an equation for a word problem", "3.8-unknown-start"),
  ] },
  { code: "3.9", grade: 3, strand: "MG", text: "measurement, using standard units (linear, mass, and capacity)", skills: [
    skill("3.9-metric-units", "Choose a suitable unit for length, mass or capacity (cm, m, km, g, kg, mL, L)", "2.8-choose-unit"),
    skill("3.9-convert-m-cm", "Change between metres and centimetres", "3.9-metric-units", "3.5-equal-groups"),
    skill("3.9-area-square-units", "Find an area by counting square units", "3.5-equal-groups"),
    skill("3.9-perimeter-concept", "Find the distance around a shape", "2.8-measure-cm-m", "3.3-add-within-1000"),
  ] },
  { code: "3.10", grade: 3, strand: "MG", text: "time concepts", skills: [
    skill("3.10-time-units", "Know how seconds, minutes, hours, days, weeks, months and years relate"),
    skill("3.10-convert-time", "Change between units of time, for example weeks to days", "3.10-time-units", "3.5-equal-groups"),
  ] },
  { code: "3.11", grade: 3, strand: "MG", text: "construction of 3D objects", skills: [
    skill("3.11-faces-edges-vertices", "Count the faces, edges and vertices of a 3D object", "2.9-faces-of-3d"),
    skill("3.11-name-3d", "Name and describe spheres, cubes, prisms, cones and cylinders", "2.9-faces-of-3d"),
    skill("3.11-nets", "Match a net or a skeleton to its 3D object", "3.11-faces-edges-vertices"),
  ] },
  { code: "3.12", grade: 3, strand: "DP", text: "one-to-one correspondence with bar graphs, pictographs, charts, and tables", skills: [
    skill("3.12-read-bar-graph", "Read and compare data in a bar graph, pictograph, chart or table", "2.10-read-pictograph"),
    skill("3.12-tally", "Read and record data with tally marks", "1.1-skip-count-2-5"),
    skill("3.12-choose-display", "Choose a suitable graph or table for a set of data", "3.12-read-bar-graph"),
  ] },
  { code: "3.13", grade: 3, strand: "DP", text: "likelihood of simulated events, using comparative language", skills: [
    skill("3.13-simulated-likelihood", "Compare the likelihood of outcomes with coins, spinners, bags and dice", "2.11-compare-likelihood"),
    skill("3.13-independent-trials", "Know that a past result does not change the chance of the next coin toss", "3.13-simulated-likelihood"),
  ] },
  { code: "3.14", grade: 3, strand: "O", text: "financial literacy - fluency with coins and bills to 100 dollars, and earning and payment", skills: [
    skill("3.14-coins-bills-100", "Find the value of a mix of coins and bills to 100 dollars", "2.12-count-mixed-coins", "3.3-add-within-1000"),
    skill("3.14-make-amount-ways", "Make the same amount of money in different ways", "3.14-coins-bills-100"),
    skill("3.14-earning-payment", "Describe ways to earn money and ways to pay", "2.12-spend-save"),
  ] },
  { code: "4.1", grade: 4, strand: "N", text: "number concepts to 10 000", skills: [
    skill("4.1-place-value-10000", "Tell the value of each digit in a number to 10 000", "3.1-place-value-1000"),
    skill("4.1-compare-order-10000", "Compare and order numbers to 10 000", "4.1-place-value-10000", "3.1-compare-order-1000"),
    skill("4.1-expanded-form", "Write a number from its expanded form", "4.1-place-value-10000"),
    skill("4.1-multiples", "Count by multiples, and tell if a number is a multiple of another", "3.5-equal-groups"),
  ] },
  { code: "4.2", grade: 4, strand: "F", text: "decimals to hundredths", skills: [
    skill("4.2-tenths", "Name tenths as a fraction and as a decimal, on a strip or a number line", "3.2-fraction-number-line"),
    skill("4.2-hundredths", "Name hundredths as a fraction and as a decimal, on a 100 grid", "4.2-tenths"),
    skill("4.2-decimal-place-value", "Tell the value of each digit in a decimal to hundredths", "4.2-hundredths", "4.1-place-value-10000"),
    skill("4.2-fraction-decimal", "Write a fraction with a denominator of 10 or 100 as a decimal, and back", "4.2-tenths", "4.2-hundredths"),
    skill("4.2-compare-decimals", "Compare and order decimals to hundredths", "4.2-decimal-place-value"),
  ] },
  { code: "4.3", grade: 4, strand: "F", text: "ordering and comparing fractions", skills: [
    skill("4.3-same-denominator", "Compare fractions with the same denominator", "3.2-name-fraction-region"),
    skill("4.3-same-numerator", "Compare unit fractions, or fractions with the same numerator", "3.2-name-fraction-region"),
    skill("4.3-benchmarks", "Compare a fraction with 0, 1/2 and 1", "4.3-same-denominator"),
  ] },
  { code: "4.4", grade: 4, strand: "O", text: "addition and subtraction to 10 000", skills: [
    skill("4.4-add-within-10000", "Add within 10 000 with regrouping", "3.3-add-within-1000", "4.1-place-value-10000"),
    skill("4.4-subtract-within-10000", "Subtract within 10 000 with regrouping", "3.3-subtract-within-1000", "4.1-place-value-10000"),
    skill("4.4-estimate", "Estimate a sum or a difference by rounding", "4.1-compare-order-10000"),
  ] },
  { code: "4.5", grade: 4, strand: "O", text: "multiplication and division of two- or three-digit numbers by one-digit numbers", skills: [
    skill("4.5-multiply-1-digit", "Multiply a two- or three-digit number by a one-digit number", "4.8-multiplication-facts", "4.1-place-value-10000"),
    skill("4.5-divide-1-digit", "Divide a two- or three-digit number by a one-digit number", "4.8-division-facts", "4.5-multiply-1-digit"),
    skill("4.5-word-problems", "Solve multiplication and division word problems", "4.5-multiply-1-digit", "4.5-divide-1-digit", "3.5-relate-multiply-divide"),
  ] },
  { code: "4.6", grade: 4, strand: "O", text: "addition and subtraction of decimals to hundredths", skills: [
    skill("4.6-add-decimals", "Add decimals to hundredths, with the place values lined up", "4.2-decimal-place-value", "4.4-add-within-10000"),
    skill("4.6-subtract-decimals", "Subtract decimals to hundredths, also with a different number of decimal places", "4.2-decimal-place-value", "4.4-subtract-within-10000"),
  ] },
  { code: "4.7", grade: 4, strand: "O", text: "addition and subtraction facts to 20 (developing computational fluency)", skills: [
    skill("4.7-addition-facts-fluency", "Use flexible mental strategies for addition and subtraction facts to 20", "3.4-recall-addition-20", "3.4-subtraction-facts-20"),
  ] },
  { code: "4.8", grade: 4, strand: "O", text: "multiplication and division facts to 100 (introductory computational strategies)", skills: [
    skill("4.8-multiplication-facts", "Find multiplication facts to 100, and recall the 2s, 5s and 10s", "3.5-equal-groups", "4.1-multiples"),
    skill("4.8-division-facts", "Find division facts to 100 from the related multiplication facts", "4.8-multiplication-facts", "3.5-relate-multiply-divide"),
  ] },
  { code: "4.9", grade: 4, strand: "A", text: "increasing and decreasing patterns, using tables and charts", skills: [
    skill("4.9-table-pattern", "Find the rule of an increasing or decreasing pattern in a table or a chart", "3.7-describe-rule"),
    skill("4.9-extend-table", "Extend a pattern in a table to find a later value", "4.9-table-pattern"),
  ] },
  { code: "4.10", grade: 4, strand: "A", text: "algebraic relationships among quantities", skills: [
    skill("4.10-relationship", "Show a relationship among quantities with an equation, also with multiplication", "3.8-write-equation", "4.8-multiplication-facts"),
    skill("4.10-equal-products", "Find the unknown that makes two products equal, for example 6 x 2 = 4 x ?", "3.8-balance-equations", "4.8-multiplication-facts"),
  ] },
  { code: "4.11", grade: 4, strand: "A", text: "one-step equations with an unknown number, using all operations", skills: [
    skill("4.11-add-subtract-unknown", "Solve a one-step addition or subtraction equation with the unknown in any position", "3.8-unknown-start", "4.4-subtract-within-10000"),
    skill("4.11-multiply-divide-unknown", "Solve a one-step multiplication or division equation with an unknown", "4.8-division-facts", "3.8-unknown-start"),
  ] },
  { code: "4.12", grade: 4, strand: "MG", text: "how to tell time with analog and digital clocks, using 12- and 24-hour clocks", skills: [
    skill("4.12-read-analog", "Read an analog clock to the nearest minute, also quarter past and quarter to", "3.10-time-units"),
    skill("4.12-24-hour", "Change between 12-hour and 24-hour clock times", "4.12-read-analog"),
  ] },
  { code: "4.13", grade: 4, strand: "MG", text: "regular and irregular polygons", skills: [
    skill("4.13-regular-irregular", "Tell a regular polygon from an irregular polygon", "2.9-name-2d-shapes"),
    skill("4.13-name-polygons", "Name polygons by their number of sides", "2.9-name-2d-shapes"),
  ] },
  { code: "4.14", grade: 4, strand: "MG", text: "perimeter of regular and irregular shapes", skills: [
    skill("4.14-perimeter", "Find the perimeter of a regular or an irregular shape", "3.9-perimeter-concept", "4.4-add-within-10000"),
    skill("4.14-missing-side", "Find a missing side from the perimeter", "4.14-perimeter", "4.8-division-facts"),
  ] },
  { code: "4.15", grade: 4, strand: "MG", text: "line symmetry", skills: [
    skill("4.15-line-symmetry", "Find the lines of symmetry of a shape", "4.13-regular-irregular"),
  ] },
  { code: "4.16", grade: 4, strand: "DP", text: "one-to-one correspondence and many-to-one correspondence, using bar graphs and pictographs", skills: [
    skill("4.16-many-to-one", "Read a pictograph or bar graph where one symbol stands for more than one item", "3.12-read-bar-graph", "4.8-multiplication-facts"),
    skill("4.16-compare-data", "Find how many more one group has than another", "4.16-many-to-one"),
  ] },
  { code: "4.17", grade: 4, strand: "DP", text: "probability experiments", skills: [
    skill("4.17-predict-outcome", "Predict the most likely outcome of a spinner, a die or a bag draw", "3.13-simulated-likelihood"),
    skill("4.17-record-trials", "Record the results of trials with tallies, and compare them with the prediction", "4.17-predict-outcome", "3.12-tally"),
  ] },
  { code: "4.18", grade: 4, strand: "O", text: "financial literacy - monetary calculations, including making change with amounts to 100 dollars and making simple financial decisions", skills: [
    skill("4.18-money-notation", "Write an amount of money with a dollar sign and a decimal point", "4.2-decimal-place-value", "3.14-coins-bills-100"),
    skill("4.18-make-change-100", "Make change for amounts to 100 dollars", "4.18-money-notation", "4.6-subtract-decimals"),
    skill("4.18-financial-decisions", "Make simple decisions about earning, spending, saving and giving", "3.14-earning-payment"),
  ] },
  { code: "5.1", grade: 5, strand: "N", text: "number concepts to 1 000 000", skills: [
    skill("5.1-place-value-million", "Tell the value of each digit in a number to 1 000 000", "4.1-place-value-10000"),
    skill("5.1-read-write", "Read and write numbers to 1 000 000 in words, in digits and in expanded form", "5.1-place-value-million", "4.1-expanded-form"),
    skill("5.1-compare-order-million", "Compare and order numbers to 1 000 000", "5.1-place-value-million", "4.1-compare-order-10000"),
  ] },
  { code: "5.2", grade: 5, strand: "F", text: "decimals to thousandths", skills: [
    skill("5.2-thousandths", "Name thousandths as a fraction and as a decimal", "4.2-hundredths"),
    skill("5.2-decimal-place-value", "Tell the value of each digit in a decimal to thousandths", "5.2-thousandths", "4.2-decimal-place-value"),
    skill("5.2-between-decimals", "Find a decimal between two decimals", "5.2-decimal-place-value"),
  ] },
  { code: "5.3", grade: 5, strand: "F", text: "equivalent fractions", skills: [
    skill("5.3-equivalent-fractions", "Find an equivalent fraction by multiplying or dividing the numerator and the denominator by the same number", "4.3-same-denominator", "4.8-multiplication-facts"),
    skill("5.3-same-amount", "Explain that equivalent fractions name the same amount of the same whole", "3.2-name-fraction-region"),
    skill("5.3-missing-term", "Find the missing number in a pair of equivalent fractions", "5.3-equivalent-fractions", "4.8-division-facts"),
  ] },
  { code: "5.4", grade: 5, strand: "F", text: "whole-number, fraction, and decimal benchmarks", skills: [
    skill("5.4-fraction-to-decimal", "Write a fraction as a decimal through an equivalent fraction with a denominator of 10 or 100", "5.3-equivalent-fractions", "4.2-fraction-decimal"),
    skill("5.4-compare-decimals", "Compare and order decimals with different numbers of decimal places", "5.2-decimal-place-value", "4.2-compare-decimals"),
    skill("5.4-compare-fractions", "Compare and order fractions with benchmarks or equivalent fractions", "4.3-benchmarks", "5.3-equivalent-fractions"),
  ] },
  { code: "5.5", grade: 5, strand: "O", text: "addition and subtraction of whole numbers to 1 000 000", skills: [
    skill("5.5-add-million", "Add whole numbers to 1 000 000 with regrouping", "4.4-add-within-10000", "5.1-place-value-million"),
    skill("5.5-subtract-million", "Subtract whole numbers to 1 000 000 with regrouping", "4.4-subtract-within-10000", "5.1-place-value-million"),
  ] },
  { code: "5.6", grade: 5, strand: "O", text: "multiplication and division to three digits, including division with remainders", skills: [
    skill("5.6-multiply-2-digit", "Multiply a two- or three-digit number by a two-digit number", "4.5-multiply-1-digit", "5.9-multiply-tens"),
    skill("5.6-divide-remainder", "Divide with a remainder", "4.5-divide-1-digit"),
    skill("5.6-interpret-remainder", "Use a remainder in a word problem: round up, round down or tell what is left", "5.6-divide-remainder"),
    skill("5.6-divide-2-digit", "Divide a three-digit number by a two-digit number", "5.6-divide-remainder", "5.6-multiply-2-digit"),
  ] },
  { code: "5.7", grade: 5, strand: "O", text: "addition and subtraction of decimals to thousandths", skills: [
    skill("5.7-add-thousandths", "Add decimals to thousandths", "4.6-add-decimals", "5.2-decimal-place-value"),
    skill("5.7-subtract-thousandths", "Subtract decimals to thousandths, with regrouping", "4.6-subtract-decimals", "5.2-decimal-place-value"),
  ] },
  { code: "5.8", grade: 5, strand: "O", text: "addition and subtraction facts to 20 (extending computational fluency)", skills: [
    skill("5.8-extend-facts", "Use addition facts to 20 for related larger numbers, for example 800 + 700", "4.7-addition-facts-fluency", "5.1-place-value-million"),
  ] },
  { code: "5.9", grade: 5, strand: "O", text: "multiplication and division facts to 100 (emerging computational fluency)", skills: [
    skill("5.9-recall-facts", "Recall many multiplication facts, such as the 2s, 3s, 4s, 5s and 10s", "4.8-multiplication-facts"),
    skill("5.9-multiply-tens", "Multiply multiples of 10 and 100 by annexing zeros, for example 20 x 40", "5.9-recall-facts", "4.1-place-value-10000"),
    skill("5.9-distributive", "Multiply with the distributive property, for example 67 x 6 = 60 x 6 + 7 x 6", "5.9-recall-facts"),
  ] },
  { code: "5.10", grade: 5, strand: "A", text: "rules for increasing and decreasing patterns with words, numbers, symbols, and variables", skills: [
    skill("5.10-pattern-rule", "Find and use the rule of an increasing or decreasing pattern", "4.9-table-pattern"),
    skill("5.10-nth-term", "Find a later or an earlier term of a pattern from its rule", "5.10-pattern-rule"),
    skill("5.10-rule-with-variable", "Use a rule with a variable, for example 5 x n + 1, to find an output", "5.10-pattern-rule", "4.10-relationship"),
  ] },
  { code: "5.11", grade: 5, strand: "A", text: "one-step equations with variables", skills: [
    skill("5.11-evaluate-expression", "Find the value of a one-operation expression for a value of the variable", "4.10-relationship"),
    skill("5.11-solve-one-step", "Solve a one-step equation with a variable, for all four operations", "4.11-add-subtract-unknown", "4.11-multiply-divide-unknown"),
    skill("5.11-write-equation", "Write an equation with a variable for a word problem", "5.11-solve-one-step"),
  ] },
  { code: "5.12", grade: 5, strand: "MG", text: "area measurement of squares and rectangles", skills: [
    skill("5.12-area-rectangle", "Find the area of a square or a rectangle as length times width", "3.9-area-square-units", "4.8-multiplication-facts"),
    skill("5.12-missing-side", "Find a missing side from the area", "5.12-area-rectangle", "4.8-division-facts"),
  ] },
  { code: "5.13", grade: 5, strand: "MG", text: "relationships between area and perimeter", skills: [
    skill("5.13-same-area-different-perimeter", "Show that shapes with the same area can have different perimeters", "5.12-area-rectangle", "4.14-perimeter"),
    skill("5.13-compare-area-perimeter", "Find the area or the perimeter of one rectangle from the area or the perimeter of another", "5.13-same-area-different-perimeter", "5.12-missing-side"),
  ] },
  { code: "5.14", grade: 5, strand: "MG", text: "duration, using measurement of time", skills: [
    skill("5.14-elapsed-time", "Find the time between a start time and an end time", "4.12-read-analog"),
    skill("5.14-end-time", "Find an end time from a start time and a duration", "5.14-elapsed-time"),
  ] },
  { code: "5.15", grade: 5, strand: "MG", text: "classification of prisms and pyramids", skills: [
    skill("5.15-classify-prisms-pyramids", "Tell a prism from a pyramid, and name it by its base", "3.11-name-3d", "4.13-name-polygons"),
    skill("5.15-count-parts", "Count the faces, edges and vertices of a prism or a pyramid", "5.15-classify-prisms-pyramids", "3.11-faces-edges-vertices"),
    skill("5.15-quadrilaterals", "Describe and sort quadrilaterals", "4.13-name-polygons"),
  ] },
  { code: "5.16", grade: 5, strand: "MG", text: "single transformations", skills: [
    skill("5.16-translation", "Translate a shape by a given slide"),
    skill("5.16-reflection", "Reflect a shape or a point in a mirror line", "4.15-line-symmetry"),
    skill("5.16-rotation", "Rotate a shape by a quarter turn or a half turn"),
  ] },
  { code: "5.17", grade: 5, strand: "DP", text: "one-to-one correspondence and many-to-one correspondence, using double bar graphs", skills: [
    skill("5.17-double-bar-graph", "Read and compare two sets of data in a double bar graph", "4.16-compare-data"),
    skill("5.17-scale", "Read a graph whose scale or symbol stands for more than one item", "4.16-many-to-one"),
  ] },
  { code: "5.18", grade: 5, strand: "DP", text: "probability experiments, single events or outcomes", skills: [
    skill("5.18-probability-fraction", "Write the probability of a single outcome as a fraction", "4.17-predict-outcome", "3.2-name-fraction-region"),
    skill("5.18-experiment", "Do a probability experiment and compare the results with the prediction", "4.17-record-trials"),
  ] },
  { code: "5.19", grade: 5, strand: "O", text: "financial literacy - monetary calculations, including making change with amounts to 1000 dollars and developing simple financial plans", skills: [
    skill("5.19-change-1000", "Make change for amounts to 1000 dollars", "4.18-make-change-100", "5.7-subtract-thousandths"),
    skill("5.19-budget", "Make a simple budget from income and expenses", "5.19-change-1000", "4.18-financial-decisions"),
  ] },
];
