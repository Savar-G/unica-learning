import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dueWeeklyEmails, type WeeklyState } from "@/lib/maya-weekly-email";
import type { CallNote } from "@/lib/maya-call-note";

// What this proves: no email sender, and no module a sender imports, reaches a module that holds a gate, except the edges named
// below. A sender is a file that imports a delivery module or calls Resend's address itself. It does not walk up to the routes
// that call a sender: a route can sit behind a gate and call one, as the scan link's route does, which is asserted on its own.
//
// The one allowed exception, for an email no one asked for: the monthly summary imports only `dashboardSwitchOpen` from
// parent-dashboard-access.ts, the dashboard's switch with no plan (its own test: parent-dashboard-access.test.ts).
//
// Three emails only a signed-in parent's own press sends sit behind the gate, and each goes to that parent: the two delete codes
// (behind planManagementAccess, so a closed family can leave) and "Email me the link" (the route's scanSession reads
// scanPagesAccess, and the sender itself reads no gate). Opening a plan sends none of them.

/** Every module that holds a gate function, or reads one to decide who gets a page or a chat. */
const GATE_MODULES = new Set([
  "src/lib/plan-access.ts", // childPlanAccess, familyPlanAccess, familyOpenPlanChildren, familyHasPlanHistory, familyClosedPlan
  "src/lib/parent-dashboard-access.ts", // parentDashboardAccess, planManagementAccess
  "src/lib/parent-dashboard-server.ts", // parentDashboard()
  "src/lib/parent-view-server.ts", // parentViewReader().switches()
  "src/lib/scan-pages-access.ts", // scanPagesAccess, scanChildAccess
  "src/lib/scan-photo-server.ts", // scanSession
  "src/lib/maya-chat-server.ts", // chatAccess, chatGate
  "src/lib/maya-notice-server.ts", // mayaNoticeDue
  "src/lib/parent-problem-explanation-server.ts", // explanationPlanOpen
  "src/lib/desk-chat-request.ts",
  "src/lib/plan-control-request.ts",
  "src/components/plan-closed-note.tsx",
]);

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join("src", spec.slice(2)) : spec.startsWith(".") ? path.join(path.dirname(from), spec) : null;
  if (!base) return null;
  return [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base].find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

/** The code imports of a file, with the names taken. `import type` carries no code. A dynamic import is named "dynamic". */
function imports(file: string): { to: string; names: string }[] {
  const source = readFileSync(file, "utf8");
  const found: { to: string; names: string }[] = [];
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:([^;'"]*?)\s+from\s+)?["']([^"']+)["']/g)) {
    const to = m[1] ? null : resolve(file, m[3]);
    if (to) found.push({ to, names: (m[2] ?? "").replace(/\s+/g, " ").trim() });
  }
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    const to = resolve(file, m[1]);
    if (to) found.push({ to, names: "dynamic" });
  }
  return found;
}

/** Each edge from a file reachable from `start` into a gate module. It does not walk on through a gate module. */
function gateEdges(start: string): string[] {
  const seen = new Set([start]), queue = [start], edges = new Set<string>();
  while (queue.length) {
    const file = queue.shift()!;
    for (const { to, names } of imports(file)) {
      if (GATE_MODULES.has(to)) edges.add(`${file} -> ${to} ${names}`);
      else if (!seen.has(to)) { seen.add(to); queue.push(to); }
    }
  }
  return [...edges];
}

const DELIVERY = new Set(["src/lib/email-delivery.ts", "src/lib/email-resend.ts", "src/lib/workbook-email-server.ts"]);

/** A file that sends email: it imports a delivery module (`import type` too: a transport passed in is still a send), or fetches Resend's address. */
function sends(file: string, source: string): boolean {
  if (/\bfetch\(\s*["'`]https:\/\/api\.resend\.com/.test(source)) return true;
  for (const m of source.matchAll(/(?:\bfrom\s+|\bimport\s+|\bimport\(\s*)["']([^"']+)["']/g)) {
    const to = resolve(file, m[1]);
    if (to && DELIVERY.has(to)) return true;
  }
  return false;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !/-memory\.ts$/.test(entry.name) ? [file] : [];
  });
}

const senders = sourceFiles("src").filter((file) => !["src/lib/email-delivery.ts", "src/lib/email-resend.ts"].includes(file) && sends(file, readFileSync(file, "utf8")));

const MONTHLY = 'src/lib/monthly-summary-email-store.ts -> src/lib/parent-dashboard-access.ts { dashboardSwitchOpen }';
/** The edges each sender may have. Anything else fails. */
const ALLOWED: Record<string, string[]> = {
  "src/lib/monthly-summary-email-store.ts": [MONTHLY],
  "src/app/api/reminders/route.ts": [MONTHLY],
  "src/app/api/account/family/delete/code/route.ts": ["src/app/api/account/family/delete/code/route.ts -> src/lib/parent-dashboard-access.ts { planManagementAccess }"],
  "src/app/api/account/children/[id]/delete/code/route.ts": ["src/app/api/account/children/[id]/delete/code/route.ts -> src/lib/parent-dashboard-access.ts { planManagementAccess }"],
};

describe("no email sender reaches the plan gate", () => {
  it("finds a sender by an alias import, a relative import, a type import, a dynamic import and a direct fetch; a mention alone is no send", () => {
    for (const source of [
      'import { sendEmail } from "@/lib/email-delivery";',
      'import { sendEmail } from "./email-delivery";',
      'import { sendEmail } from "../lib/email-delivery";',
      'import type { MailTransport } from "./email-delivery";',
      'const { resendTransport } = await import("./email-resend");',
      'import { sendPlanStartEmail } from "./workbook-email-server";',
      'await fetch("https://api.resend.com/emails", { method: "POST" });',
    ]) expect(sends("src/lib/any.ts", source), source).toBe(true);
    for (const source of ['// The Resend address is https://api.resend.com/emails.', 'import { x } from "./email-copies";']) expect(sends("src/lib/any.ts", source), source).toBe(false);
  });

  it("finds the team alert in the signup route, which calls Resend directly and reads no gate", () => {
    expect(senders).toContain("src/app/api/signup/route.ts");
    expect(gateEdges("src/app/api/signup/route.ts")).toEqual([]);
  });

  it("finds the senders of the /api/reminders run, the start, the sweep and the parent's presses", () => {
    for (const file of ["src/app/api/reminders/route.ts", "src/lib/reminder-store.ts", "src/lib/maya-weekly-email.ts", "src/lib/maya-weekly-email-store.ts", "src/lib/monthly-summary-email-store.ts", "src/lib/workbook-scan-reminder-send.ts", "src/lib/workbook-scan-maintenance-server.ts", "src/lib/card-sweep-server.ts", "src/lib/workbook-email-server.ts", "src/lib/scan-link.ts", "src/lib/report-job.ts", "src/app/api/admin/cards/[id]/start/route.ts"]) expect(senders).toContain(file);
  });

  it.each(senders)("%s", (file) => {
    expect(gateEdges(file)).toEqual(ALLOWED[file] ?? []);
  });

  it("the monthly summary's exception names only the switch, which reads no plan", () => {
    const edges = imports("src/lib/monthly-summary-email-store.ts").filter((i) => i.to === "src/lib/parent-dashboard-access.ts");
    expect(edges.map((e) => e.names)).toEqual(["{ dashboardSwitchOpen }"]);
    const source = readFileSync("src/lib/parent-dashboard-access.ts", "utf8");
    const body = source.slice(source.indexOf("export async function dashboardSwitchOpen"), source.indexOf("/** Server-only gate of the dashboard"));
    expect(body).toContain("markedFamily(parent, db, signal)");
    expect(body).not.toMatch(/familyPlanAccess|childPlanAccess|familyHasPlanHistory|parentDashboardAccess/);
  });

  it("the walk finds a gate when one is there: a gate read through another module, and the scan link's route", () => {
    expect(gateEdges("src/lib/plan-control-request.ts").join("\n")).toContain("src/lib/parent-dashboard-access.ts { planManagementAccess }");
    expect(gateEdges("src/app/api/account/scan-link/route.ts")).toEqual(["src/app/api/account/scan-link/route.ts -> src/lib/scan-photo-server.ts { scanJson, scanSession }"]);
    expect(gateEdges("src/lib/scan-link.ts")).toEqual([]);
    expect(gateEdges("src/app/(product)/account/(dashboard)/settings/page.tsx").length).toBeGreaterThan(0);
  });
});

describe("the weekly recap", () => {
  const parent = { id: "p1", name: "Sample", email: "parent@family.ca", timeZone: "America/Vancouver", postal: null };
  const child = { id: "c1", parentId: "p1", firstName: "Leo" };
  const endedAt = "2026-11-09T00:00:00Z", monday = Date.parse("2026-11-09T16:00:00Z");
  const note = { callId: "call-1", parentId: "p1", childId: "c1", noteVersion: 1, callEndedAt: endedAt, createdAt: endedAt,
    facts: { question: { source: "workbook", page: 23, number: 4, text: null }, finished: "with_help", reason: "solved", help: "hint", stuckOn: "adding the tens", safety: null },
    sentences: ["{child} worked on page 23, question 4."], warm: null, writer: "code", model: null, promptVersion: null, transcript: [] } as unknown as CallNote;
  const finished = { callId: "call-1", parentId: "p1", childId: "c1", endedAt, notePending: false, kind: "chat" };
  const state: WeeklyState = { parents: [parent], children: [child], notes: [note], calls: [finished], log: [] };

  // A recap depends on a finished call, not on the gate. Its state has no plan and no access field, so an open plan alone makes
  // nothing due, and a closed plan does not stop a recap of a call that finished. A real recap can go only after a real plan
  // exists, a parent agreed to the Maya notice (which promises the recap) and a child chatted.
  it("is due for a finished call, whatever the plan: the rule reads no plan", () => {
    expect(dueWeeklyEmails(state, monday).map((d) => d.parentId)).toEqual(["p1"]);
    expect(Object.keys(state).sort()).toEqual(["calls", "children", "log", "notes", "parents"]);
  });
  it("is not due with no finished call: an open plan alone makes nothing due", () => {
    expect(dueWeeklyEmails({ ...state, notes: [], calls: [] }, monday)).toEqual([]);
  });
  it("its store reaches no gate", () => {
    expect(gateEdges("src/lib/maya-weekly-email-store.ts")).toEqual([]);
  });
});
