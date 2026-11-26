import { sup } from "../grades-6-7/helpers";
import { placementFamily } from "./kit";

export const LEVEL_11 = [
  placementFamily(11, "11.1", "quadratic-maximum", "A", "Find the maximum of a quadratic in vertex form", [
    ["v2-11-quadratic-maximum-1", "What is the maximum value of f(x) = −2(x − 4)² + 9?", "9"],
    ["v2-11-quadratic-maximum-2", "What is the maximum value of f(x) = −3(x − 2)² + 7?", "7"],
    ["v2-11-quadratic-maximum-3", "What is the maximum value of f(x) = −2(x − 5)² + 12?", "12"],
    ["v2-11-quadratic-maximum-4", "What is the maximum value of f(x) = −4(x − 3)² + 11?", "11"],
  ]),
  placementFamily(11, "11.2", "rational-domain", "F", "Find an excluded value of a rational expression", [
    ["v2-11-rational-domain-1", "Which value of x makes (x² − 9) ÷ (x − 3) undefined?", "3"],
    ["v2-11-rational-domain-2", "Which value of x makes (x² − 16) ÷ (x − 4) undefined?", "4"],
    ["v2-11-rational-domain-3", "Which value of x makes (x² − 25) ÷ (x − 5) undefined?", "5"],
    ["v2-11-rational-domain-4", "Which value of x makes (x² − 36) ÷ (x − 6) undefined?", "6"],
  ]),
  placementFamily(11, "11.3", "radical-equation", "A", "Solve a radical equation", [
    ["v2-11-radical-equation-1", "Solve √(x + 5) = x − 1.", "4"],
    ["v2-11-radical-equation-2", "Solve √(x + 11) = x − 1.", "5"],
    ["v2-11-radical-equation-3", "Solve √(x + 4) = x − 2.", "5"],
    ["v2-11-radical-equation-4", "Solve √(x + 9) = x − 3.", "7"],
  ]),
  placementFamily(11, "11.4", "rational-power", "N", "Evaluate a rational power", [
    ["v2-11-rational-power-1", `Evaluate 81${sup(3)}ᐟ${sup(4)}.`, "27"],
    ["v2-11-rational-power-2", `Evaluate 32${sup(3)}ᐟ${sup(5)}.`, "8"],
    ["v2-11-rational-power-3", `Evaluate 125${sup(2)}ᐟ${sup(3)}.`, "25"],
    ["v2-11-rational-power-4", `Evaluate 256${sup(3)}ᐟ${sup(4)}.`, "64"],
  ]),
  placementFamily(11, "11.5", "arithmetic-sequence", "A", "Find a term of an arithmetic sequence", [
    ["v2-11-arithmetic-sequence-1", "An arithmetic sequence starts at 3 and increases by 4 each term. What is its 8th term?", "31"],
    ["v2-11-arithmetic-sequence-2", "An arithmetic sequence starts at 7 and increases by 5 each term. What is its 9th term?", "47"],
    ["v2-11-arithmetic-sequence-3", "An arithmetic sequence starts at 6 and increases by 7 each term. What is its 10th term?", "69"],
    ["v2-11-arithmetic-sequence-4", "An arithmetic sequence starts at 11 and increases by 3 each term. What is its 12th term?", "44"],
  ]),
  placementFamily(11, "11.6", "trig-period", "MG", "Find the period of a sine function", [
    ["v2-11-trig-period-1", "What is the period in degrees of y = sin(2x) when x is measured in degrees?", "180"],
    ["v2-11-trig-period-2", "What is the period in degrees of y = sin(3x) when x is measured in degrees?", "120"],
    ["v2-11-trig-period-3", "What is the period in degrees of y = sin(4x) when x is measured in degrees?", "90"],
    ["v2-11-trig-period-4", "What is the period in degrees of y = sin(6x) when x is measured in degrees?", "60"],
  ]),
];
