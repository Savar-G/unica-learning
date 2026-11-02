import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { MayaCall, MayaCallList } from "@/components/admin-maya";
import { boardPlayback } from "@/lib/maya-call";
import { reviewFixture } from "@/lib/maya-call-review-fixture";
import type { CallListRow } from "@/lib/maya-call-server";

// The admin Maya calls list (#333), through the component's public interface.
const row = (over: Partial<CallListRow>): CallListRow => ({
  id: "c1", createdAt: "2026-10-31T12:00:00Z", childId: "k1", childName: "Iris", questionText: "68 – 19 = ?", status: "ended",
  model: { id: "fake", fake: true }, outcome: "safety", assistance: null, seconds: 12, learningEvent: true,
  mode: "text", connectedSeconds: null, mishearing: null,
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

it("uses the same number-check words on the list and the call page", async () => {
  const fixture = await reviewFixture();
  const list = text([row({ mishearing: fixture.text.outcome!.mishearing })]);
  const call = renderToStaticMarkup(createElement(MayaCall, { initial: fixture.text, board: boardPlayback(fixture.text.batches), childName: "Iris" })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const shown of [list, call]) {
    expect(shown).toContain("Numbers Maya checked");
    expect(shown).toContain("0 checked, 0 fixed");
    expect(shown).not.toContain("0 asked, 0 corrected");
  }
});

it("shows plain links to both call pages, including a route back from an empty page", () => {
  const markup = renderToStaticMarkup(createElement(MayaCallList, { calls: [], older: "next-token", newer: "start" }));
  expect(markup).toContain("Older calls");
  expect(markup).toContain("Newer calls");
  expect(markup).toContain('/admin/maya?cursor=next-token');
  expect(markup).toContain('href="/admin/maya"');
});

it("labels child chats correctly and keeps the live view read-only", async () => {
  const fixture = await reviewFixture();
  const initial = { ...fixture.text, kind: "chat" as const, status: "live" as const };
  const markup = renderToStaticMarkup(createElement(MayaCall, { initial, board: boardPlayback(initial.batches), childName: "Iris" }));
  expect(markup).toContain("Chat: no voice minutes used");
  expect(markup).toContain("This view is read-only");
  expect(markup).not.toContain("<textarea");
  expect(markup).not.toContain("Test family: no minutes used, no parent emails");
});
