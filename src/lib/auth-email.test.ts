import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTH_EMAIL_KINDS, authEmail } from "@/lib/auth-email";

describe("hosted account email templates", () => {
  it("keeps confirmation and sign-in code-only", () => {
    for (const kind of ["confirmation", "magic_link"] as const) {
      const email = authEmail(kind);
      expect(email.html).toContain("{{ .Token }}");
      expect(email.html).toContain("Enter your code on the page where you asked for it.");
      expect(email.html).not.toMatch(/ConfirmationURL|TokenHash|RedirectTo/);
      expect(email.html).toContain(kind === "confirmation" ? "Enter it on the signup page." : "Enter it on the page where you asked for it.");
    }
  });
  it("keeps the password reset token hash and recovery redirect", () => {
    const email = authEmail("recovery");
    expect(email.html).toContain('href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery"');
    expect(email.html).not.toContain("{{ .ConfirmationURL }}");
  });
  it("uses design A with a support link and no marketing unsubscribe", () => {
    for (const kind of AUTH_EMAIL_KINDS) {
      const email = authEmail(kind);
      expect(email.html).toContain("The Unica Learning team");
      expect(email.html).toContain("16557 87A Ave");
      expect(email.html).toContain('href="mailto:savar.gupta1922@gmail.com"');
      expect(email.html).not.toMatch(/Reply to this email|unsubscribe/i);
      expect(email.html).not.toMatch(/<script|<form|<link|<img/);
      expect(readFileSync(`supabase/templates/${kind}.html`, "utf8")).toBe(email.html);
    }
  });
});
