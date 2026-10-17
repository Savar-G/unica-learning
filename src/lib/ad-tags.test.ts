import { describe, expect, it } from "vitest";
import { adConfig, adsBlockedPath, CARD_VALUE, createAdTags, type AdConfig } from "@/lib/ad-tags";
import type { ConsentState } from "@/lib/consent";

// Meta Pixel and the Google tag: off without their IDs, loaded only after consent, never loaded or sending on a page a
// child uses, and conversions that carry no personal data. The browser parts are fakes that record each call.

const ENV = {
  NEXT_PUBLIC_META_PIXEL_ID: "1234567890",
  NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-1234567890",
  NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL: "leadLbl",
  NEXT_PUBLIC_GOOGLE_ADS_REPORT_LABEL: "reportLbl",
  NEXT_PUBLIC_GOOGLE_ADS_CARD_LABEL: "cardLbl",
};

function page({ config = adConfig(ENV), consent = "unset" as ConsentState, path = "/" } = {}) {
  const state = { consent, path, idle: [] as (() => void)[], listeners: [] as (() => void)[], installs: 0, cleared: 0 };
  const meta: unknown[][] = [];
  const google: unknown[][] = [];
  const tags = createAdTags({
    config,
    getConsent: () => state.consent,
    subscribe: (fn) => { state.listeners.push(fn); return () => {}; },
    path: () => state.path,
    location: () => `https://unicalearning.com${state.path}`,
    whenIdle: (run) => { state.idle.push(run); },
    install: (c: AdConfig) => {
      state.installs += 1;
      return { ...(c.metaPixelId ? { meta: (...a: unknown[]) => void meta.push(a) } : {}), ...(c.googleAdsId ? { google: (...a: unknown[]) => void google.push(a) } : {}) };
    },
    clearCookies: () => { state.cleared += 1; },
  });
  const idle = () => state.idle.splice(0).forEach((run) => run());
  const choose = (c: ConsentState) => { state.consent = c; state.listeners.forEach((fn) => fn()); };
  const go = (p: string) => { state.path = p; tags.page(); };
  return { tags, state, meta, google, idle, choose, go };
}

describe("ad tags configuration", () => {
  it("is off without IDs, and ignores malformed ones", () => {
    expect(adConfig({})).toEqual({ metaPixelId: null, googleAdsId: null, googleLabels: { lead: null, report: null, card: null } });
    expect(adConfig({ NEXT_PUBLIC_META_PIXEL_ID: "12<script>", NEXT_PUBLIC_GOOGLE_ADS_ID: "G-123456", NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL: "a b" })).toMatchObject({ metaPixelId: null, googleAdsId: null, googleLabels: { lead: null } });
  });

  it("never loads anything when no ID is set, even after consent and a conversion", () => {
    const p = page({ config: adConfig({}), consent: "granted" });
    p.tags.begin();
    p.idle();
    p.tags.conversion("account_created");
    expect(p.state.installs).toBe(0);
  });
});

describe("ad tags and consent", () => {
  it("load nothing before the visitor accepts, and drop conversions", () => {
    const p = page();
    p.tags.begin();
    p.idle();
    p.go("/our-story");
    p.tags.conversion("account_created");
    expect(p.state.installs).toBe(0);
    expect(p.meta).toEqual([]);
    expect(p.google).toEqual([]);
  });

  it("load at once after Accept and send a page view for the page", () => {
    const p = page();
    p.tags.begin();
    p.choose("granted");
    expect(p.state.installs).toBe(1);
    expect(p.meta).toEqual([["track", "PageView"]]);
    expect(p.google).toEqual([]); // no page_view hits to Google
  });

  it("load for a returning visitor who accepted once the page is idle, then one page view per page", () => {
    const p = page({ consent: "granted" });
    p.tags.begin();
    p.tags.page();
    expect(p.state.installs).toBe(0);
    p.idle();
    p.go("/our-story");
    p.go("/our-story");
    expect(p.state.installs).toBe(1);
    expect(p.meta).toEqual([["track", "PageView"], ["track", "PageView"]]);
  });

  it("stay off after Reject, and pause and clear their cookies when the visitor turns them off", () => {
    const rejected = page();
    rejected.tags.begin();
    rejected.choose("denied");
    expect(rejected.state.installs).toBe(0);

    const p = page({ consent: "granted" });
    p.tags.begin();
    p.idle();
    p.choose("denied");
    expect(p.meta.at(-1)).toEqual(["consent", "revoke"]);
    expect(p.google.at(-1)).toEqual(["consent", "update", { ad_storage: "denied", ad_user_data: "denied" }]);
    expect(p.state.cleared).toBe(1);
    p.tags.conversion("card_saved");
    expect(p.meta.some((c) => c[0] === "track" && c[1] === "AddPaymentInfo")).toBe(false);
  });
});

describe("ad tags on a child's pages", () => {
  it("block the test, the extra round, the start screen, and token or admin pages", () => {
    for (const path of ["/account/test/abc", "/account/extra/3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f", "/account/start/abc", "/account/start", "/account/Test/x", "/account/%74est/x", "//account/test/x", "/admin", "/sign-in/reset", "/unsubscribe", "/%E0%A4%A"]) {
      expect(adsBlockedPath(path), path).toBe(true);
    }
    for (const path of ["/", "/our-story", "/start", "/account", "/account/report/abc", "/account/finish", "/thank-you", "/account/testing"]) {
      expect(adsBlockedPath(path), path).toBe(false);
    }
  });

  it("never load on a child's page, even after consent", () => {
    const p = page({ consent: "granted", path: "/account/test/abc" });
    p.tags.begin();
    p.idle();
    p.tags.conversion("report_open");
    expect(p.state.installs).toBe(0);
  });

  it("send nothing on a child's page when loaded on an earlier page, and come back after it", () => {
    const p = page({ consent: "granted", path: "/account" });
    p.tags.begin();
    p.idle();
    p.go("/account/start/abc");
    p.go("/account/test/abc");
    const metaThere = p.meta.length;
    const googleThere = p.google.length;
    p.tags.conversion("account_created");
    p.tags.conversion("report_open");
    p.tags.conversion("card_saved");
    p.go("/account/test/abc");
    expect(p.meta.length).toBe(metaThere);
    expect(p.google.length).toBe(googleThere);
    // Paused on arrival, and no page view for the child's pages.
    expect(p.meta).toEqual([["track", "PageView"], ["consent", "revoke"]]);
    expect(p.google).toEqual([["consent", "update", { ad_storage: "denied", ad_user_data: "denied" }]]);
    p.go("/account");
    expect(p.meta.slice(-2)).toEqual([["consent", "grant"], ["track", "PageView"]]);
  });
});

describe("ad conversions", () => {
  function sent(event: string) {
    const p = page({ consent: "granted", path: "/start" });
    p.tags.begin();
    p.idle();
    p.meta.length = 0;
    p.tags.conversion(event);
    return p;
  }

  it("map account_created to Meta Lead and Google's lead conversion", () => {
    const p = sent("account_created");
    expect(p.meta).toEqual([["track", "Lead"]]);
    expect(p.google).toEqual([["event", "conversion", { send_to: "AW-1234567890/leadLbl", page_location: "https://unicalearning.com/start" }]]);
  });

  it("map report_open to Meta ReportOpen and Google's report conversion", () => {
    const p = sent("report_open");
    expect(p.meta).toEqual([["trackCustom", "ReportOpen"]]);
    expect(p.google[0][2]).toMatchObject({ send_to: "AW-1234567890/reportLbl" });
  });

  it("map card_saved to Meta AddPaymentInfo worth the first month, CAD 69.30, and Google's card conversion", () => {
    expect(CARD_VALUE).toBe(69.3);
    const p = sent("card_saved");
    expect(p.meta).toEqual([["track", "AddPaymentInfo", { value: 69.3, currency: "CAD" }]]);
    expect(p.google[0][2]).toMatchObject({ send_to: "AW-1234567890/cardLbl", value: 69.3, currency: "CAD" });
  });

  it("send nothing for other events, and no personal data with any conversion", () => {
    expect(sent("cta_click").meta).toEqual([]);
    expect(sent("test_finish").google).toEqual([]);
    const all = ["account_created", "report_open", "card_saved"].map((e) => sent(e)).flatMap((p) => [...p.meta, ...p.google]);
    const keys = new Set(all.flatMap((c) => c.flatMap((a) => (a && typeof a === "object" ? Object.keys(a) : []))));
    expect([...keys].sort()).toEqual(["currency", "page_location", "send_to", "value"]);
  });

  it("skip Google for an event whose label is not set, and still send Meta", () => {
    const p = page({ config: adConfig({ ...ENV, NEXT_PUBLIC_GOOGLE_ADS_REPORT_LABEL: undefined }), consent: "granted", path: "/account/report/x" });
    p.tags.begin();
    p.idle();
    p.tags.conversion("report_open");
    expect(p.google).toEqual([]);
    expect(p.meta.at(-1)).toEqual(["trackCustom", "ReportOpen"]);
  });

  it("load the tags for a conversion that comes before the page is idle", () => {
    const p = page({ consent: "granted", path: "/start" });
    p.tags.begin();
    p.tags.conversion("account_created");
    expect(p.state.installs).toBe(1);
    expect(p.meta).toEqual([["track", "PageView"], ["track", "Lead"]]);
  });
});
