import { describe, expect, it, vi } from "vitest";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { pacedTransport } from "@/lib/email-delivery";
import { runScanTeamEmail, scanTeamEmail } from "@/lib/scan-team-email";
import { memoryScanTeamEmailStore } from "@/lib/scan-team-email-memory";

vi.mock("server-only", () => ({}));

// The team's daily email (#718) through its public run and store seam.
const ORIGIN = "https://unicalearning.com";
const TO = "team@unicalearning.com";
/** 2026-11-<day> at hh:mm in Vancouver (permanent PDT, UTC-7, as the family time rules have it). */
const pst = (day: number, hh: number, mm = 0) => Date.UTC(2026, 10, day, hh + 7, mm);

function setup(waiting: number) {
  const mail = memoryTransport();
  const db = memoryScanTeamEmailStore(waiting);
  const run = (now: number, to: string | null = TO) => runScanTeamEmail(db.store, now, { enabled: "on", to, origin: ORIGIN, transport: mail.transport });
  return { mail, db, run };
}

describe("the team's daily scan email", () => {
  it("is off unless SCAN_TEAM_EMAIL_ENABLED is exactly on: no read, no claim, no email", async () => {
    for (const enabled of [undefined, null, "", "true", "ON", " on"]) {
      const { mail, db } = setup(3);
      expect(await runScanTeamEmail(db.store, pst(13, 9), { enabled, to: TO, origin: ORIGIN, transport: mail.transport })).toEqual({ status: "off" });
      expect(mail.delivered).toHaveLength(0);
      expect(db.days.size).toBe(0);
    }
  });
  it("claims nothing when a reminders run has no time for a complete send", async () => {
    const { mail, db } = setup(3), start = pst(13, 9);
    const count = vi.spyOn(db.store, "waitingCount");
    expect(await runScanTeamEmail(db.store, start, { enabled: "on", to: TO, origin: ORIGIN, transport: mail.transport,
      time: { now: () => start + 55_000, endAt: start + 55_000 } })).toMatchObject({ status: "out_of_time" });
    expect(count).not.toHaveBeenCalled();
    expect(db.days.size).toBe(0); expect(mail.delivered).toHaveLength(0);
  });

  it("stops waiting for a stalled count without claiming or sending", async () => {
    vi.useFakeTimers();
    try {
      const { mail, db } = setup(3), start = pst(13, 9); vi.setSystemTime(start);
      db.store.waitingCount = async () => new Promise<number>(() => {});
      const result = runScanTeamEmail(db.store, start, { enabled: "on", to: TO, origin: ORIGIN, transport: mail.transport,
        time: { now: () => Date.now(), endAt: start + 55_000 } });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await result).toMatchObject({ status: "out_of_time" });
      expect(db.days.size).toBe(0); expect(mail.delivered).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });

  it("returns the claim when pacing leaves too little time for the request", async () => {
    vi.useFakeTimers();
    try {
      const { db } = setup(3), start = pst(13, 9); vi.setSystemTime(start);
      const delivered: string[] = [];
      const transport = pacedTransport({ send: async (m) => { delivered.push(m.subject); return { status: "sent", emailId: "test" }; } }, 40_000);
      await transport.send({ sender: { to: "savar" }, to: TO, subject: "Other reminder", text: "Other reminder" });
      const result = runScanTeamEmail(db.store, start, { enabled: "on", to: TO, origin: ORIGIN, transport,
        time: { now: () => Date.now(), endAt: start + 55_000 } });
      await vi.advanceTimersByTimeAsync(40_000);
      expect(await result).toMatchObject({ status: "out_of_time" });
      expect(db.days.size).toBe(0); expect(delivered).toEqual(["Other reminder"]);
    } finally { vi.useRealTimers(); }
  });

  it("sends nothing when no answer waits", async () => {
    const { mail, db, run } = setup(0);
    expect((await run(pst(13, 9))).status).toBe("none_waiting");
    expect(mail.delivered).toHaveLength(0);
    expect(db.days.size).toBe(0);
  });

  it("sends nothing before 8 a.m. Pacific, then sends at 8", async () => {
    const { mail, run } = setup(3);
    expect((await run(pst(13, 7, 59))).status).toBe("too_early");
    expect(mail.delivered).toHaveLength(0);
    expect((await run(pst(13, 8))).status).toBe("sent");
    expect(mail.delivered).toHaveLength(1);
  });

  it("sends one email a day, however many runs", async () => {
    const { mail, db, run } = setup(4);
    expect((await run(pst(13, 8))).status).toBe("sent");
    expect((await run(pst(13, 8, 15))).status).toBe("already_sent");
    expect((await Promise.all([run(pst(13, 9)), run(pst(13, 9))])).map((r) => r.status)).toEqual(["already_sent", "already_sent"]);
    expect(mail.delivered).toHaveLength(1);
    expect(mail.delivered[0]).toMatchObject({ to: TO, sender: { to: "savar" } });
    expect(mail.delivered[0].subject).toBe("4 answers are waiting for our team to mark");
    expect(db.days.get("2026-11-13")).toMatchObject({ state: "sent", waiting: 4, emailId: "email-1" });
    // The next team day sends again; a run just after midnight Pacific still belongs to the day before's end, and 8 a.m. starts the new day.
    expect((await run(pst(14, 8))).status).toBe("sent");
    expect(mail.delivered).toHaveLength(2);
  });

  it("a refused send gives the day back, so the next run tries again", async () => {
    const { mail, db, run } = setup(2);
    mail.answerNext("refuse");
    expect((await run(pst(13, 8))).status).toBe("refused");
    expect(db.days.size).toBe(0);
    expect((await run(pst(13, 8, 15))).status).toBe("sent");
    expect(mail.delivered).toHaveLength(1);
  });

  it("an unknown outcome keeps the claim, and nothing sends it again", async () => {
    const { mail, db, run } = setup(2);
    mail.answerNext("lose_answer");
    expect((await run(pst(13, 8))).status).toBe("unknown");
    expect(db.days.get("2026-11-13")?.state).toBe("claimed");
    expect((await run(pst(13, 8, 15))).status).toBe("already_sent");
    expect((await run(pst(13, 17))).status).toBe("already_sent");
    expect(mail.delivered).toHaveLength(1);
  });

  it("with no SIGNUP_NOTIFY_EMAIL, sends nothing, claims nothing and logs", async () => {
    const { mail, db, run } = setup(5);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await run(pst(13, 9), null)).status).toBe("no_address");
    expect((await run(pst(13, 9), "  ")).status).toBe("no_address");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("SIGNUP_NOTIFY_EMAIL"));
    log.mockRestore();
    expect(mail.delivered).toHaveLength(0);
    expect(db.days.size).toBe(0);
  });

  it("holds a count and the admin link only", async () => {
    const { mail, run } = setup(1);
    await run(pst(13, 8));
    const [email] = mail.delivered;
    expect(email.subject).toBe("1 answer is waiting for our team to mark");
    expect(email.text).toBe("1 answer is waiting for our team to mark.\n\nOpen the list: https://unicalearning.com/admin/scans");
    expect(email.html).toBeUndefined();
    expect(scanTeamEmail(7, ORIGIN).text).not.toMatch(/child|family|photo|page/i);
  });
});
