import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StartState } from "@/lib/assessment";
import { StartTest } from "@/components/account";

// The account page's button for a child's test (#225, spec #181), through the component's public interface.
const page = (state: StartState) =>
  renderToStaticMarkup(createElement(StartTest, { childId: "c1", name: "Asha", state })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&#x27;|&apos;/g, "'");

describe("the card of a test with every answer in", () => {
  it("says the answers are in, and the test was not sent", () => {
    const text = page({ kind: "finish", attemptId: "a1" });
    expect(text).toContain("Finish test");
    expect(text).toContain("All of Asha's answers are in, but the test was not sent.");
    expect(text).not.toContain("extra questions");
  });
});
