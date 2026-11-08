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
