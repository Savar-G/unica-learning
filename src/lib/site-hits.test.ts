import { describe, expect, it } from "vitest";
import { browserOf, countablePath, deviceOf, referrerHost, siteHitRow, trackHit, HIT_STORAGE_KEY, type SiteHitPost } from "@/lib/site-hits";

const ID = "0b6f0c6e-1111-4111-8111-111111111111";
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

describe("which pages are counted", () => {
  it.each(["/", "/pricing", "/blog/some-post", "/start", "/thank-you", "/math-assessment"])("counts %s", (p) => expect(countablePath(p)).toBe(true));
  it.each(["/admin", "/admin/traffic", "/tutor/p/abc", "/account/scan", "/account", "/api/hit", "/auth/callback", "/sign-in", "/f/a", "/unsubscribe", "/?x=1", "/a#b", "//evil.com", "pricing", `/${"a".repeat(200)}`])("skips %s", (p) => expect(countablePath(p)).toBe(false));
});

describe("what a browser sends", () => {
  it("makes the visit id on the first page, marks it the landing and sends the referrer host and UTM tags once", () => {
    const s = store();
    const sent: SiteHitPost[] = [];
    const run = (pathname: string, search = "", referrer = "") => trackHit({ pathname, search, referrer, ownHost: "unicalearning.com", store: s, newId: () => ID, send: (h) => sent.push(h) });
    run("/", "?utm_source=meta&utm_medium=paid&utm_campaign=bc&fbclid=SECRET", "https://l.facebook.com/l.php?u=private");
    run("/pricing", "?utm_source=meta", "https://unicalearning.com/");
    expect(sent).toEqual([
      { visitId: ID, path: "/", landing: true, ref: "l.facebook.com", utm_source: "meta", utm_medium: "paid", utm_campaign: "bc" },
      { visitId: ID, path: "/pricing", landing: false },
    ]);
    expect(JSON.stringify(sent)).not.toMatch(/SECRET|private/);
  });
  it("sends nothing for a private page, and nothing when the tab cannot keep the id", () => {
    const sent: SiteHitPost[] = [];
    const base = { search: "", referrer: "", ownHost: "x.com", newId: () => ID, send: (h: SiteHitPost) => sent.push(h) };
    trackHit({ ...base, pathname: "/admin", store: store() });
    trackHit({ ...base, pathname: "/", store: { getItem: () => null, setItem: () => {} } });
    trackHit({ ...base, pathname: "/", store: { getItem: () => { throw new Error("off"); }, setItem: () => {} } });
    expect(sent).toEqual([]);
  });
  it("counts the same page twice at once only once, and a later visit to it again", () => {
    const s = store();
    const sent: SiteHitPost[] = [];
    let t = 1_000_000;
    const run = (pathname: string) => trackHit({ pathname, search: "", referrer: "", ownHost: "x", store: s, newId: () => ID, send: (h) => sent.push(h), now: () => t });
    run("/pricing");
    t += 30;
    run("/pricing");
    t += 30;
    run("/");
    t += 5000;
    run("/");
    expect(sent.map((h) => [h.path, h.landing])).toEqual([["/pricing", true], ["/", false], ["/", false]]);
  });
  it("keeps one id for the tab", () => {
    const s = store();
    trackHit({ pathname: "/", search: "", referrer: "", ownHost: "x", store: s, newId: () => ID, send: () => {} });
    expect(s.m.get(HIT_STORAGE_KEY)).toBe(ID);
  });
});

describe("the row the server stores", () => {
  const headers = { userAgent: IPHONE, country: "CA", region: "BC" };
  it("keeps the coarse facts and never the user agent", () => {
    const row = siteHitRow({ visitId: ID.toUpperCase(), path: "/", landing: true, ref: "google.com", utm_source: " google ", utm_campaign: "x".repeat(300) }, headers);
    expect(row).toMatchObject({ visit_id: ID, path: "/", is_landing: true, referrer_host: "google.com", utm_source: "google", device: "mobile", browser: "Safari", country: "CA", region: "BC" });
    expect(row?.utm_campaign).toHaveLength(100);
    expect(JSON.stringify(row)).not.toContain("iPhone");
  });
  it("drops tags and referrer from a later page of the visit", () => {
    expect(siteHitRow({ visitId: ID, path: "/pricing", landing: false, ref: "google.com", utm_source: "x" }, headers)).toMatchObject({ is_landing: false, referrer_host: null, utm_source: null });
  });
  it.each([null, [], "x", { visitId: "nope", path: "/" }, { visitId: ID, path: "/admin" }, { visitId: ID, path: "/a?b=1" }, { visitId: ID }])("refuses %j", (b) => expect(siteHitRow(b, headers)).toBeNull());
  it("ignores a bad country or region", () => {
    expect(siteHitRow({ visitId: ID, path: "/" }, { userAgent: null, country: "canada", region: "BC" })).toMatchObject({ country: null, region: null });
  });
});

describe("device, browser and referrer", () => {
  it("reads device classes", () => {
    expect(deviceOf(IPHONE)).toBe("mobile");
    expect(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 14; SM-X700) Chrome/120 Safari/537")).toBe("tablet");
    expect(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120 Safari/537")).toBe("desktop");
  });
  it("names ad-platform app browsers", () => {
    expect(browserOf("Mozilla/5.0 (iPhone) AppleWebKit Mobile/15E148 Instagram 300.0")).toBe("Instagram app");
    expect(browserOf("Mozilla/5.0 Chrome/120 Safari/537 Edg/120")).toBe("Edge");
    expect(browserOf("Mozilla/5.0 Chrome/120 Safari/537")).toBe("Chrome");
  });
  it("keeps only a foreign web host", () => {
    expect(referrerHost("https://www.google.com/search?q=secret", "unicalearning.com")).toBe("google.com");
    expect(referrerHost("https://unicalearning.com/pricing", "unicalearning.com")).toBeNull();
    expect(referrerHost("android-app://com.google.android.gm", "x")).toBeNull();
    expect(referrerHost("", "x")).toBeNull();
  });
});
