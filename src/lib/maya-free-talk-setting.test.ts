import { describe, expect, it } from "vitest";
import { freeTalkFor } from "@/lib/maya-free-talk";

// The one free-talk setting for children's calls (D-197): MAYA_FREE_TALK, on unless "off". Admin test calls are always on.
describe("freeTalkFor", () => {
  it("is on for admin test calls whatever the setting", () => {
    expect(freeTalkFor("admin_test", {})).toBe(true);
    expect(freeTalkFor("admin_test", { MAYA_FREE_TALK: "off" })).toBe(true);
  });

  it.each([[undefined, true], ["on", true], ["", true], ["off", false], [" OFF ", false]])("is %j -> %j for a child's call", (value, on) => {
    expect(freeTalkFor("child", value === undefined ? {} : { MAYA_FREE_TALK: value })).toBe(on);
  });
});
