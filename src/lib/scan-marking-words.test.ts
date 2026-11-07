import { describe, expect, it } from "vitest";
import { checkWordsReading, MISSPELLED_NUMBER_NAME, numberFromWords } from "@/lib/scan-marking-words";

describe("write-words: number names in code (#715)", () => {
  it.each([
    ["forty-two", 42], ["Forty Two", 42], ["FORTY-TWO", 42], ["fortytwo", 42], ["  forty   two ", 42],
    ["three hundred forty-two", 342], ["three hundred and forty-two", 342], ["Three Hundred And Forty Two.", 342],
    ["a hundred and six", 106], ["one thousand two hundred five", 1205], ["one hundred thousand", 100_000],
    ["seven", 7], ["zero", 0], ["nineteen", 19], ["sixty", 60], ["two million three", 2_000_003],
  ])("reads %j as %d", (text, value) => {
    expect(numberFromWords(text)).toEqual({ value, misspelled: false });
  });
  it.each(["", "and", "five four", "twelve hundred", "forty sixty", "hundred", "thousand thousand", "two thousand million",
    "42", "3 hundred", "forty-two written another way", "a forty", "zero five", "minus five"])("does not read %j as a number name", (text) => {
    expect(numberFromWords(text)).toBeNull();
  });
  it("fixes a clear misspelling of a number word only when asked, and says so", () => {
    expect(numberFromWords("fourty two")).toBeNull();
    expect(numberFromWords("fourty two", true)).toEqual({ value: 42, misspelled: true });
    expect(numberFromWords("thre hundred fivty", true)).toEqual({ value: 350, misspelled: true });
    expect(numberFromWords("sevnteen", true)).toEqual({ value: 17, misspelled: true });
    // Too far from any number word, or as close to two of them: not a number name.
    expect(numberFromWords("xyzzy", true)).toBeNull();
    expect(numberFromWords("on", true)).toBeNull();
  });

  it.each([
    ["forty-two", "forty two"], ["forty-two", "Forty-Two"], ["three hundred forty-two", "three hundred and forty two"],
    ["three hundred and forty-two", "THREE HUNDRED FORTY-TWO"], ["one hundred six", "a hundred and six"],
  ])("key %j and an ordinary form %j are right", (key, reading) => {
    expect(checkWordsReading(reading, key)).toBe("right");
  });
  it.each([["forty-two", "forty-three"], ["forty-two", "twenty-four"], ["three hundred forty-two", "three hundred twenty-four"], ["sixty", "sixteen"]])(
    "key %j and a different number %j are wrong", (key, reading) => {
      expect(checkWordsReading(reading, key)).toBe("wrong");
    });
  it("a misspelling that still names the key follows the one switch, which is right until Savar answers", () => {
    expect(MISSPELLED_NUMBER_NAME).toBe("right");
    expect(checkWordsReading("fourty two", "forty-two")).toBe(MISSPELLED_NUMBER_NAME);
    expect(checkWordsReading("three hundred fourty-too", "three hundred forty-two")).toBe(MISSPELLED_NUMBER_NAME);
  });
  it.each([["forty-two", "fourty three"], ["forty-two", "42"], ["forty-two", "forty-two written another way"], ["forty-two", "for tea two?"]])(
    "key %j and an unclear reading %j are unsure (our team checks it)", (key, reading) => {
      expect(checkWordsReading(reading, key)).toBeNull();
    });
  it("a word key needs the same words; its opposite is wrong and anything else is unsure", () => {
    expect(checkWordsReading("  Even ", "even")).toBe("right");
    expect(checkWordsReading("odd", "even")).toBe("wrong");
    expect(checkWordsReading("False", "true")).toBe("wrong");
    expect(checkWordsReading("subtraction", "addition")).toBeNull();
    expect(checkWordsReading("evn", "even")).toBeNull();
  });
});
