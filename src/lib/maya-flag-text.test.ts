import { describe, expect, it } from "vitest";
import { ALERT_TEXT, FLAG_TEXT, alertNote, modelName, noAlertNote } from "@/lib/maya-flag-text";

describe("the admin call page's flag text (#333)", () => {
  it("names each flag in plain words, the harmful request apart from a safety concern", () => {
    expect(FLAG_TEXT.unsafe_request).toBe("Child asked for harmful content");
    expect(FLAG_TEXT.safety_concern).toBe("Possible safety concern");
    expect(FLAG_TEXT.safety_immediate).toBe("Child may be in danger now");
  });

  it("says the alert email goes to the team", () => {
    expect(ALERT_TEXT.sent).toBe("Alert email sent to the team");
    expect(ALERT_TEXT.refused).toBe("Alert email not sent");
  });

  it("gives a plain next step for a failed or unsure send, never the provider's answer", () => {
    expect(alertNote("refused", false)).toBe("The email didn't send. Try again.");
    expect(alertNote("refused", true)).toBe("The email didn't send. The next turn tries again.");
    expect(alertNote("unknown", false)).toBe("We're not sure the email went. Check the inbox before sending again.");
    expect(alertNote("sent", false)).toBeNull();
    expect(alertNote("sending", true)).toBeNull();
    const shown = [...Object.values(FLAG_TEXT), ...Object.values(ALERT_TEXT), alertNote("refused", false), alertNote("unknown", true), noAlertNote(true), noAlertNote(false)];
    for (const text of shown) expect(text).not.toMatch(/resend|answered|\d{3}|signup_notify/i);
  });
});

describe("the admin Maya pages' model name", () => {
  it("says Scripted for the rule player and AI with a plain name for a model id", () => {
    expect(modelName({ id: "fake", fake: true })).toBe("Scripted");
    expect(modelName({ id: "anthropic/claude-sonnet-5.5", fake: false })).toBe("AI (Claude Sonnet 5.5)");
    expect(modelName({ id: "openai/gpt-6", fake: false })).toBe("AI (GPT 6)");
    expect(modelName({ id: "", fake: false })).toBe("AI");
  });
});
