// Clock times read by code in a clock-time call (C3c): exact forms only.
import { describe, expect, it } from "vitest";
import { readAnswer, valuesIn } from "./numbers";

const time = (hours: number, minutes: number) => ({ type: "time", hours, minutes, period: null });
const T = { times: true };

describe("clock times in a clock-time call", () => {
  it.each([
    ["6:53", time(6, 53)],
    ["7:03", time(7, 3)],
    ["12:05", time(12, 5)],
    ["08:35", time(8, 35)],
    ["six fifty-three", time(6, 53)],
    ["six fifty three", time(6, 53)],
    ["seven oh three", time(7, 3)],
    ["nine forty", time(9, 40)],
    ["seven fifteen", time(7, 15)],
    ["Seven o'clock", time(7, 0)],
    ["seven oclock", time(7, 0)],
    ["twelve twenty", time(12, 20)],
  ])("reads %s as one time", (text, value) => {
    expect(valuesIn(text, T)).toEqual([value]);
  });

  it.each(["seven three", "half past six", "7.03", "703", "13:05", "6:75", "00:35", "seven sixty", "quarter to seven"])("never reads %s as a time", (text) => {
    expect(valuesIn(text, T).some((v) => v.type === "time")).toBe(false);
  });

  it("reads a committed answer as the time, and working as numbers", () => {
    expect(readAnswer("It's 7:03.", T)).toMatchObject({ final: time(7, 3), sure: true });
    expect(readAnswer("I got seven oh three.", T)).toMatchObject({ final: time(7, 3), sure: true });
    expect(valuesIn("47 minutes to 7:00, then 3 more is 7:03.", T)).toEqual([{ type: "number", value: 47 }, time(7, 0), { type: "number", value: 3 }, time(7, 3)]);
  });

  it("leaves every other call as it was", () => {
    expect(valuesIn("7:03")).toEqual([{ type: "number", value: 7 }, { type: "number", value: 3 }]);
    expect(valuesIn("seven oh three").some((v) => v.type === "time")).toBe(false);
  });
});
