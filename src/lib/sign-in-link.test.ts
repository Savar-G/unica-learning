import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LINK_TTL_MS, canResend, hashToken, linkEmail, linkState, newToken, safeNext, startPath } from "@/lib/sign-in-link";

describe("sign-in link tokens", () => {
  it("are URL-safe, 256-bit and different every time", () => {
    const a = newToken();
    const b = newToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
  });
  it("are stored only as their SHA-256 hash", () => {
    const { token, hash } = newToken();
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hashToken(token)).toBe(hash);
  });
  it("hash to null when the text is not a token, so the database is never asked", () => {
    for (const bad of [null, undefined, "", "short", "x".repeat(44), `${"a".repeat(42)}/`]) expect(hashToken(bad), String(bad)).toBeNull();
  });
});

describe("sign-in link state: once, and only for 24 hours", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  const row = (expiresIn: number, used: boolean) => ({
    expires_at: new Date(now + expiresIn).toISOString(),
    used_at: used ? new Date(now - 1000).toISOString() : null,
  });

  it("lasts 24 hours", () => expect(LINK_TTL_MS).toBe(24 * 60 * 60 * 1000));
  it("is valid before it expires and before it is used", () => expect(linkState(row(1000, false), now)).toBe("valid"));
  it("is expired at the expiry time and after it", () => {
    expect(linkState(row(0, false), now)).toBe("expired");
    expect(linkState(row(-1, false), now)).toBe("expired");
  });
  it("is used once it was used, also after it expired", () => {
    expect(linkState(row(1000, true), now)).toBe("used");
    expect(linkState(row(-1000, true), now)).toBe("used");
  });
  it("is unknown when there is no such link", () => expect(linkState(null, now)).toBe("unknown"));
});

describe("canResend: an old link can ask for a new one for 7 days", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  it("for 7 days after it was made", () => {
    expect(canResend(new Date(now - day).toISOString(), now)).toBe(true);
    expect(canResend(new Date(now - 7 * day + 1000).toISOString(), now)).toBe(true);
  });
  it("not after that, so an old email cannot ask for mail forever", () => {
    expect(canResend(new Date(now - 7 * day).toISOString(), now)).toBe(false);
    expect(canResend(new Date(now - 30 * day).toISOString(), now)).toBe(false);
  });
});

describe("safeNext: where a sign-in may send the visitor", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/account/start/0b6c1f9e-2f1e-4b8a-9d55-6a1f0c2b7e10")).toBe("/account/start/0b6c1f9e-2f1e-4b8a-9d55-6a1f0c2b7e10");
    expect(safeNext("/account/password?x=1")).toBe("/account/password?x=1");
  });
  it("drops another site, a protocol-relative URL or a non-path", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "account", "", null, undefined]) {
      expect(safeNext(bad), String(bad)).toBe("/account");
    }
  });
  it("drops a path that the URL parser turns into another site (tab, newline, carriage return)", () => {
    for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\t\\evil.example"]) {
      expect(safeNext(bad), JSON.stringify(bad)).toBe("/account");
    }
  });
  it("keeps the query and hash of a path on this site", () => expect(safeNext("/account?x=1#top")).toBe("/account?x=1#top"));
});

describe("the start screen for a child", () => {
  it("is under /account", () => expect(startPath("abc")).toBe("/account/start/abc"));
});

describe("the sign-in link email", () => {
  const email = linkEmail({ parentName: "Priya Shah", childName: "Maya", url: "https://unicalearning.com/sign-in/link?t=abc" });
  it("names the child and carries the link", () => {
    expect(email.subject).toMatch(/Maya/);
    expect(email.text).toContain("https://unicalearning.com/sign-in/link?t=abc");
    expect(email.html).toContain('href="https://unicalearning.com/sign-in/link?t=abc"');
  });
  it("greets the parent by first name", () => expect(email.text).toMatch(/^Hi Priya,/));
  it("says the link works once and for 24 hours", () => {
    for (const body of [email.text, email.html]) {
      expect(body).toMatch(/24 hours/);
      expect(body).toMatch(/once/);
    }
  });
  it("escapes names in the HTML", () => {
    const html = linkEmail({ parentName: "<b>A</b>", childName: "Jo & <i>", url: "https://x.test/?t=1&a=2" }).html;
    expect(html).not.toMatch(/<b>A<\/b>|<i>/);
    expect(html).toContain("Jo &amp; &lt;i&gt;");
    expect(html).toContain('href="https://x.test/?t=1&amp;a=2"');
  });
});
