import { describe, expect, it } from "vitest";
import { ALERT_TEXT, FLAG_TEXT, alertNote, modelName, noAlertNote, safetyText } from "@/lib/maya-flag-text";

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

describe("an earlier alert and an older call's safety", () => {
  it("never asks to retry an alert that a newer flag replaced (R393-L2)", () => {
    expect(alertNote("refused", false, false)).toBe("The email didn't send. The newer alert for this call replaced it.");
    expect(alertNote("refused", true, false)).toBe("The email didn't send. The newer alert for this call replaced it.");
    expect(alertNote("unknown", false, false)).toBe("We're not sure the email went. Check the inbox.");
    expect(alertNote("sent", false, false)).toBeNull();
    for (const live of [true, false]) for (const status of ["refused", "unknown"] as const) expect(alertNote(status, live, false)).not.toMatch(/try again|tries again|sending again/i);
  });

  it("names immediate danger for a call saved with a severity and no flag (R393-L1)", () => {
    expect(safetyText(null, "immediate", true)).toBe("Child may be in danger now");
    expect(safetyText(null, "concern", true)).toBe("Possible safety concern");
    expect(safetyText(null, null, true)).toBe("Possible safety concern");
    expect(safetyText(null, null, false)).toBeNull();
    expect(safetyText("unsafe_request", null, false)).toBe("Child asked for harmful content");
    expect(safetyText("safety_concern", "immediate", true)).toBe("Possible safety concern");
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
