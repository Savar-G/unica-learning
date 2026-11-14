import { describe, expect, it } from "vitest";
import { hardFeeling } from "./phrases";

describe("hard feelings", () => {
  it.each(["I'm not happy.", "I'm not good.", "I don't feel good.", "I'm not okay.", "I feel down.", "Nobody likes me.", "I have no friends.", "I'm lonely."])("reads %s as hard", (text) => {
    expect(hardFeeling(text)).toBe(true);
  });
  it("reads a resolved worry as resolved", () => {
    expect(hardFeeling("I am not worried anymore!")).toBe(false);
  });
  it("keeps a separate hard feeling after a resolved worry", () => {
    expect(hardFeeling("I am not worried anymore, but I am sad.")).toBe(true);
  });
});

it.each(["I am not very happy.", "I am not feeling good.", "I do not feel so good.", "I feel really down.", "No one likes me.", "I don’t feel good."])("recognizes a hard feeling: %s", (text) => {
  expect(hardFeeling(text)).toBe(true);
});

it.each(["I feel really bad.", "I am not at all happy.", "I feel bad.", "I feel so bad.", "I am feeling bad.", "I am not even happy.", "I am not really good."])("reads negative feeling %s", (text) => {
  expect(hardFeeling(text)).toBe(true);
});
it.each(["I'm not sad anymore!", "I won!"])("keeps positive or resolved feeling %s", (text) => {
  expect(hardFeeling(text)).toBe(false);
});
