// BC skill map, Grades 6 to 8 (#192). Standard text is exact: grades 1-7 from
// .design/research/assessment-audit-2026-10-15/bc-math-standards.csv, K and grade 8 from
// .design/research/online-assessment/bc-math-curriculum-map.md. Skills and prerequisites: AI draft, for review (#194).
import { skill, type BcStandard } from "./kit";

export const BC_GRADES_6_8: readonly BcStandard[] = [
  { code: "6.1", grade: 6, strand: "N", text: "small to large numbers (thousandths to billions)", skills: [
    skill("6.1-place-value", "Tell the value of each digit from thousandths to billions", "5.1-place-value-million", "5.2-decimal-place-value"),
    skill("6.1-large-numbers", "Read and write large numbers, for example 7.5 billion in digits", "6.1-place-value"),
    skill("6.1-compare-order", "Compare, order and estimate numbers from thousandths to billions", "6.1-place-value", "5.4-compare-decimals"),
  ] },
  { code: "6.2", grade: 6, strand: "O", text: "multiplication and division facts to 100 (developing computational fluency)", skills: [
    skill("6.2-fact-strategies", "Use mental strategies for multiplication and division facts, for example double-double for 23 x 4", "5.9-recall-facts", "5.9-distributive"),
  ] },
  { code: "6.3", grade: 6, strand: "O", text: "order of operations with whole numbers", skills: [
    skill("6.3-order-of-operations", "Use the order of operations with whole numbers: brackets, then multiplication and division, then addition and subtraction", "6.2-fact-strategies", "5.5-add-million"),
    skill("6.3-word-expressions", "Write and evaluate a numerical expression for a word problem", "6.3-order-of-operations"),
  ] },
  { code: "6.4", grade: 6, strand: "N", text: "factors and multiples - greatest common factor and least common multiple", skills: [
    skill("6.4-prime-composite", "Tell prime numbers from composite numbers", "4.8-multiplication-facts"),
    skill("6.4-divisibility", "Use divisibility rules", "4.8-division-facts"),
    skill("6.4-factors", "List all the factors of a number, also with a factor tree", "6.4-divisibility"),
    skill("6.4-gcf", "Find the greatest common factor of two numbers", "6.4-factors"),
    skill("6.4-lcm", "Find the least common multiple of two numbers", "4.1-multiples"),
    skill("6.4-gcf-lcm-problems", "Use the greatest common factor or the least common multiple in a word problem", "6.4-gcf", "6.4-lcm"),
  ] },
  { code: "6.5", grade: 6, strand: "F", text: "improper fractions and mixed numbers", skills: [
    skill("6.5-improper-to-mixed", "Write an improper fraction as a mixed number", "5.6-divide-remainder", "3.2-fraction-whole"),
    skill("6.5-mixed-to-improper", "Write a mixed number as an improper fraction", "6.5-improper-to-mixed"),
    skill("6.5-compare-order", "Compare and order improper fractions and mixed numbers", "6.5-improper-to-mixed", "5.4-compare-fractions"),
  ] },
  { code: "6.6", grade: 6, strand: "F", text: "introduction to ratios", skills: [
    skill("6.6-write-ratio", "Write a part-to-part or a part-to-whole ratio", "3.2-fraction-of-set"),
    skill("6.6-equivalent-ratios", "Find equivalent ratios", "6.6-write-ratio", "5.3-equivalent-fractions"),
    skill("6.6-ratio-to-fraction", "Change a part-to-part ratio into a fraction of the whole", "6.6-write-ratio"),
  ] },
  { code: "6.7", grade: 6, strand: "F", text: "whole-number percents and percentage discounts", skills: [
    skill("6.7-percent-meaning", "Know a percent as parts of 100, and that 50% = 1/2 = 0.5", "4.2-hundredths"),
    skill("6.7-percent-of", "Find a whole-number percent of a quantity", "6.7-percent-meaning", "5.3-equivalent-fractions"),
    skill("6.7-discount", "Find a percentage discount and the sale price", "6.7-percent-of"),
    skill("6.7-missing-whole", "Find the whole from a part and its percent", "6.7-percent-of"),
  ] },
  { code: "6.8", grade: 6, strand: "O", text: "multiplication and division of decimals", skills: [
    skill("6.8-multiply-decimal", "Multiply a decimal by a whole number", "4.5-multiply-1-digit", "5.2-decimal-place-value"),
    skill("6.8-divide-decimal", "Divide a decimal by a whole number", "4.5-divide-1-digit", "5.2-decimal-place-value"),
    skill("6.8-decimal-word-problems", "Solve decimal word problems, also with money", "6.8-multiply-decimal", "6.8-divide-decimal"),
  ] },
  { code: "6.9", grade: 6, strand: "A", text: "increasing and decreasing patterns, using expressions, tables, and graphs as functional relationships", skills: [
    skill("6.9-evaluate-rule", "Find the value of a two-operation rule such as 2n + 1 for a value of n", "5.10-rule-with-variable", "6.3-order-of-operations"),
    skill("6.9-find-rule", "Find the rule of a pattern from a table or a sequence", "5.10-pattern-rule", "6.9-evaluate-rule"),
    skill("6.9-graph-relation", "Plot the points of a rule on a graph in the first quadrant", "6.9-evaluate-rule", "6.16-plot-points"),
    skill("6.9-write-expression", "Write an expression for words, for example \"8 more than 5 times a number\"", "5.11-write-equation"),
  ] },
  { code: "6.10", grade: 6, strand: "A", text: "one-step equations with whole-number coefficients and solutions", skills: [
    skill("6.10-preserve-equality", "Keep a balance or an equation equal by doing the same thing to both sides", "3.8-balance-equations"),
    skill("6.10-solve-one-step", "Solve a one-step equation with whole-number coefficients and solutions", "5.11-solve-one-step", "6.10-preserve-equality"),
    skill("6.10-combine-like-terms", "Combine like terms to solve an equation, for example 4x + 5x = 45", "6.10-solve-one-step"),
    // Added with the skill tags (#193): a template asks for the equation of a story.
    skill("6.10-write-equation", "Write a one-step equation with a variable for a situation", "5.11-write-equation"),
  ] },
  { code: "6.11", grade: 6, strand: "MG", text: "perimeter of complex shapes", skills: [
    skill("6.11-complex-perimeter", "Find the perimeter of a composite shape, also with missing side lengths", "4.14-perimeter"),
  ] },
  { code: "6.12", grade: 6, strand: "MG", text: "area of triangles, parallelograms, and trapezoids", skills: [
    skill("6.12-triangle-area", "Find the area of a triangle as half of base times height", "5.12-area-rectangle"),
    skill("6.12-parallelogram-area", "Find the area of a parallelogram as base times height", "5.12-area-rectangle"),
    skill("6.12-trapezoid-area", "Find the area of a trapezoid", "6.12-triangle-area", "6.12-parallelogram-area"),
    skill("6.12-missing-dimension", "Find a base or a height from the area", "6.12-triangle-area", "6.12-parallelogram-area"),
  ] },
  { code: "6.13", grade: 6, strand: "MG", text: "angle measurement and classification", skills: [
    skill("6.13-classify-angles", "Classify an angle as acute, right, obtuse, straight or reflex"),
    skill("6.13-measure-angles", "Measure and estimate an angle with the 45, 90 and 180 degree references", "6.13-classify-angles"),
    skill("6.13-angle-sums", "Find a missing angle on a straight line, in a right angle or in a triangle", "6.13-measure-angles"),
  ] },
  { code: "6.14", grade: 6, strand: "MG", text: "volume and capacity", skills: [
    skill("6.14-volume-cubes", "Find the volume of a solid from its unit cubes, layer by layer", "5.12-area-rectangle"),
    skill("6.14-volume-prism", "Find the volume of a rectangular prism", "6.14-volume-cubes"),
    skill("6.14-capacity-units", "Change between mL and L, and relate cubic centimetres to mL", "3.9-metric-units"),
  ] },
  { code: "6.15", grade: 6, strand: "MG", text: "triangles", skills: [
    skill("6.15-classify-by-sides", "Classify a triangle as scalene, isosceles or equilateral", "4.13-regular-irregular"),
    skill("6.15-classify-by-angles", "Classify a triangle as right, acute or obtuse", "6.13-classify-angles"),
  ] },
  { code: "6.16", grade: 6, strand: "MG", text: "combinations of transformations", skills: [
    skill("6.16-plot-points", "Plot and read ordered pairs of whole numbers in the first quadrant"),
    skill("6.16-translate-point", "Translate a point or a shape on a grid", "5.16-translation", "6.16-plot-points"),
    skill("6.16-combine-transformations", "Combine translations, rotations and reflections on one shape", "5.16-translation", "5.16-reflection", "5.16-rotation"),
  ] },
  { code: "6.17", grade: 6, strand: "DP", text: "line graphs", skills: [
    skill("6.17-read-line-graph", "Read and interpret a line graph", "5.17-scale"),
    skill("6.17-make-line-graph", "Make a line graph from a table", "6.17-read-line-graph", "6.16-plot-points"),
  ] },
  { code: "6.18", grade: 6, strand: "DP", text: "single-outcome probability, both theoretical and experimental", skills: [
    skill("6.18-theoretical", "Find the theoretical probability of a single outcome by listing the outcomes", "5.18-probability-fraction"),
    skill("6.18-experimental", "Find the experimental probability from the results of trials", "5.18-experiment"),
    skill("6.18-compare", "Compare theoretical and experimental probability", "6.18-theoretical", "6.18-experimental"),
  ] },
  { code: "6.19", grade: 6, strand: "O", text: "financial literacy - simple budgeting and consumer math", skills: [
    skill("6.19-saving-plan", "Find how long it takes to save for a purchase", "5.19-budget", "4.5-divide-1-digit"),
    skill("6.19-consumer-choice", "Compare prices to make an informed purchase", "6.8-decimal-word-problems"),
  ] },
  { code: "7.1", grade: 7, strand: "O", text: "multiplication and division facts to 100 (extending computational fluency)", skills: [
    skill("7.1-fact-strategies", "Use fact strategies with larger numbers, for example times 5 as times 10, then halve", "6.2-fact-strategies"),
  ] },
  { code: "7.2", grade: 7, strand: "O", text: "operations with integers (addition, subtraction, multiplication, division, and order of operations)", skills: [
    skill("7.2-compare-integers", "Compare and order integers", "6.1-compare-order"),
    skill("7.2-add-integers", "Add integers", "7.2-compare-integers"),
    skill("7.2-subtract-integers", "Subtract integers, also subtract a negative integer", "7.2-add-integers"),
    skill("7.2-multiply-divide-integers", "Multiply and divide integers with the sign rules", "7.2-compare-integers", "6.2-fact-strategies"),
    skill("7.2-integer-order-of-operations", "Use the order of operations with integers", "7.2-add-integers", "7.2-multiply-divide-integers", "6.3-order-of-operations"),
    skill("7.2-integer-contexts", "Solve integer problems in context, for example a change in temperature", "7.2-add-integers", "7.2-subtract-integers"),
  ] },
  { code: "7.3", grade: 7, strand: "O", text: "operations with decimals (addition, subtraction, multiplication, division, and order of operations)", skills: [
    skill("7.3-multiply-decimals", "Multiply a decimal by a decimal", "6.8-multiply-decimal"),
    skill("7.3-divide-decimals", "Divide by a decimal", "6.8-divide-decimal"),
    skill("7.3-estimate-product", "Tell if a product is more or less than a factor when the other factor is less than 1", "7.3-multiply-decimals"),
    // Added with the skill tags (#193): a template asks the same about a quotient.
    skill("7.3-estimate-quotient", "Tell if a quotient is more or less than the number divided when the divisor is less than 1", "7.3-divide-decimals"),
    skill("7.3-decimal-order-of-operations", "Use the order of operations with decimals", "7.3-multiply-decimals", "6.3-order-of-operations"),
  ] },
  { code: "7.4", grade: 7, strand: "F", text: "relationships between decimals, fractions, ratios, and percents", skills: [
    skill("7.4-fraction-decimal-percent", "Change between fractions, decimals and percents", "5.4-fraction-to-decimal", "6.7-percent-meaning"),
    skill("7.4-lowest-terms", "Write a fraction in lowest terms", "5.3-equivalent-fractions", "6.4-gcf"),
    skill("7.4-terminating-repeating", "Tell a terminating decimal from a repeating decimal", "7.4-fraction-decimal-percent"),
    skill("7.4-compare-forms", "Compare and order fractions, decimals and percents", "7.4-fraction-decimal-percent"),
    skill("7.4-ratio-percent", "Change a ratio into a percent", "6.6-ratio-to-fraction", "7.4-fraction-decimal-percent"),
  ] },
  { code: "7.5", grade: 7, strand: "A", text: "discrete linear relations, using expressions, tables, and graphs", skills: [
    skill("7.5-evaluate-relation", "Find the value of a linear relation, also for negative values", "6.9-evaluate-rule", "7.2-multiply-divide-integers"),
    skill("7.5-table-to-relation", "Find a linear relation from a table of values or a pattern of figures", "6.9-find-rule"),
    skill("7.5-graph-relation", "Tell if a point is on the graph of a relation, in four quadrants", "7.5-evaluate-relation", "7.9-quadrants"),
  ] },
  { code: "7.6", grade: 7, strand: "A", text: "two-step equations with whole-number coefficients, constants, and solutions", skills: [
    skill("7.6-solve-two-step", "Solve and check a two-step equation such as 3x + 4 = 16", "6.10-solve-one-step", "6.10-preserve-equality"),
    skill("7.6-model-problem", "Write and solve a two-step equation for a word problem", "7.6-solve-two-step"),
  ] },
  { code: "7.7", grade: 7, strand: "MG", text: "circumference and area of circles", skills: [
    skill("7.7-radius-diameter", "Relate the radius and the diameter of a circle"),
    skill("7.7-circumference", "Find the circumference of a circle", "7.7-radius-diameter", "7.3-multiply-decimals"),
    skill("7.7-area", "Find the area of a circle", "7.7-radius-diameter", "7.3-multiply-decimals"),
  ] },
  { code: "7.8", grade: 7, strand: "MG", text: "volume of rectangular prisms and cylinders", skills: [
    skill("7.8-prism-volume", "Find the volume of a rectangular prism as the area of the base times the height", "6.14-volume-prism"),
    skill("7.8-cylinder-volume", "Find the volume of a cylinder as the area of the base times the height", "7.8-prism-volume", "7.7-area"),
  ] },
  { code: "7.9", grade: 7, strand: "MG", text: "Cartesian coordinates and graphing", skills: [
    skill("7.9-quadrants", "Name the quadrant or the axis of a point in four quadrants", "6.16-plot-points", "7.2-compare-integers"),
    skill("7.9-plot-integer-points", "Plot and read points with integer coordinates", "7.9-quadrants"),
  ] },
  { code: "7.10", grade: 7, strand: "MG", text: "combinations of transformations", skills: [
    skill("7.10-transform-four-quadrants", "Translate, reflect and rotate a point or a shape in four quadrants", "6.16-combine-transformations", "7.9-plot-integer-points"),
    skill("7.10-combine", "Combine transformations on one shape, also in a tessellation", "7.10-transform-four-quadrants"),
  ] },
  { code: "7.11", grade: 7, strand: "DP", text: "circle graphs", skills: [
    skill("7.11-read-circle-graph", "Read a circle graph and find the quantity in a section", "6.7-percent-of"),
    skill("7.11-make-circle-graph", "Change quantities into percents to make a circle graph", "7.4-fraction-decimal-percent", "7.11-read-circle-graph"),
  ] },
  { code: "7.12", grade: 7, strand: "DP", text: "experimental probability with two independent events", skills: [
    skill("7.12-two-events-outcomes", "List the outcomes of two independent events", "6.18-theoretical"),
    skill("7.12-experimental-two-events", "Find the experimental probability of two independent events from trials", "6.18-experimental", "7.12-two-events-outcomes"),
  ] },
  { code: "7.13", grade: 7, strand: "F", text: "financial literacy - financial percentage", skills: [
    skill("7.13-sales-tax-tip", "Find a sales tax or a tip", "6.7-percent-of", "6.8-decimal-word-problems"),
    skill("7.13-sale-price", "Find a sale price after a percent discount", "6.7-discount"),
  ] },
  { code: "8.1", grade: 8, strand: "N", text: "perfect squares and cubes", skills: [
    skill("8.1-squares-cubes", "Find the square and the cube of a whole number", "5.9-recall-facts"),
    skill("8.1-identify-perfect", "Tell if a number is a perfect square or a perfect cube", "8.1-squares-cubes", "6.4-factors"),
  ] },
  { code: "8.2", grade: 8, strand: "N", text: "square and cube roots", skills: [
    skill("8.2-square-root", "Find the square root of a perfect square", "8.1-identify-perfect"),
    skill("8.2-estimate-root", "Estimate a square root between two whole numbers", "8.2-square-root"),
    skill("8.2-cube-root", "Find the cube root of a perfect cube", "8.1-squares-cubes"),
  ] },
  { code: "8.3", grade: 8, strand: "F", text: "percents less than 1 and greater than 100 (decimal and fractional percents)", skills: [
    skill("8.3-percent-over-100", "Find a percent greater than 100 of a quantity", "6.7-percent-of"),
    skill("8.3-percent-under-1", "Find a percent less than 1 of a quantity", "6.7-percent-of", "7.3-multiply-decimals"),
  ] },
  { code: "8.4", grade: 8, strand: "F", text: "numerical proportional reasoning (rates, ratio, proportions, and percent)", skills: [
    skill("8.4-rates", "Find and use a unit rate", "6.8-divide-decimal"),
    skill("8.4-ratio-share", "Share a quantity in a ratio of two or three terms", "6.6-equivalent-ratios"),
  ] },
  { code: "8.5", grade: 8, strand: "O", text: "operations with fractions (addition, subtraction, multiplication, division, and order of operations)", skills: [
    skill("8.5-add-subtract-fractions", "Add and subtract fractions and mixed numbers with unlike denominators", "5.3-equivalent-fractions", "6.4-lcm", "6.5-mixed-to-improper"),
    skill("8.5-multiply-fractions", "Multiply fractions", "7.4-lowest-terms"),
    skill("8.5-divide-fractions", "Divide fractions", "8.5-multiply-fractions"),
    skill("8.5-fraction-order-of-operations", "Use the order of operations with fractions", "8.5-add-subtract-fractions", "8.5-divide-fractions", "6.3-order-of-operations"),
  ] },
  { code: "8.6", grade: 8, strand: "A", text: "discrete linear relations (extended to larger numbers, limited to integers)", skills: [
    skill("8.6-evaluate-relation", "Find the value of a linear relation with integers", "7.5-evaluate-relation"),
    skill("8.6-table-to-relation", "Find a linear relation from a table of integer values", "7.5-table-to-relation"),
    skill("8.6-solve-for-input", "Find the input of a relation from its output", "8.6-evaluate-relation", "8.8-solve-two-step-integers"),
  ] },
  { code: "8.7", grade: 8, strand: "A", text: "expressions - writing and evaluating using substitution", skills: [
    skill("8.7-evaluate", "Find the value of an expression with integers by substitution", "7.5-evaluate-relation", "7.2-integer-order-of-operations"),
    skill("8.7-combine-terms", "Combine like terms before evaluating, for example 8n - 3n + 6", "8.7-evaluate", "6.10-combine-like-terms"),
  ] },
  { code: "8.8", grade: 8, strand: "A", text: "two-step equations with integer coefficients, constants, and solutions", skills: [
    skill("8.8-solve-two-step-integers", "Solve a two-step equation with integer coefficients, constants and solutions", "7.6-solve-two-step", "7.2-multiply-divide-integers"),
  ] },
  { code: "8.9", grade: 8, strand: "MG", text: "surface area and volume of regular solids, including triangular and other right prisms and cylinders", skills: [
    skill("8.9-surface-area", "Find the surface area of a prism from the areas of its faces", "6.12-triangle-area", "5.12-area-rectangle"),
    skill("8.9-volume-prisms", "Find the volume of a right prism or a cylinder", "7.8-prism-volume", "7.8-cylinder-volume"),
  ] },
  { code: "8.10", grade: 8, strand: "MG", text: "Pythagorean theorem", skills: [
    skill("8.10-hypotenuse", "Find the longest side of a right triangle with the Pythagorean theorem", "8.1-squares-cubes", "8.2-square-root"),
    skill("8.10-leg", "Find a missing shorter side of a right triangle", "8.10-hypotenuse"),
  ] },
  { code: "8.11", grade: 8, strand: "MG", text: "construction, views, and nets of 3D objects", skills: [
    skill("8.11-views", "Draw and read the top, front and side views of a 3D object", "5.15-count-parts"),
    skill("8.11-nets", "Match a net to its 3D object, and build objects from nets", "3.11-nets", "5.15-classify-prisms-pyramids"),
  ] },
  { code: "8.12", grade: 8, strand: "DP", text: "central tendency", skills: [
    skill("8.12-mean", "Find the mean of a set of data", "6.8-divide-decimal"),
    skill("8.12-median", "Find the median of a set of data with an odd or an even number of values"),
    skill("8.12-mode", "Find the mode of a set of data"),
  ] },
  { code: "8.13", grade: 8, strand: "DP", text: "theoretical probability with two independent events", skills: [
    skill("8.13-sample-space", "List the sample space of two independent events with a tree diagram or a table", "7.12-two-events-outcomes"),
    skill("8.13-theoretical-two-events", "Find the theoretical probability of two independent events", "8.13-sample-space", "8.5-multiply-fractions"),
  ] },
  { code: "8.14", grade: 8, strand: "F", text: "financial literacy - best buys", skills: [
    skill("8.14-unit-price", "Find a unit price and choose the best buy", "8.4-rates"),
    skill("8.14-coupons", "Compare offers with coupons and percent discounts", "7.13-sale-price"),
  ] },
];
