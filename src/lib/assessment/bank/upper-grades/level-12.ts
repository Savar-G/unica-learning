import { placementFamily } from "./kit";

export const LEVEL_12 = [
  placementFamily(12, "12.1", "function-transform", "A", "Evaluate a transformed function", [
    ["v2-12-function-transform-1", "f(4) = 5 and h(x) = −2f(x − 3) + 1. What is h(7)?", "-9"],
    ["v2-12-function-transform-2", "f(3) = 7 and h(x) = −3f(x − 2) + 4. What is h(5)?", "-17"],
    ["v2-12-function-transform-3", "f(5) = 4 and h(x) = −3f(x − 4) + 2. What is h(9)?", "-10"],
    ["v2-12-function-transform-4", "f(6) = 8 and h(x) = −2f(x − 2) + 5. What is h(8)?", "-11"],
  ]),
  placementFamily(12, "12.2", "exponential-equation", "N", "Solve an exponential equation", [
    ["v2-12-exponential-equation-1", "Find t if 32 × (1/2)ᵗ = 4.", "3"],
    ["v2-12-exponential-equation-2", "Find t if 81 × (1/3)ᵗ = 9.", "2"],
    ["v2-12-exponential-equation-3", "Find t if 128 × (1/2)ᵗ = 8.", "4"],
    ["v2-12-exponential-equation-4", "Find t if 256 × (1/4)ᵗ = 4.", "3"],
  ]),
  placementFamily(12, "12.3", "logarithmic-equation", "A", "Solve a logarithmic equation", [
    ["v2-12-logarithmic-equation-1", "Find x if log₂(x − 1) = 3.", "9"],
    ["v2-12-logarithmic-equation-2", "Find x if log₃(x − 2) = 2.", "11"],
    ["v2-12-logarithmic-equation-3", "Find x if log₂(x − 4) = 4.", "20"],
    ["v2-12-logarithmic-equation-4", "Find x if log₅(x − 3) = 2.", "28"],
  ]),
  placementFamily(12, "12.4", "inverse-function", "A", "Evaluate an inverse function", [
    ["v2-12-inverse-function-1", "If f(x) = (x − 3)³ + 5, what is the value of the inverse of f at 13?", "5"],
    ["v2-12-inverse-function-2", "If f(x) = (x − 4)³ + 2, what is the value of the inverse of f at 29?", "7"],
    ["v2-12-inverse-function-3", "If f(x) = (x − 2)³ + 7, what is the value of the inverse of f at 71?", "6"],
    ["v2-12-inverse-function-4", "If f(x) = (x − 5)³ + 4, what is the value of the inverse of f at 12?", "7"],
  ]),
  placementFamily(12, "12.5", "log-product-and-quotient", "A", "Apply logarithm laws", [
    ["v2-12-log-product-and-quotient-1", "Suppose log base b of x is 4 and log base b of y is 3. What is log base b of (x² / y)?", "5"],
    ["v2-12-log-product-and-quotient-2", "Suppose log base b of x is 6 and log base b of y is 2. What is log base b of (x² / y)?", "10"],
    ["v2-12-log-product-and-quotient-3", "Suppose log base b of x is 5 and log base b of y is 4. What is log base b of (x² / y)?", "6"],
    ["v2-12-log-product-and-quotient-4", "Suppose log base b of x is 7 and log base b of y is 5. What is log base b of (x² / y)?", "9"],
  ]),
  placementFamily(12, "12.6", "exponential-model", "F", "Use an exponential decay model", [
    ["v2-12-exponential-model-1", "A sample starts at 500 grams and loses 40% of its mass each hour. How many grams remain after 2 hours?", "180"],
    ["v2-12-exponential-model-2", "A sample starts at 800 grams and loses 25% of its mass each hour. How many grams remain after 3 hours?", "337.5"],
    ["v2-12-exponential-model-3", "A sample starts at 625 grams and loses 20% of its mass each hour. How many grams remain after 3 hours?", "320"],
    ["v2-12-exponential-model-4", "A sample starts at 1000 grams and loses 30% of its mass each hour. How many grams remain after 3 hours?", "343"],
  ], "word-problem"),
];
