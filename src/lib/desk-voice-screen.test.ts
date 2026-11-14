import { expect, it } from "vitest";
import {
  afterCallLine, boardOfSnapshot, leftWhileLive, MIC_LINE, roomErrorLine, startErrorLine, voiceLeftLine, voiceScreen, voiceWeekUsed, voiceWeekUsedLine,
  type RoomPhase, type VoiceFlow,
} from "@/lib/desk-voice-screen";
import { MAYA_NOTICE_DESK_LINE } from "@/lib/maya-notice";

const screen = (flow: VoiceFlow, phase: RoomPhase = "ready", more: { callEnded?: boolean; hungUp?: boolean; error?: string | null } = {}) =>
  voiceScreen({ flow, phase, callEnded: false, hungUp: false, error: null, ...more });

it("shows the screen of the flow until a call is under way, whatever the room says", () => {
  for (const phase of ["ready", "live", "failed", "ended"] as const) {
    expect(screen("idle", phase)).toBe("idle");
    expect(screen("mic", phase)).toBe("mic");
    expect(screen("starting", phase)).toBe("starting");
    expect(screen("after", phase)).toBe("after");
  }
});

it("follows the room's phase in a call", () => {
  expect(screen("call", "ready")).toBe("connecting");
  expect(screen("call", "connecting")).toBe("connecting");
  expect(screen("call", "waiting")).toBe("joining");
  expect(screen("call", "live")).toBe("live");
  expect(screen("call", "ending")).toBe("ending");
  expect(screen("call", "failed")).toBe("retry");
});

it("shows the end as soon as the worker or the saved call says so, even over a failed room", () => {
  expect(screen("call", "ended")).toBe("after");
  expect(screen("call", "failed", { callEnded: true })).toBe("after");
  expect(screen("call", "live", { callEnded: true })).toBe("after");
  // A new ticket for a call that is already over.
  expect(screen("call", "failed", { error: "ended" })).toBe("after");
});

it("shows Hanging up from the hang-up tap until the saved call ends, not a failed connection", () => {
  expect(screen("call", "failed", { hungUp: true })).toBe("ending");
  expect(screen("call", "live", { hungUp: true })).toBe("ending");
  expect(screen("call", "failed", { hungUp: true, callEnded: true })).toBe("after");
});

it("says the minutes left in whole minutes, in the singular for one", () => {
  expect(voiceLeftLine(12 * 60)).toBe("12 minutes left this week");
  expect(voiceLeftLine(12 * 60 + 59)).toBe("12 minutes left this week");
  expect(voiceLeftLine(60)).toBe("1 minute left this week");
  expect(voiceLeftLine(1800)).toBe("30 minutes left this week");
});

it("says nothing about minutes below one minute, and the week counts as used", () => {
  expect(voiceLeftLine(59)).toBeNull();
  expect(voiceLeftLine(0)).toBeNull();
  expect(voiceLeftLine(-5)).toBeNull();
  expect(voiceWeekUsed({ leftSeconds: 59 })).toBe(true);
  expect(voiceWeekUsed({ leftSeconds: 60 })).toBe(false);
  expect(voiceWeekUsed(null)).toBe(false);
});

it("counts the minutes down while a call is live, and never below zero", () => {
  expect(leftWhileLive({ leftSeconds: 600 }, 0)).toBe(600);
  expect(leftWhileLive({ leftSeconds: 600 }, 125)).toBe(475);
  expect(leftWhileLive({ leftSeconds: 100 }, 400)).toBe(0);
  expect(leftWhileLive({ leftSeconds: 600 }, -3)).toBe(600);
});

it("names the weekday the voice week starts again, in the family's zone", () => {
  // Monday 00:00 in Vancouver is Monday 08:00 UTC (PST), so a UTC reading would say Monday as well; use a time that differs by day.
  const resetsAt = "2026-11-17T03:00:00.000Z";
  expect(voiceWeekUsedLine({ resetsAt, zone: "America/Vancouver" })).toBe("You've used Maya's call time for this week. She'll be back on Monday.");
  expect(voiceWeekUsedLine({ resetsAt, zone: "America/Toronto" })).toBe("You've used Maya's call time for this week. She'll be back on Monday.");
  expect(voiceWeekUsedLine({ resetsAt, zone: "Pacific/Auckland" })).toBe("You've used Maya's call time for this week. She'll be back on Tuesday.");
});

it("says a general day when the reset time or the zone cannot be read", () => {
  expect(voiceWeekUsedLine({ resetsAt: "not a time", zone: "America/Vancouver" })).toBe("You've used Maya's call time for this week. She'll be back next week.");
  // An unknown zone falls back to the family rule's default; it never throws.
  expect(voiceWeekUsedLine({ resetsAt: "2026-11-17T03:00:00.000Z", zone: "Not/AZone" })).toMatch(/She'll be back (on \w+day|next week)\.$/);
});

it("gives each refusal of a start its own plain line, and a general one for any other", () => {
  const usage = { resetsAt: "2026-11-17T03:00:00.000Z", zone: "America/Vancouver" };
  expect(startErrorLine("notice_required", usage)).toBe(MAYA_NOTICE_DESK_LINE);
  expect(startErrorLine("voice_week_used", usage)).toBe(voiceWeekUsedLine(usage));
  expect(startErrorLine("voice_week_used", null)).toBe("You've used Maya's call time for this week.");
  expect(startErrorLine("not_found", usage)).toBe(startErrorLine("invalid_question", usage));
  const lines = new Set(["notice_required", "voice_week_used", "not_found", "cap", "unavailable", undefined, "something_new"].map((c) => startErrorLine(c, usage)));
  expect(lines.size).toBe(6);
  expect(startErrorLine("something_new", usage)).toBe(startErrorLine(undefined, usage));
});

it("turns every room code into a line, and any unknown code into a connection line", () => {
  expect(roomErrorLine(null)).toBeNull();
  for (const code of ["technical_issue", "disconnected", "no_maya", "failed", "voice_unavailable", "ended"]) expect(roomErrorLine(code)).toBeTruthy();
  expect(roomErrorLine("could not establish pc connection")).toBe(roomErrorLine("connect"));
  expect(roomErrorLine("no_maya")).not.toBe(roomErrorLine("connect"));
});

it("keeps every child line plain: no dash, no provider name, no id", () => {
  const usage = { resetsAt: "2026-11-17T03:00:00.000Z", zone: "America/Vancouver" };
  const lines = [
    ...Object.values(MIC_LINE),
    ...["notice_required", "voice_week_used", "not_found", "cap", "unavailable", "x"].map((c) => startErrorLine(c, usage)),
    ...["technical_issue", "disconnected", "no_maya", "failed", "voice_unavailable", "ended", "connect"].map((c) => roomErrorLine(c)!),
    afterCallLine(null), voiceLeftLine(600)!,
  ];
  for (const line of lines) {
    expect(line).not.toMatch(new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`));
    expect(line).not.toMatch(/livekit|assemblyai|inworld|inference|worker|token|error|[0-9a-f]{8}-/i);
  }
});

it("closes a call with the call's safety message when it has one", () => {
  expect(afterCallLine({ safetyMessage: "Please tell a grown-up." })).toBe("Please tell a grown-up.");
  expect(afterCallLine({ safetyMessage: null })).toBe(afterCallLine(null));
});

const sum = (id: string) => ({
  kind: "batch" as const,
  batchId: id,
  commands: [{ op: "columns", id, operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }],
});

it("draws Maya's board from the browser's snapshot: one step for each batch, in order", () => {
  const one = boardOfSnapshot({ events: [sum("a")] });
  expect(one?.steps).toHaveLength(1);
  expect(one!.steps[0].drawn.length).toBeGreaterThan(0);
  // Events that are not batches (the child's ink, presentation marks) add no step.
  const more = boardOfSnapshot({ events: [sum("a"), { kind: "presented", batchId: "a" }, sum("b")] });
  expect(more?.steps).toHaveLength(2);
});

it("keeps an empty board empty, and gives null for a batch the board cannot apply", () => {
  expect(boardOfSnapshot({ events: [] })?.steps).toEqual([]);
  const missing = { kind: "batch" as const, batchId: "x", commands: [{ op: "put", target: { objectId: "nope", part: "cell", rowId: "answer", column: "ones" }, value: "3" }] };
  expect(boardOfSnapshot({ events: [missing] })).toBeNull();
});
