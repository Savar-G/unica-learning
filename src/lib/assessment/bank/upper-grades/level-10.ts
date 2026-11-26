import { placementFamily } from "./kit";

export const LEVEL_10 = [
  placementFamily(10, "10.1", "expand", "A", "Expand a product of two binomials", [
    ["v2-10-expand-1", "Expand (2x − 3)(x + 4).", "2x² + 5x − 12", ["2x² + 5x + 12", "2x² + 11x − 12", "2x² + 5x − 12", "2x² − 5x − 12"]],
    ["v2-10-expand-2", "Expand (3x − 2)(x + 5).", "3x² + 13x − 10", ["3x² + 13x + 10", "3x² + 17x − 10", "3x² − 13x − 10", "3x² + 13x − 10"]],
    ["v2-10-expand-3", "Expand (4x − 3)(x + 2).", "4x² + 5x − 6", ["4x² + 5x − 6", "4x² + 5x + 6", "4x² + 11x − 6", "4x² − 5x − 6"]],
    ["v2-10-expand-4", "Expand (5x − 4)(x + 3).", "5x² + 11x − 12", ["5x² + 11x + 12", "5x² + 11x − 12", "5x² + 19x − 12", "5x² − 11x − 12"]],
  ]),
  placementFamily(10, "10.2", "factor", "A", "Factor a monic quadratic trinomial", [
    ["v2-10-factor-1", "Factor x² − 7x + 12.", "(x − 3)(x − 4)", ["(x + 3)(x + 4)", "(x − 3)(x + 4)", "(x − 3)(x − 4)", "(x + 3)(x − 4)"]],
    ["v2-10-factor-2", "Factor x² − 7x + 10.", "(x − 2)(x − 5)", ["(x + 2)(x + 5)", "(x − 2)(x + 5)", "(x + 2)(x − 5)", "(x − 2)(x − 5)"]],
    ["v2-10-factor-3", "Factor x² − 10x + 24.", "(x − 4)(x − 6)", ["(x − 4)(x − 6)", "(x + 4)(x + 6)", "(x − 4)(x + 6)", "(x + 4)(x − 6)"]],
    ["v2-10-factor-4", "Factor x² − 9x + 14.", "(x − 2)(x − 7)", ["(x + 2)(x + 7)", "(x − 2)(x − 7)", "(x − 2)(x + 7)", "(x + 2)(x − 7)"]],
  ]),
  placementFamily(10, "10.3", "linear-system", "A", "Solve a system of linear equations", [
    ["v2-10-linear-system-1", "Given 3x + 2y = 16 and x − y = 2, what is y?", "2"],
    ["v2-10-linear-system-2", "Given 2x + 5y = 29 and x − y = 4, what is y?", "3"],
    ["v2-10-linear-system-3", "Given 4x + 3y = 47 and x − y = 3, what is y?", "5"],
    ["v2-10-linear-system-4", "Given 5x + 4y = 69 and x − y = 3, what is y?", "6"],
  ]),
  placementFamily(10, "10.4", "sine-ratio", "MG", "Find the sine ratio in a right triangle", [
    ["v2-10-sine-ratio-1", "In a right triangle, the side opposite θ is 9 cm and the hypotenuse is 15 cm. What is sin θ?", "3/5", ["4/5", "3/4", "3/5", "5/3"]],
    ["v2-10-sine-ratio-2", "In a right triangle, the side opposite θ is 5 cm and the hypotenuse is 13 cm. What is sin θ?", "5/13", ["12/13", "5/12", "13/5", "5/13"]],
    ["v2-10-sine-ratio-3", "In a right triangle, the side opposite θ is 15 cm and the hypotenuse is 17 cm. What is sin θ?", "15/17", ["15/17", "8/17", "15/8", "17/15"]],
    ["v2-10-sine-ratio-4", "In a right triangle, the side opposite θ is 7 cm and the hypotenuse is 25 cm. What is sin θ?", "7/25", ["24/25", "7/25", "7/24", "25/7"]],
  ]),
  placementFamily(10, "10.5", "radical-coefficient", "N", "Simplify a square root", [
    ["v2-10-radical-coefficient-1", "Write √18 in the form a√2. What is a?", "3"],
    ["v2-10-radical-coefficient-2", "Write √75 in the form a√3. What is a?", "5"],
    ["v2-10-radical-coefficient-3", "Write √80 in the form a√5. What is a?", "4"],
    ["v2-10-radical-coefficient-4", "Write √98 in the form a√2. What is a?", "7"],
  ]),
  placementFamily(10, "10.6", "rational-substitution", "F", "Evaluate a rational expression by substitution", [
    ["v2-10-rational-substitution-1", "What is the value of (x² − 9) / (x − 3) when x = 5?", "8"],
    ["v2-10-rational-substitution-2", "What is the value of (x² − 16) / (x − 4) when x = 9?", "13"],
    ["v2-10-rational-substitution-3", "What is the value of (x² − 25) / (x − 5) when x = 8?", "13"],
    ["v2-10-rational-substitution-4", "What is the value of (x² − 36) / (x − 6) when x = 11?", "17"],
  ]),
];
