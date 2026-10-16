import { describe, expect, it } from "vitest";
import { sourceTags, visitSource } from "@/lib/visit-source";

// Which channel a signup keeps: the page's tags, or the ones kept for the tab when the parent came back from Google.

const flyer = "?utm_source=flyer&utm_medium=print&utm_campaign=door-to-door&utm_content=a";
const kept = JSON.stringify(sourceTags(flyer));

describe("the source a signup keeps", () => {
  it("is the referrer and the page's tags", () => {
    expect(visitSource({ search: "?utm_source=reddit&x=1", referrer: "https://www.reddit.com/", stored: null })).toEqual({ referrer: "https://www.reddit.com/", utm_source: "reddit" });
  });

  it("falls back to the tags kept for the tab when the page has none, as after Google sign-in", () => {
    expect(visitSource({ search: "", referrer: "", stored: kept })).toEqual({ utm_source: "flyer", utm_medium: "print", utm_campaign: "door-to-door", utm_content: "a" });
  });

  it("prefers the page's own tags over the kept ones", () => {
    expect(visitSource({ search: "?utm_source=reddit", referrer: "", stored: kept })).toEqual({ utm_source: "reddit" });
  });

  it("ignores a kept value that is not ours", () => {
    expect(visitSource({ search: "", referrer: "", stored: "not json" })).toEqual({});
    expect(visitSource({ search: "", referrer: "", stored: JSON.stringify(["flyer"]) })).toEqual({});
    expect(visitSource({ search: "", referrer: "", stored: JSON.stringify({ utm_source: 5, other: "x" }) })).toEqual({});
  });
});
