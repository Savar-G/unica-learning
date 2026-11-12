import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PHRASES, TEMPLATES } from "@/lib/maya";
import { OK_TALK } from "@/lib/maya/talk-review";

// Savar approved the #698 fix-round lines on 2026-11-08 ("approve maya lines"), exactly as worded in
// docs/maya-practice-lines.md. These tests pin the code to those exact texts, so a later change to any of them fails here
// and needs his approval again (D-202).

const DOC = readFileSync(join(process.cwd(), "docs/maya-practice-lines.md"), "utf8").replace(/\r\n/g, "\n");

/** The rows of the first table after a heading, as cells. */
function table(heading: string): string[][] {
  const at = DOC.indexOf(heading);
  expect(at, heading).toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  let started = false;
  for (const line of DOC.slice(at).split("\n").slice(1)) {
    if (line.startsWith("|")) {
      started = true;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (!/^-+$/.test(cells[0]) && !/^(Id|Id or location)$/.test(cells[0])) rows.push(cells);
    } else if (started) break;
  }
  return rows;
}

const unticked = (id: string) => id.replace(/`/g, "");

describe("lines Savar approved on 2026-11-08 (#698 fix round)", () => {
  it("are marked approved in the doc", () => {
    expect(DOC).toContain("## Approved, #698 fix round 2026-11-08\n");
    expect(DOC).toContain("## Approved, #698 fix round 2026-11-08 (no feeling claims)\n");
    expect(DOC).not.toMatch(/## Pending Savar, #698 fix round/);
  });

  it("close.stuck: the honest close, exactly", () => {
    const rows = table("### The honest close after help alone");
    expect(rows.map((r) => r[0])).toEqual(["close.stuck.0", "close.stuck.1", "close.stuck.2", "close.stuck.3", "close.stuck.4"]);
    expect(TEMPLATES["close.stuck"]).toEqual(rows.map((r) => r[1]));
    expect(TEMPLATES["close.stuck"][0]).toBe("This one is hard, and it's okay to stop. Try the easier one on paper, or ask a grown-up for help.");
  });

  it("check.method.down and check.method.up: the child's method named back, exactly", () => {
    const rows = table("### The child's own method, named back");
    const of = (key: string) => rows.filter((r) => r[0].startsWith(`${key}.`)).map((r) => r[1]);
    expect(of("check.method.down")).toHaveLength(5);
    expect(of("check.method.up")).toHaveLength(5);
    expect(TEMPLATES["check.method.down"]).toEqual(of("check.method.down"));
    expect(TEMPLATES["check.method.up"]).toEqual(of("check.method.up"));
  });

  it("held.cannot.0: the short wording, exactly", () => {
    const rows = table("### New held line (D-327)");
    expect(rows.map((r) => unticked(r[0]))).toEqual(["held.cannot.0"]);
    expect(TEMPLATES["held.cannot"]).toEqual([rows[0][2]]);
    expect(TEMPLATES["held.cannot"]).toEqual(["Sorry, I can't teach this question yet."]);
  });

  it("the feeling rewrites, closing.14 and the two OK_TALK examples, exactly", () => {
    const rows = table("## Approved, #698 fix round 2026-11-08 (no feeling claims)");
    const okTalk = OK_TALK.map((o) => o.line);
    let phrases = 0;
    for (const [where, old, now] of rows) {
      if (where.startsWith("`OK_TALK`")) {
        expect(okTalk, now).toContain(now);
        expect(okTalk, old).not.toContain(old);
        continue;
      }
      const m = /^([a-z]+)\.(\d+)$/.exec(unticked(where));
      expect(m, where).not.toBeNull();
      const [group, n] = [m![1] as keyof typeof PHRASES, Number(m![2])];
      expect(PHRASES[group][n - 1], where).toBe(now);
      expect(PHRASES[group], `${where} old wording`).not.toContain(old);
      phrases += 1;
    }
    expect(phrases).toBe(34);
    expect(rows.filter((r) => r[0].startsWith("`OK_TALK`"))).toHaveLength(2);
  });

  it("the honest closes after help are the approved ones", () => {
    expect(TEMPLATES["close.together"]).toContain("We worked on {expr} together today.");
    expect(TEMPLATES["close.checked"]).toContain("Your answer for {expr} is right. Bye for now!");
  });
});
