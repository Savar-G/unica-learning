import { describe, expect, it } from "vitest";
import { replayAllowed, scrubEvent, scrubLog, scrubSpan, scrubText, scrubUrl, type ScrubbableEvent } from "@/lib/sentry-scrub";

const QR = "/tutor/p/AbCdEf0123456789xyz";

describe("scrubUrl", () => {
  it("drops the query and the hash", () => {
    expect(scrubUrl("https://unicalearning.com/thank-you?session_id=cs_live_123&from=report#x")).toBe("https://unicalearning.com/thank-you");
    expect(scrubUrl("/unsubscribe?token=abc")).toBe("/unsubscribe");
  });
  it("replaces a QR token, the scan pages and admin records", () => {
    expect(scrubUrl(`https://unicalearning.com${QR}`)).toBe("https://unicalearning.com/tutor/p/token");
    expect(scrubUrl("/admin/children/1b4e28ba-2fa1-11d2-883f-0016d3cca427")).toBe("/admin");
    expect(scrubUrl("/account/scan/abc")).toBe("/account/scan");
  });
  it("keeps an ordinary page", () => {
    expect(scrubUrl("https://unicalearning.com/pricing")).toBe("https://unicalearning.com/pricing");
  });
});

describe("scrubText", () => {
  it("hides emails, bearer values and long tokens", () => {
    const out = scrubText("send to jane.doe+kid@example.com with Bearer sk_live_abcdefghijklmnop and eyJhbGciOiJIUzI1NiJ9.payload.sig");
    expect(out).not.toContain("jane.doe");
    expect(out).not.toContain("sk_live");
    expect(out).not.toContain("eyJhbGci");
    expect(out).toContain("[email]");
  });
  it("keeps a UUID, our own id", () => {
    expect(scrubText("child 1b4e28ba-2fa1-11d2-883f-0016d3cca427 failed")).toContain("1b4e28ba-2fa1-11d2-883f-0016d3cca427");
  });
});

describe("scrubEvent", () => {
  function event(): ScrubbableEvent {
    return {
      message: `failed at https://unicalearning.com${QR}?next=/x for parent@example.com`,
      transaction: "/thank-you?session_id=cs_1",
      request: { url: "https://unicalearning.com/report?src=email", query_string: "src=email", data: { answer: "42" }, cookies: { sb: "x" }, headers: { cookie: "sb=x", authorization: "Bearer y", "user-agent": "UA", "x-forwarded-for": "1.2.3.4" } },
      exception: { values: [{ value: "no row for kid@example.com", stacktrace: { frames: [{ vars: { childName: "Iris" } }] } }] },
      breadcrumbs: [
        { category: "console", message: "child answer 42" },
        { category: "fetch", data: { url: "/api/account/card?ref=abc", method: "POST", request_body: "{}" } },
        { category: "navigation", data: { from: QR, to: "/account?reminder=r1" } },
      ],
      user: { id: "parent-1", email: "parent@example.com", ip_address: "1.2.3.4" },
      tags: { page: `https://unicalearning.com${QR}` },
    };
  }

  it("removes bodies, cookies, query strings, private headers, frame variables and console lines", () => {
    const out = scrubEvent(event());
    expect(out.request).toEqual({ url: "https://unicalearning.com/report", headers: { "user-agent": "UA" } });
    expect(out.exception?.values?.[0].stacktrace?.frames?.[0].vars).toBeUndefined();
    expect(out.breadcrumbs?.map((b) => b.category)).toEqual(["fetch", "navigation"]);
    expect(out.breadcrumbs?.[0].data).toEqual({ url: "/api/account/card", method: "POST" });
    expect(out.transaction).toBe("/thank-you");
  });

  it("keeps no email, QR token or address detail anywhere", () => {
    const text = JSON.stringify(scrubEvent(event()));
    expect(text).not.toMatch(/@example\.com/);
    expect(text).not.toContain("AbCdEf0123456789xyz");
    expect(text).not.toContain("reminder=");
    expect(text).not.toContain("1.2.3.4");
    expect(text).not.toContain("Iris");
  });

  it("keeps only the pseudonymous user id", () => {
    expect(scrubEvent(event()).user).toEqual({ id: "parent-1" });
    expect(scrubEvent({ user: { email: "a@b.co" } }).user).toEqual({});
  });
});

describe("scrubLog", () => {
  it("cleans the message and drops the printed arguments", () => {
    const log = scrubLog({ message: "[reminders] sent to mom@example.com", attributes: { "sentry.message.parameter.0": { name: "Iris" }, "url.full": "https://unicalearning.com/x?y=1" } });
    expect(log.message).toBe("[reminders] sent to [email]");
    expect(log.attributes).toEqual({ "url.full": "https://unicalearning.com/x" });
  });
});

describe("scrubSpan", () => {
  it("drops AI content, database statements and bodies, and cleans addresses", () => {
    const span = scrubSpan({
      name: `GET ${QR}`,
      attributes: {
        "gen_ai.input.messages": "[{\"content\":\"the child wrote 7\"}]",
        "gen_ai.output.messages": "x",
        "gen_ai.request.model": "anthropic/claude-sonnet-5.5",
        "gen_ai.usage.input_tokens": 120,
        "db.query.text": "select * from children where name = 'Iris'",
        "http.request.body.size": 20,
        "url.full": "https://abc.supabase.co/rest/v1/children?parent_id=eq.123",
        "url.query": "parent_id=eq.123",
      },
    });
    expect(span.name).toBe("GET /tutor/p/token");
    expect(span.attributes).toEqual({
      "gen_ai.request.model": "anthropic/claude-sonnet-5.5",
      "gen_ai.usage.input_tokens": 120,
      "url.full": "https://abc.supabase.co/rest/v1/children",
    });
  });
});

describe("replayAllowed", () => {
  it.each(["/", "/pricing", "/start", "/sign-in", "/account", "/account/plan", "/account/progress/abc", "/thank-you"])("records on %s", (path) => {
    expect(replayAllowed(path)).toBe(true);
  });
  it.each(["/tutor", QR, "/TUTOR/p/x", "/%74utor", "/admin", "/admin/dashboard", "/account/test/abc", "/account/start/abc", "/account/scan", "/account/scan/results", "/sign-in?next=%2Ftutor%2Fp%2Fabc"])("never records on %s", (path) => {
    expect(replayAllowed(path)).toBe(false);
  });
});
