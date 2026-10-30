import { describe, expect, it } from "vitest";
import { redactPathTokens, redactUrlTokens } from "@/lib/url-tokens";
import { scrubAnalyticsEvent } from "@/components/site-analytics";

// QR tokens never leave the site in analytics addresses (#301, reviews R349-3 and R349-4).
describe("QR token redaction", () => {
  it("replaces the token in a full address and keeps the rest", () => {
    expect(redactUrlTokens("https://unicalearning.com/tutor/p/abc123SECRET?x=1#y")).toBe("https://unicalearning.com/tutor/p/token?x=1#y");
  });
  it("handles encoded and mixed-case paths", () => {
    expect(redactUrlTokens("https://unicalearning.com/%74utor/p/abc123SECRET")).not.toContain("abc123SECRET");
    expect(redactUrlTokens("https://unicalearning.com/TUTOR/P/abc123SECRET")).not.toContain("abc123SECRET");
  });
  it("leaves other addresses unchanged", () => {
    expect(redactUrlTokens("https://unicalearning.com/account")).toBe("https://unicalearning.com/account");
    expect(redactPathTokens("/tutor")).toBe("/tutor");
  });
  it("scrubs a Vercel Analytics page view before it is sent", () => {
    const event = scrubAnalyticsEvent({ type: "pageview", url: "https://unicalearning.com/tutor/p/abc123SECRET" } as Parameters<typeof scrubAnalyticsEvent>[0]);
    expect(event.url).toBe("https://unicalearning.com/tutor/p/token");
  });
});
