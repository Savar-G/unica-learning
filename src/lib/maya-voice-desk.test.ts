import { describe, expect, it } from "vitest";
import { familyZone, localDateTime } from "@/lib/family-time";
import type { CallView } from "@/lib/maya-call";
import { deskVoiceCall, VOICE_MIN_START_SECONDS, VOICE_WEEK_SECONDS, voiceCallLimitMs, voiceSwitchOpen, voiceUsage, voiceUsedSeconds, voiceWeekLeft } from "@/lib/maya-voice-desk";

// A child's weekly voice time from the family desk: 30 minutes a week, a new call needs a minute, and the call's own limit
// is the time left when that is under the normal 10 minutes.

describe("the voice week", () => {
  it("is 30 minutes, and the time left never goes below 0", () => {
    expect(VOICE_WEEK_SECONDS).toBe(1800);
    expect(voiceWeekLeft(0)).toBe(1800);
    expect(voiceWeekLeft(600.9)).toBe(1200);
    expect(voiceWeekLeft(1800)).toBe(0);
    expect(voiceWeekLeft(5000)).toBe(0);
    expect(voiceWeekLeft(-10)).toBe(1800);
  });

  it("gives a new call at most the normal 10 minutes, or the time left", () => {
    expect(voiceCallLimitMs(1800)).toBe(600_000);
    expect(voiceCallLimitMs(601)).toBe(600_000);
    expect(voiceCallLimitMs(600)).toBe(600_000);
    expect(voiceCallLimitMs(599)).toBe(599_000);
    expect(voiceCallLimitMs(125.7)).toBe(125_000);
  });

  it("refuses a new call when less than a minute is left", () => {
    expect(VOICE_MIN_START_SECONDS).toBe(60);
    expect(voiceCallLimitMs(60)).toBe(60_000);
    expect(voiceCallLimitMs(59)).toBeNull();
    expect(voiceCallLimitMs(0)).toBeNull();
    expect(voiceCallLimitMs(Number.NaN)).toBeNull();
    expect(voiceCallLimitMs(voiceWeekLeft(1741))).toBeNull();
    expect(voiceCallLimitMs(voiceWeekLeft(1740))).toBe(60_000);
  });

  it("counts an ended call by its connected seconds and a live call as fully used", () => {
    expect(voiceUsedSeconds([])).toBe(0);
    expect(voiceUsedSeconds([{ status: "ended", connectedSeconds: 240 }, { status: "ended", connectedSeconds: null }, { status: "ended", connectedSeconds: 30.9 }])).toBe(270);
    // A live call with no known limit counts as the normal 10 minutes; with its own shorter limit, that one.
    expect(voiceUsedSeconds([{ status: "live", connectedSeconds: null }])).toBe(600);
    expect(voiceUsedSeconds([{ status: "live", connectedSeconds: 12, endAtMs: 150_000 }])).toBe(150);
    expect(voiceUsedSeconds([{ status: "live", connectedSeconds: null, endAtMs: 900_000 }])).toBe(600);
    expect(voiceUsedSeconds([{ status: "ended", connectedSeconds: 1200 }, { status: "live", connectedSeconds: null }])).toBe(1800);
  });

  it("shows the usage with the week's reset in the family's zone", () => {
    const zone = familyZone({ timeZone: "America/Vancouver", postal: null, province: "BC" });
    // Wednesday 2026-11-11 in Vancouver: the week resets on Monday 2026-11-16 at 00:00 family time (the zone's own offset,
    // with the app's dated overrides, so the expected instant comes from the same family-time rule).
    const u = voiceUsage(1500, Date.UTC(2026, 10, 11, 20), zone);
    expect(u).toMatchObject({ usedSeconds: 1500, leftSeconds: 300, limitSeconds: 300, resetsAt: new Date(localDateTime("2026-11-16", zone)).toISOString(), zone });
    expect(voiceUsage(0, Date.UTC(2026, 10, 11, 20), zone)).toMatchObject({ leftSeconds: 1800, limitSeconds: 600 });
    expect(voiceUsage(9999, Date.UTC(2026, 10, 11, 20), zone)).toMatchObject({ usedSeconds: 9999, leftSeconds: 0, limitSeconds: 0 });
  });

  it("resets at the next Monday in the family's zone, not in UTC", () => {
    const zone = familyZone({ timeZone: "America/Toronto", postal: null, province: "ON" });
    // Sunday 2026-11-15 23:30 Toronto is Monday 04:30 UTC: still the old week there, so it resets in half an hour (05:00 UTC).
    expect(voiceUsage(0, Date.UTC(2026, 10, 16, 4, 30), zone).resetsAt).toBe("2026-11-16T05:00:00.000Z");
    // Half an hour later it is the new week: the reset is the Monday after.
    expect(voiceUsage(0, Date.UTC(2026, 10, 16, 5, 30), zone).resetsAt).toBe("2026-11-23T05:00:00.000Z");
  });
});

describe("the voice switch", () => {
  it("is open to a test family always, and to another family only when the value is exactly on", () => {
    for (const value of [undefined, "", "off", "ON", "true", "1", " on", "on "]) {
      expect(voiceSwitchOpen({ test: true }, { MAYA_VOICE_ENABLED: value })).toBe(true);
      expect(voiceSwitchOpen({ test: false }, { MAYA_VOICE_ENABLED: value })).toBe(false);
    }
    expect(voiceSwitchOpen({ test: false }, { MAYA_VOICE_ENABLED: "on" })).toBe(true);
  });
});

describe("what the child's screen gets", () => {
  it("is the chat's child-safe view with the state of the voice call, and no diagnostics", () => {
    const view = {
      id: "call", kind: "family", mode: "voice", status: "live", revision: 3, startedAt: null,
      question: { source: "workbook", workbookId: "book", page: 1, question: 1 },
      transcript: [{ speaker: "maya", text: "Hi.", second: 1 }, { speaker: "note", text: "internal", second: 2 }], batches: [],
      outcome: null, model: { id: "secret-model", fake: false, promptVersion: "v" }, technicalNotes: ["detail"], flag: null, alerts: [],
    } as unknown as CallView;
    const shown = deskVoiceCall(view);
    expect(shown).toMatchObject({ id: "call", revision: 3, ended: false, mode: "voice", started: false, status: "live", hint: 0, safetyMessage: null });
    expect(shown.transcript).toEqual([{ speaker: "maya", text: "Hi.", second: 1 }]);
    expect(shown.question).toEqual(view.question);
    expect(JSON.stringify(shown)).not.toMatch(/secret-model|detail|internal|alerts/);
  });
});
