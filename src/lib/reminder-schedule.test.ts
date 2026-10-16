import { describe, expect, it, vi } from "vitest";
import { nextStartReminder } from "@/lib/reminder-schedule";
import { dueReminders, type LogEntry, type ReminderState } from "@/lib/reminders";

vi.mock("server-only", () => ({}));

// The admin page's forecast (nextStartReminder) and the job (dueReminders) read the same schedule. Run the job every
// 15 minutes and check that each start reminder it sends is the one the forecast named, sent on the first run at or
// after the forecast time.
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 12, 18, 7);

function simulate(jobOff: (now: number) => boolean) {
  const base: ReminderState = { parents: [{ id: "p1", email: "priya@family.ca" }], children: [{ id: "c1", parentId: "p1", createdAt: T0 }], tests: [], log: [] };
  const log: LogEntry[] = [];
  const mismatches: string[] = [];
  const sentKinds: string[] = [];
  for (let now = T0; now <= T0 + 30 * DAY; now += 15 * MIN) {
    if (jobOff(now)) continue;
    const first = log.find((e) => e.kind === "start");
    const forecast = nextStartReminder(T0, { firstStartAt: first?.at ?? null, followup: log.some((e) => e.kind === "start_followup") }, now);
    for (const r of dueReminders({ ...base, log }, now)) {
      log.push({ id: `l${log.length}`, kind: r.kind, parentId: r.parentId, childId: r.childId, assessmentId: null, status: "sent", attempts: 1, at: now });
      sentKinds.push(r.kind);
      if (!forecast || forecast.kind !== r.kind || now < forecast.dueAt) mismatches.push(`${r.kind} at ${now - T0}: forecast ${JSON.stringify(forecast)}`);
    }
    // Nothing went although the forecast time passed: the forecast promised an email the job does not send.
    if (forecast && now >= forecast.dueAt && !log.some((e) => e.kind === forecast.kind && e.at === now)) mismatches.push(`no ${forecast.kind} at ${now - T0}`);
  }
  return { mismatches, sentKinds };
}

describe("the admin forecast of the next start reminder", () => {
  it("matches the job when the job runs every 15 minutes", () => {
    expect(simulate(() => false)).toEqual({ mismatches: [], sentKinds: ["start", "start_followup"] });
  });

  it("matches the job when the job was off for the first one", () => {
    expect(simulate((now) => now > T0 + 20 * HOUR && now < T0 + 80 * HOUR)).toEqual({ mismatches: [], sentKinds: ["start_followup"] });
  });

  it("matches the job when the first one went late", () => {
    expect(simulate((now) => now > T0 + 20 * HOUR && now < T0 + 70 * HOUR)).toEqual({ mismatches: [], sentKinds: ["start", "start_followup"] });
  });
});
