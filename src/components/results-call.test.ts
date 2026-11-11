// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BookCall } from "@/components/report-next";
import { setConsent } from "@/lib/consent";
import { safeBookingUrl } from "@/lib/contact";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("loads the calendar only with consent and keeps the link after withdrawal", async () => {
  localStorage.clear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(BookCall, { call: { title: "Results", text: "Details", button: "Book" } })));
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.querySelector("a")?.href).toContain("calendly.com");
  await act(async () => setConsent("granted"));
  expect(host.querySelector("iframe")?.getAttribute("referrerPolicy")).toBe("no-referrer");
  await act(async () => setConsent("denied"));
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.querySelector("a")?.href).toContain("calendly.com");
  await act(async () => root.unmount());
  host.remove();
});

it("removes contact data from booking links", () => {
  expect(safeBookingUrl("https://calendly.com/example/15min?name=Priya&email=a%40b.ca#child")).toBe("https://calendly.com/example/15min");
  expect(safeBookingUrl("https://example.com/?phone=6045550123")).toBe("");
});
