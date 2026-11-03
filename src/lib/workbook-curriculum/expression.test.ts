import { describe, expect, it } from "vitest";
import { evaluateExpression, formatFixed, formatValue } from "./expression";
const result = (expression: string) => formatValue(evaluateExpression(expression));
describe("bounded expression language", () => {
  it.each([
    ["9007199254740993 + 1", "9007199254740994"],
    ["Fraction(1, 3) + Fraction(1, 6)", "1/2"],
    ["Fraction(1, 3) / 2", "1/6"],
    ["Fraction(1, 3) + 0.5", "5/6"],
    ["Fraction(2, -4)", "-1/2"],
    ["2 / 1", "2.0"], ["str(-0.0)", "-0.0"], ["str(1e-6)", "0.000001"], ["1.0 // 0.1", "10.0"], ["(1 / 1) // (1 / 10)", "9.0"], ["-7 // 3", "-3"], ["7 // -3", "-3"],
    ["-7 % 3", "2"], ["7 % -3", "-2"], ["-7 / 2", "-3.5"],
    ["Fraction(-7, 2) // 2", "-2"], ["Fraction(-7, 2) % 2", "1/2"],
    ["-2 ** 2", "-4"], ["2 ** 3 ** 2", "512"], ["2 ** -2", "0.25"],
    ["Fraction(2, 3) ** -2", "9/4"], ["1 < 2 < 3", "True"], ["1 < 3 < 2", "False"],
    ["not 2 == 3 and 4 >= 4 or False", "True"],
    ["'yes' if True else 1 / 0", "yes"], ["False and 1 / 0", "False"], ["True or missing", "True"],
    ["'a' + str(2)", "a2"], ["gcd(12, 18, 30)", "6"], ["lcm(4, 6)", "12"],
    ["floor(Fraction(-7, 2))", "-4"], ["ceil(Fraction(-7, 2))", "-3"],
    ["round(2.5)", "2"], ["round(3.5)", "4"], ["round(-2.5)", "-2"],
    ["round(2.675, 2)", "2.68"], ["round(2675 / 1000, 2)", "2.67"], ["round(12345, -2)", "12300"],
    ["abs(Fraction(-3, 4))", "3/4"], ["min(7, 3, 4)", "3"], ["max([7, 3, 4])", "7"],
    ["sqrt(9)", "3.0"], ["isqrt(999999999999999999999999)", "999999999999"],
    ["int(-3.9)", "-3"], ["int('12')", "12"], ["len('hello')", "5"],
    ["sum([1, 2, 3])", "6"], ["sorted([3, 1, 2], reverse=True)", "[3, 2, 1]"],
    ["sorted((3, 1, 2))[1]", "2"], ["[1, 2, 3][-1]", "3"],
  ])("evaluates %s", (expression, expected) => expect(result(expression)).toBe(expected));
  it("formats decimals with Python ties to even", () => {
    expect(formatFixed(evaluateExpression("2.675"), 2)).toBe("2.68");
    expect(formatFixed(evaluateExpression("Fraction(1, 8)"), 2)).toBe("0.12");
    expect(formatFixed(evaluateExpression("-0.001"), 2)).toBe("-0.00");
    expect(formatFixed(evaluateExpression("3"), 2)).toBe("3.00");
  });
  it.each(["globalThis", "process", "constructor", "__proto__", "Math.random()", "a.b", "a.constructor", "eval('1')", "new Function('')", "import('x')", "a = 1", "1; 2", "1 & 2", "{1: 2}", "[1:2]", "sum(int(c) for c in '123')", "'a'.upper()", "__import__('os')"])("rejects %s", expression => {
    expect(() => evaluateExpression(expression)).toThrow();
  });
  it.each(["1 / 0", "Fraction(1, 0)", "sqrt(-1)", "min([])", "isqrt(-1)", "gcd(1.5, 2)", "2 ** 999999999", "2 ** (2 ** 32)", "'x' * 3", "sorted([1], reverse=1)", "[1][2]", "round(1, 1000)", "1e999"])("bounds or rejects %s", expression => expect(() => evaluateExpression(expression)).toThrow());
  it.each([
    ["'0' not in str(123)", "True"], ["'0' in str(120)", "True"],
    ["not '0' in str(120)", "False"], ["not '0' not in str(120)", "True"],
    ["2 not in [1, 3] and 3 in (2, 3)", "True"], ["1 < 2 in [2, 3]", "True"],
    ["'yes' if '0' not in str(123) else 'no'", "yes"], ["1 in (1,)", "True"],
    ["len({1, 1, 2, True, Fraction(2, 2)})", "2"], ["len({0.1 + 0.2, 0.3})", "1"],
    ["{1, 2} == {2, 1}", "True"], ["not {1} == {1, 2}", "True"],
    ["2 in {1, 2, 3}", "True"], ["len(())", "0"], ["str((1,))", "(1,)"],
    ["(1, 2) == [1, 2]", "False"], ["len({(1, 2), (1, 2), (2, 1)})", "2"],
    ["sorted({3, 1, 1, 2})", "[1, 2, 3]"], ["sum({1, 2, 2})", "3"],
    ["0.1 + 0.2 == 0.3", "True"], ["0.3 - 0.1 == 0.2", "True"],
    ["0.1 * 3 == 0.3", "True"], ["0.1 + 0.2 == 3 / 10", "True"],
    ["0.3 % 0.1 == 0", "True"], ["0.1 ** 2 == 0.01", "True"],
    ["-0.3 // 0.2", "-2.0"], ["0.1 + 0.2", "0.3"], ["0.1 / 0.2", "0.5"],
  ])("supports collections and exact decimals: %s", (expression, expected) => expect(result(expression)).toBe(expected));
  it.each(["1 in '123'", "1 in 3", "{[1, 2]}", "{(1, [2])}", "{1}[0]", "{}", "{1:2}", "[x for x in [1]]", "(x for x in [1])"])("rejects invalid collection syntax or use: %s", expression => expect(() => evaluateExpression(expression)).toThrow());
  it("bounds parse and evaluation depth", () => {
    expect(() => evaluateExpression("(".repeat(100) + "1" + ")".repeat(100))).toThrow(/limit/);
    expect(() => evaluateExpression(Array(500).fill("1").join("+"))).toThrow(/limit/);
  });
});
