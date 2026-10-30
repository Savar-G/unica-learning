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
  it("replaces a token held in a query value, such as the sign-in page's next address", () => {
    expect(redactUrlTokens("https://unicalearning.com/sign-in?next=%2Ftutor%2Fp%2Fabc123SECRET")).not.toContain("abc123SECRET");
    expect(redactUrlTokens("https://unicalearning.com/sign-in?next=/tutor/p/abc123SECRET")).toContain("next=%2Ftutor%2Fp%2Ftoken");
  });
  it("leaves other addresses unchanged", () => {
    expect(redactUrlTokens("https://unicalearning.com/account")).toBe("https://unicalearning.com/account");
    expect(redactPathTokens("/tutor")).toBe("/tutor");
  });
  const view = (url: string) => scrubAnalyticsEvent({ type: "pageview", url } as Parameters<typeof scrubAnalyticsEvent>[0]);
  it("drops every Vercel Analytics event on a desk or QR page", () => {
    expect(view("https://unicalearning.com/tutor/p/abc123SECRET")).toBeNull();
    expect(view("https://unicalearning.com/%74utor/p/abc123SECRET")).toBeNull();
    expect(view("https://unicalearning.com/tutor")).toBeNull();
  });
  it("drops a sign-in redirect whose next address holds a QR token, plain or encoded", () => {
    expect(view("https://unicalearning.com/sign-in?next=/tutor/p/abc123SECRET")).toBeNull();
    expect(view("https://unicalearning.com/sign-in?next=%2Ftutor%2Fp%2Fabc123SECRET")).toBeNull();
    expect(view("https://unicalearning.com/sign-in?next=%252Ftutor%252Fp%252Fabc123SECRET")).toBeNull();
  });
  it("keeps other page views as they are", () => {
    expect(view("https://unicalearning.com/account")?.url).toBe("https://unicalearning.com/account");
    expect(view("https://unicalearning.com/sign-in?next=/account")?.url).toBe("https://unicalearning.com/sign-in?next=/account");
  });
});
