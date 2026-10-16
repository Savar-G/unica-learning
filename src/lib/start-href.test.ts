import { describe, expect, it } from "vitest";
import { startHref } from "@/lib/visit-source";
import { flyerDestination } from "@/lib/flyers";

// The "Take free assessment" buttons link to /start with the visit's tags, because the signup form keeps the tags of
// the page it is on. A flyer's QR code lands on the home page, so the tags have to survive the click.

describe("the signup link", () => {
  it("is plain /start for a visit with no tags", () => {
    expect(startHref("")).toBe("/start");
    expect(startHref("?foo=bar")).toBe("/start");
  });

  it("carries the visit's tags and nothing else", () => {
    expect(startHref("?utm_source=reddit&utm_campaign=oct&foo=bar")).toBe("/start?utm_source=reddit&utm_campaign=oct");
    expect(startHref(new URLSearchParams("ref=abc&utm_medium=print"))).toBe("/start?utm_medium=print&ref=abc");
  });

  it("keeps a flyer's tags from the home page to the signup, so the family is counted for that flyer", () => {
    const landing = flyerDestination("a").split("?")[1];
    const to = new URL(startHref(landing), "https://unicalearning.com");
    expect(to.pathname).toBe("/start");
    expect(Object.fromEntries(to.searchParams)).toMatchObject({ utm_source: "flyer", utm_medium: "print", utm_campaign: "door-to-door", utm_content: "a" });
  });

  it("does not let an empty tag through", () => {
    expect(startHref("?utm_source=&utm_content=b")).toBe("/start?utm_content=b");
  });
});
