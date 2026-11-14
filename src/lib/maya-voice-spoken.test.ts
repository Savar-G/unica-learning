import { describe, expect, it } from "vitest";
import { speechWords } from "@/lib/board-speech";
import { spokenMath, spokenStream, spokenWords } from "@/lib/maya-voice-spoken";

const CASES: [string, string][] = [
  // Signs between numbers, with or without spaces.
  ["We're doing 52 − 28 today.", "We're doing 52 minus 28 today."],
  ["52−28", "52 minus 28"],
  ["52 - 28", "52 minus 28"],
  ["52 – 28", "52 minus 28"],
  ["52 −28", "52 minus 28"],
  ["3 + 4 = 7", "3 plus 4 equals 7"],
  ["3+4=7", "3 plus 4 equals 7"],
  ["3 × 4", "3 times 4"],
  ["3×4", "3 times 4"],
  ["3 * 4", "3 times 4"],
  ["3 x 4", "3 times 4"],
  ["3x4", "3 times 4"],
  ["12 ÷ 4", "12 divided by 4"],
  ["12 / 4", "12 divided by 4"],
  ["52 − 28 = 24.", "52 minus 28 equals 24."],
  ["52 − 28 = ?", "52 minus 28 equals what?"],
  ["52 − 28 =?", "52 minus 28 equals what?"],
  ["? + 5 = 8", "what plus 5 equals 8"],
  ["__ + 5 = 8", "blank plus 5 equals 8"],
  ["52 − __ = 24", "52 minus blank equals 24"],
  ["Fill in the __.", "Fill in the blank."],
  ["(3 + 4) × 2", "(3 plus 4) times 2"],
  // Negative numbers.
  ["−5", "negative 5"],
  ["It is -5 outside.", "It is negative 5 outside."],
  ["x = −5", "x equals negative 5"],
  ["3 - -5", "3 minus negative 5"],
  ["(−5)", "(negative 5)"],
  // Fractions.
  ["3/4", "three quarters"],
  ["1/2", "one half"],
  ["2/3", "two thirds"],
  ["5/8", "five eighths"],
  ["1/4", "one quarter"],
  ["3/2", "three halves"],
  ["7/20", "7 over 20"],
  ["5/1", "5 over 1"],
  ["2 1/2", "two and one half"],
  ["Add 2 3/4 cups.", "Add two and three quarters cups."],
  ["½", "one half"],
  ["¼ and ¾", "one quarter and three quarters"],
  ["⅓ or ⅔", "one third or two thirds"],
  ["2½", "two and one half"],
  ["2 ½", "two and one half"],
  ["1/2 - 1/4", "one half minus one quarter"],
  ["Is 3/4 bigger?", "Is three quarters bigger?"],
  // Comparison.
  ["3 < 5", "3 less than 5"],
  ["5 > 3", "5 greater than 3"],
  ["3<5", "3 less than 5"],
  ["x ≤ 5", "x less than or equal to 5"],
  ["x ≥ 5", "x greater than or equal to 5"],
  ["4 ≠ 5", "4 is not equal to 5"],
  // Decimals and thousands stay.
  ["2.5", "2.5"],
  ["0.5", "0.5"],
  ["1,081", "1,081"],
  ["It costs 2.5 times more.", "It costs 2.5 times more."],
  // Percent and exponents.
  ["25%", "25 percent"],
  ["25% off.", "25 percent off."],
  ["3²", "3 squared"],
  ["2³", "2 cubed"],
  ["10⁴", "10 to the power of 4"],
  ["3^2", "3 squared"],
  ["x² + 1", "x squared plus 1"],
  ["cm²", "square centimetres"],
  ["12 m²", "12 square metres"],
  ["5cm²", "5 square centimetres"],
  ["90°", "90 degrees"],
  ["20°C", "20 degrees Celsius"],
  // Units after a number.
  ["5 cm", "5 centimetres"],
  ["1 cm", "1 centimetre"],
  ["5cm", "5 centimetres"],
  ["It is 3 mm long.", "It is 3 millimetres long."],
  ["2 m", "2 metres"],
  ["4 km", "4 kilometres"],
  ["250 g", "250 grams"],
  ["1 kg", "1 kilogram"],
  ["500 mL", "500 millilitres"],
  ["500 ml", "500 millilitres"],
  ["2 L", "2 litres"],
  ["3 m, 4 m.", "3 metres, 4 metres."],
  ["5 cm + 3 cm", "5 centimetres plus 3 centimetres"],
  ["5 cm - 3 cm", "5 centimetres minus 3 centimetres"],
  // Money.
  ["$5", "5 dollars"],
  ["$1", "1 dollar"],
  ["$3.25", "3 dollars and 25 cents"],
  ["$0.50", "50 cents"],
  ["$0.01", "1 cent"],
  ["$5.00", "5 dollars"],
  ["$1,081", "1,081 dollars"],
  ["It costs $5.", "It costs 5 dollars."],
  ["25¢", "25 cents"],
  ["1¢", "1 cent"],
  ["$5 - $3", "5 dollars minus 3 dollars"],
  ["-$5", "negative 5 dollars"],
  // Times of day.
  ["3:30", "three thirty"],
  ["3:05", "three oh five"],
  ["3:00", "three o'clock"],
  ["12:45", "twelve forty five"],
  ["At 3:30 p.m. we stop.", "At three thirty p.m. we stop."],
  ["3:00 p.m.", "three p.m."],
  ["3:30pm", "three thirty p.m."],
  ["3 pm", "3 p.m."],
  ["7 AM,", "7 a.m.,"],
  ["3pm", "3 p.m."],
  // Ratio (one minute digit) and the time rule that wins.
  ["2:3", "2 to 3"],
  ["2 : 3", "2 to 3"],
  ["2:30", "two thirty"],
  // Remainder.
  ["26 R 1", "26 remainder 1"],
  ["26R1", "26 remainder 1"],
  ["√9", "the square root of 9"],
];

const UNCHANGED = [
  "twenty-seven",
  "That is well-known.",
  "Wait - no, look again.",
  "Wait – no.",
  "Pick one and/or the other.",
  "It's 2026-11-12 today.",
  "Due 11/12/2026.",
  "Call 604-555-1234.",
  "I'm here. I'm ready.",
  "Let's go, I'm sure.",
  "Max and Rex fix boxes.",
  "x is the number we want.",
  "The m is silent.",
  "Look at the R.",
  "Great job!",
  "A 5-year-old can do it.",
  "Do it 1-to-1.",
  "Is that right? Yes.",
  "",
  "   ",
  "Write 27.",
];

describe("spokenMath", () => {
  it.each(CASES)("%s", (input, spoken) => {
    expect(spokenMath(input)).toBe(spoken);
  });

  it.each(UNCHANGED)("leaves ordinary text alone: %j", (text) => {
    expect(spokenMath(text)).toBe(text);
  });

  it("is idempotent", () => {
    for (const [input] of CASES) expect(spokenMath(spokenMath(input))).toBe(spokenMath(input));
    for (const text of UNCHANGED) expect(spokenMath(spokenMath(text))).toBe(spokenMath(text));
  });

  it("keeps the spaces between words", () => {
    expect(spokenMath("  52 − 28\n= 24  ")).toBe("  52 minus 28\nequals 24  ");
  });

  it("never throws", () => {
    const odd = ["−", "-", "=", "?", "$", "$.", "¢", "/", "1/", "/2", ":", "1:", "0/0", "99999999999999999999/3", "½½", "$$5",
      "3:99", "25:00", "\u0000", "𝟓 − 𝟐", "−−5", "5−", "x x x", "R R", "__ __", "²", "^", "5^", "°"];
    for (const text of odd) {
      expect(() => spokenMath(text)).not.toThrow();
      expect(spokenMath(spokenMath(text))).toBe(spokenMath(text));
    }
    expect(spokenMath(undefined as unknown as string)).toBe(undefined);
  });
});

describe("spokenWords", () => {
  it("gives one spoken entry per word, as board-speech counts words", () => {
    for (const [input] of CASES) {
      const said = spokenWords(input);
      expect(said).toHaveLength(speechWords(input).length);
      expect(said.every((w) => w.trim().length > 0)).toBe(true);
      expect(said.join(" ")).toBe(spokenMath(input).trim().split(/\s+/).filter(Boolean).join(" "));
    }
  });

  it("keeps each spoken part at the word it came from", () => {
    expect(spokenWords("We're doing 52 − 28 = 24 today.")).toEqual(["We're", "doing", "52", "minus", "28", "equals", "24", "today."]);
    expect(spokenWords("Take 2 1/2 of 3/4.")).toEqual(["Take", "two", "and one half", "of", "three quarters."]);
    expect(spokenWords("It costs $3.25 now.")).toEqual(["It", "costs", "3 dollars and 25 cents", "now."]);
  });
});

describe("spokenStream", () => {
  it("says streamed text exactly as the whole text, wherever the chunks break", () => {
    const texts = [
      ...CASES.map(([input]) => input),
      "First 52 − 28 = ? Then 3/4 of $5. ? − 28 = 24. At 3:00 p.m. we stop! Add 2 1/2 cm.",
      "Is 5 cm. 3 m too long? __ + 5 = 8.",
    ];
    for (const text of texts) {
      for (let cut = 0; cut <= text.length; cut++) {
        const stream = spokenStream();
        const out = stream.push(text.slice(0, cut)) + stream.push(text.slice(cut)) + stream.end();
        expect(out, `${JSON.stringify(text)} cut at ${cut}`).toBe(spokenMath(text));
      }
    }
  });

  it("gives a finished sentence before the text ends", () => {
    const stream = spokenStream();
    expect(stream.push("We do 52 − 28. Then")).toBe("We do 52 minus 28. ");
    expect(stream.end()).toBe("Then");
  });
});
