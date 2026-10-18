import { describe, expect, it } from "vitest";
import { adConfig, adsBlockedPath, CARD_VALUE, createAdTags, metaCleanAddress, metaCleanReferrer, type AdConfig } from "@/lib/ad-tags";
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

function page({ config = adConfig(ENV), consent = "unset" as ConsentState, path = "/", referrer = "" } = {}) {
  const state = { consent, path, referrer, idle: [] as (() => void)[], listeners: [] as (() => void)[], installs: 0, installed: [] as string[], cleared: 0 };
  const meta: unknown[][] = [];
  const google: unknown[][] = [];
  const tags = createAdTags({
    config,
    getConsent: () => state.consent,
    subscribe: (fn) => { state.listeners.push(fn); return () => {}; },
    address: () => state.path,
    location: () => `https://unicalearning.com${state.path.split(/[?#]/)[0]}`,
    referrer: () => state.referrer,
    origin: () => "https://unicalearning.com",
    referrerLocation: () => (state.referrer ? "https://unicalearning.com/clean-referrer" : ""),
    whenIdle: (run) => { state.idle.push(run); },
    install: (_c: AdConfig, tag: "meta" | "google") => {
      state.installs += 1;
      state.installed.push(tag);
      return tag === "meta" ? (...a: unknown[]) => void meta.push(a) : (...a: unknown[]) => void google.push(a);
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
    expect(p.state.installed).toEqual(["google", "meta"]);
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
    expect(p.state.installs).toBe(2);
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

describe("Meta's clean addresses", () => {
  it("are fixed marketing and parent pages with only ad tags in the query", () => {
    for (const a of ["/", "/our-story", "/compare", "/rewards", "/resources", "/resources/bc-grade-1-math-and-reading", "/sample-report", "/start", "/start?utm_source=meta&utm_content=photo-led&fbclid=IwAR1", "/?fbclid=IwAR1&utm_campaign=oct", "/account", "/account/finish", "/our-story/", "/#how-it-works"]) {
      expect(metaCleanAddress(a), a).toBe(true);
    }
  });

  it("are never an address that holds an id, a token or any other query", () => {
    for (const a of [
      "/thank-you?session_id=cs_test_abc123&from=report",
      "/?gclid=Cj0K",
      "/start?utm_source=google&gclid=Cj0K",
      "/thank-you",
      "/account/report/3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f",
      "/account/report/3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f?src=email",
      "/account/finish?code=4f1c2b",
      "/account?sent=1",
      "/?card=cancelled",
      "/start?next=/account",
      "/auth/callback?code=abc",
      "/sign-in/reset?token_hash=abc&type=recovery",
      "/account/learning/3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f",
      "/account/start/abc",
      "/resources/3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f-x/y",
      "/#access_token=eyJhbGciOi.x.y&type=recovery",
      "//evil.example/",
    ]) {
      expect(metaCleanAddress(a), a).toBe(false);
    }
  });

  it("keep Meta silent and unloaded on an address that is not clean, while Google loads", () => {
    const p = page({ consent: "granted", path: "/thank-you?session_id=cs_test_abc123" });
    p.tags.begin();
    p.idle();
    p.tags.conversion("card_saved");
    expect(p.state.installed).toEqual(["google"]);
    expect(p.meta).toEqual([]);
    expect(p.google).toEqual([["event", "conversion", { send_to: "AW-1234567890/cardLbl", page_location: "https://unicalearning.com/thank-you", page_referrer: "", value: 69.3, currency: "CAD" }]]);
  });

  it("pause Meta, with no page view, when the visitor moves on to an address that is not clean", () => {
    const p = page({ consent: "granted", path: "/account" });
    p.tags.begin();
    p.idle();
    p.go("/account/report/3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f");
    p.tags.conversion("report_open");
    expect(p.meta).toEqual([["track", "PageView"], ["consent", "revoke"]]);
    expect(p.google.at(-1)).toEqual(["event", "conversion", { send_to: "AW-1234567890/reportLbl", page_location: "https://unicalearning.com/account/report/3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f", page_referrer: "" }]);
  });
});

describe("Meta and the referrer", () => {
  const O = "https://unicalearning.com";
  it("counts as clean: no referrer, another site's bare origin, or a clean address here", () => {
    for (const r of ["", "https://www.facebook.com/", "https://www.google.com/", `${O}/`, `${O}/our-story?utm_source=meta`, `${O}/account`]) {
      expect(metaCleanReferrer(r, O), r).toBe(true);
    }
  });

  it("counts as not clean: an address here with an id or token, another site's full address, or junk", () => {
    for (const r of [`${O}/thank-you?session_id=cs_test_x`, `${O}/account/report/3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f`, `${O}/sign-in/reset?token_hash=abc`, `${O}/?gclid=Cj0K`, "https://checkout.stripe.com/c/pay/cs_live_abc", "https://example.com/?q=x", "not a url"]) {
      expect(metaCleanReferrer(r, O), r).toBe(false);
    }
  });

  it("keeps Meta unloaded and silent on a clean page reached from an address with an id, while Google loads", () => {
    const p = page({ consent: "granted", path: "/", referrer: `${O}/thank-you?session_id=cs_test_x` });
    p.tags.begin();
    p.idle();
    p.tags.conversion("account_created");
    expect(p.state.installed).toEqual(["google"]);
    expect(p.meta).toEqual([]);
    expect(p.google[0][2]).toMatchObject({ send_to: "AW-1234567890/leadLbl", page_referrer: "https://unicalearning.com/clean-referrer" });
  });

  it("runs Meta on the same page when the referrer is clean", () => {
    const p = page({ consent: "granted", path: "/", referrer: "https://www.facebook.com/" });
    p.tags.begin();
    p.idle();
    expect(p.meta).toEqual([["track", "PageView"]]);
  });
});

describe("ad conversions", () => {
  function sent(event: string, path: string) {
    const p = page({ consent: "granted", path });
    p.tags.begin();
    p.idle();
    p.meta.length = 0;
    p.tags.conversion(event);
    return p;
  }
  const REPORT = "/account/report/3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f?src=email";
  const THANKS = "/thank-you?session_id=cs_test_abc123&from=report";

  it("map account_created to Meta Lead and Google's lead conversion, on /start and on /account/finish", () => {
    for (const path of ["/start?utm_source=meta", "/account/finish"]) {
      const p = sent("account_created", path);
      expect(p.meta).toEqual([["track", "Lead"]]);
      expect(p.google).toEqual([["event", "conversion", { send_to: "AW-1234567890/leadLbl", page_location: `https://unicalearning.com${path.split("?")[0]}`, page_referrer: "" }]]);
    }
  });

  it("send report_open to Google only: the report's address holds its id", () => {
    const p = sent("report_open", REPORT);
    expect(p.meta).toEqual([]);
    expect(p.google[0][2]).toMatchObject({ send_to: "AW-1234567890/reportLbl" });
  });

  it("send card_saved to Google only, worth the first month (CAD 69.30): the thank-you address holds a Stripe reference", () => {
    expect(CARD_VALUE).toBe(69.3);
    const p = sent("card_saved", THANKS);
    expect(p.meta).toEqual([]);
    expect(p.google[0][2]).toMatchObject({ send_to: "AW-1234567890/cardLbl", value: 69.3, currency: "CAD" });
    expect(JSON.stringify(p.google)).not.toContain("cs_test");
  });

  it("send nothing for other events, and no personal data with any conversion", () => {
    expect(sent("cta_click", "/").meta).toEqual([]);
    expect(sent("test_finish", "/").google).toEqual([]);
    const all = [sent("account_created", "/start"), sent("report_open", REPORT), sent("card_saved", THANKS)].flatMap((p) => [...p.meta, ...p.google]);
    const keys = new Set(all.flatMap((c) => c.flatMap((a) => (a && typeof a === "object" ? Object.keys(a) : []))));
    expect([...keys].sort()).toEqual(["currency", "page_location", "page_referrer", "send_to", "value"]);
  });

  it("skip Google for an event whose label is not set", () => {
    const p = page({ config: adConfig({ ...ENV, NEXT_PUBLIC_GOOGLE_ADS_REPORT_LABEL: undefined }), consent: "granted", path: REPORT });
    p.tags.begin();
    p.idle();
    p.tags.conversion("report_open");
    expect(p.google).toEqual([]);
  });

  it("load the tags for a conversion that comes before the page is idle", () => {
    const p = page({ consent: "granted", path: "/start" });
    p.tags.begin();
    p.tags.conversion("account_created");
    expect(p.state.installs).toBe(2);
    expect(p.meta).toEqual([["track", "PageView"], ["track", "Lead"]]);
  });
});
