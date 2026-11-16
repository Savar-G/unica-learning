import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP } from "@/lib/assessment";
import { SKILL_NAME_FIT, capitalName, fitsInSentence, plainSkillName } from "@/lib/skill-name";

// The parent-facing skill name (#990), through its public interface, on the real BC skill map's texts.
const text = (code: string) => BC_SKILL_MAP.standards.find((s) => s.code === code)!.text;

describe("the plain skill name", () => {
  it("drops a parenthetical aside", () => {
    expect(plainSkillName(text("1.3"))).toBe("addition and subtraction to 20");
    expect(plainSkillName(text("K7"))).toBe("direct comparative measurement");
    expect(plainSkillName(text("3.9"))).toBe("measurement, using standard units");
    expect(plainSkillName(text("6.1"))).toBe("small to large numbers");
  });
  it("drops the financial literacy prefix", () => {
    expect(plainSkillName(text("1.11"))).toBe("values of coins, and monetary exchanges");
    expect(plainSkillName(text("7.13"))).toBe("financial percentage");
    expect(plainSkillName(text("8.14"))).toBe("best buys");
  });
  it("leaves a text with neither as it is", () => {
    expect(plainSkillName(text("K1"))).toBe("number concepts to 10");
    expect(plainSkillName("  spaced   out ")).toBe("spaced out");
  });
  it("keeps a long text long: the sentences say a count instead", () => {
    const long = plainSkillName(text("4.18"));
    expect(long).toBe("monetary calculations, including making change with amounts to 100 dollars and making simple financial decisions");
    expect(fitsInSentence(long)).toBe(false);
    const asides = plainSkillName(text("9.1"));
    expect(asides).toBe("operations with rational numbers");
    expect(fitsInSentence(asides)).toBe(true);
  });
  it("leaves no aside or prefix in any real name, and no name empty", () => {
    for (const s of BC_SKILL_MAP.standards) {
      const name = plainSkillName(s.text);
      expect(name, s.code).not.toBe("");
      expect(name, s.code).not.toMatch(/[()]|^financial literacy/);
      expect(name, s.code).toBe(name.trim());
    }
  });
  it("fits a sentence up to the limit, and not an empty name", () => {
    expect(SKILL_NAME_FIT).toBe(45);
    expect(fitsInSentence("x".repeat(45))).toBe(true);
    expect(fitsInSentence("x".repeat(46))).toBe(false);
    expect(fitsInSentence("")).toBe(false);
  });
  it("capitalises a list row", () => {
    expect(capitalName("best buys")).toBe("Best buys");
  });
});
