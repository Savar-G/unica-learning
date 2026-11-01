import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { MayaCallList } from "@/components/admin-maya";
import type { CallListRow } from "@/lib/maya-call-server";

// The admin Maya calls list (#333), through the component's public interface.
const row = (over: Partial<CallListRow>): CallListRow => ({
  id: "c1", createdAt: "2026-10-31T12:00:00Z", childId: "k1", childName: "Iris", questionText: "68 – 19 = ?", status: "ended",
  model: { id: "fake", fake: true }, outcome: "safety", assistance: null, seconds: 12, learningEvent: true,
  flag: null, safetySeverity: null, safetyFlag: false, ...over,
});
const text = (calls: CallListRow[]) => renderToStaticMarkup(createElement(MayaCallList, { calls })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the calls list's safety label", () => {
  it("names immediate danger for a call saved with a severity and no flag (R393-L3)", () => {
    expect(text([row({ safetySeverity: "immediate", safetyFlag: true })])).toContain("Child may be in danger now");
    expect(text([row({ safetySeverity: "concern", safetyFlag: true })])).toContain("Possible safety concern");
  });

  it("uses the flag when there is one, and no label for a call with no concern", () => {
    expect(text([row({ flag: "unsafe_request" })])).toContain("Child asked for harmful content");
    const none = text([row({ outcome: "solved" })]);
    for (const label of ["Child may be in danger now", "Possible safety concern", "Child asked for harmful content"]) expect(none).not.toContain(label);
  });
});
