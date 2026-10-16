import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StartState } from "@/lib/assessment";
import { StartTest } from "@/components/account";

// The account page's button for a child's test (#225, spec #181), through the component's public interface.
const page = (state: StartState) =>
  renderToStaticMarkup(createElement(StartTest, { childId: "c1", name: "Asha", state })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&#x27;|&apos;/g, "'");

describe("the card of a test with every main answer in", () => {
  it("says the child was doing the extra questions when the round was left part way", () => {
    const text = page({ kind: "finish", attemptId: "a1", round: { answered: 3, questions: 8 } });
    expect(text).toContain("Continue test");
    expect(text).toContain("Asha was doing the extra questions.");
    expect(text).toContain("Open the test to keep going, or to stop here.");
    expect(text).not.toContain("All of Asha's answers are in");
  });

  it("says the answers are in, and the test was not sent, with no round", () => {
    const text = page({ kind: "finish", attemptId: "a1" });
    expect(text).toContain("Finish test");
    expect(text).toContain("All of Asha's answers are in, but the test was not sent.");
    expect(text).not.toContain("extra questions");
  });
});
