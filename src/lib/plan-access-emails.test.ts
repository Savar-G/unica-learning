import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dueWeeklyEmails } from "@/lib/maya-weekly-email";

// Opening the plan gate makes no email due. Every file that sends or builds an email is listed by what it imports, and none
// may read the gate or a gate built on it. The gate's own consumers send none. The one plan start confirmation stays in the
// start route, the webhook and the sweep (workbook-email-server.ts), and it was there before the gate.
const GATES = /from "@\/lib\/(plan-access|maya-chat-server|maya-notice-server)"|\b(parentDashboardAccess|scanPagesAccess|scanChildAccess|familyPlanAccess|childPlanAccess|familyOpenPlanChildren|planManagementAccess|chatAccess|chatGate)\b/;
const senders = execFileSync("rg", ["-l", "--glob", "!*.test.*", "--glob", "!*-memory.ts", "@/lib/email-delivery|email-delivery\"|sendPlanStartEmail|resendTransport", "src"], { encoding: "utf8" }).trim().split("\n");

describe("no email reads the plan gate", () => {
  it("finds the email senders", () => {
    for (const file of ["src/lib/reminder-store.ts", "src/lib/maya-weekly-email.ts", "src/lib/monthly-summary-email-store.ts", "src/lib/workbook-scan-reminder-send.ts", "src/lib/card-sweep-server.ts", "src/lib/scan-link.ts", "src/app/api/reminders/route.ts"]) expect(senders).toContain(file);
  });

  // Routes that act on one parent's own request: the parent presses a button and gets the one email it names, or the email goes to the team.
  const ON_REQUEST = new Set([
    "src/app/api/account/children/[id]/delete/code/route.ts", // The delete code, to the parent who asked.
    "src/app/api/account/family/delete/code/route.ts", // The delete code, to the parent who asked.
    "src/lib/family-delete-server.ts", // The team's alert.
    "src/lib/parent-plan-server.ts", // The team's cancel alert. Never reads the gate.
  ]);
  it.each(senders.filter((file) => !ON_REQUEST.has(file)))("%s reads no gate", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(GATES);
  });

  it("the monthly summary reads the dashboard's switch, never the gate", () => {
    const source = readFileSync("src/lib/monthly-summary-email-store.ts", "utf8");
    expect(source).toContain("dashboardSwitchOpen(");
    expect(source).not.toMatch(/parentDashboardAccess\(|plan-access/);
  });

  it("the weekly recap is not due with no call: an open plan alone does not make it due", () => {
    const parent = { id: "p1", name: "Sample", email: "family@synthetic.invalid", postal: null };
    const now = Date.parse("2026-11-09T16:00:00Z");
    expect(dueWeeklyEmails({ parents: [parent], children: [{ id: "c1", parentId: "p1", firstName: "Sample" }], notes: [], calls: [], log: [] }, now)).toEqual([]);
  });
});
