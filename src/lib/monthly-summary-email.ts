// The monthly summary email (#563, spec #544, D-248): one email per family per calendar month in family time, with a link
// to each child's Overview and no attachment. It names each child whose summary the Overview offers (the same rule,
// src/lib/monthly-summary-offer.ts) and says nothing about the child's results.
//   - Who: only a family the dashboard switch opens to (`dashboardOpen`, read by the store with parentDashboardAccess),
//     so no family gets a link to a page it cannot see. Test families and admins get it while the switch is off.
//   - When: from the 1st of the month at 7 a.m. family time to the end of the 7th. It names the month that just ended.
//   - Once: the send key is (parent, month), claimed in public.email_log. A refused send can retry up to MAX_SEND_ATTEMPTS
//     times; an unknown one stays claimed, and nothing sends it again.
//   - Its own unsubscribe, which stops only this email; no other unsubscribe stops it.
// The shared reminder job runs this through sendEmailOnce after the other emails, on the same spaced transport.
// Pure TypeScript apart from the delivery module: the store (src/lib/monthly-summary-email-store.ts) does the reads.
import { SUPPORT_EMAIL } from "@/lib/contact";
import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";
import { sendEmailOnce, type EmailMessage, type MailTransport, type SendLedger } from "@/lib/email-delivery";
import { addDays, addMonths, familyProvince, familyZone, formatCalendarDate, localDateTime, localMonth } from "@/lib/family-time";
import { firstDeliveryMonth, offeredSummaryMonth } from "@/lib/monthly-summary-offer";
import type { DeliveryCorrectionRecord, DeliveryRecord } from "@/lib/parent-view";
import { canGetEmail } from "@/lib/reminder-schedule";
import { MAX_SEND_ATTEMPTS, type LogStatus } from "@/lib/reminders";

/** The release hour on the 1st of the month, in the family's time zone. */
export const SEND_HOUR = 7;
/** A send slot ends this many days after the 1st: an email about last month that late helps no one. */
export const LATE_DAYS = 7;
/** Emails one run sends at most; the next run sends the rest. */
export const RUN_LIMIT = 20;

export interface MonthlyParent {
  id: string;
  name: string;
  email: string;
  /** The stored browser zone takes precedence over postal and province. */
  timeZone?: string | null;
  postal: string | null;
  /** The dashboard switch opens to this family (parentDashboardAccess). */
  dashboardOpen: boolean;
}

export interface MonthlyChild {
  id: string;
  parentId: string;
  firstName: string;
  province?: string | null;
  created_at?: string;
}

/** A row of public.email_log that this email reads. */
export interface MonthlyLogEntry {
  id: string;
  kind: "monthly_summary" | "monthly_summary_unsubscribe";
  parentId: string;
  /** The month the email names (YYYY-MM); null for an unsubscribe. */
  month: string | null;
  status: LogStatus | null;
  attempts: number;
}

/** What the decision reads. The store may pass more than it needs; every rule is checked here. */
export interface MonthlyState {
  parents: readonly MonthlyParent[];
  children: readonly MonthlyChild[];
  deliveries: readonly DeliveryRecord[];
  corrections: readonly DeliveryCorrectionRecord[];
  log: readonly MonthlyLogEntry[];
}

/** One email to send: the send key (parent, month) and the children it names. */
export interface DueMonthly {
  parentId: string;
  /** The month the email names, YYYY-MM in family time. */
  month: string;
  /** Oldest child first. */
  childIds: string[];
  /** A send that was refused before: the log row to take again. */
  retry: { logId: string; attempts: number } | null;
}

const oldestFirst = (a: MonthlyChild, b: MonthlyChild) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id);

// ---------- Who gets which email ----------

/** One email per parent and month, from the 1st at 7 a.m. to the end of the 7th, naming the children with an offer. */
export function dueMonthlyEmails(state: MonthlyState, now: number): DueMonthly[] {
  const off = new Set(state.log.filter((e) => e.kind === "monthly_summary_unsubscribe").map((e) => e.parentId));
  const due: DueMonthly[] = [];
  for (const parent of state.parents) {
    if (!parent.dashboardOpen || off.has(parent.id) || !canGetEmail(parent.email)) continue;
    const kids = state.children.filter((c) => c.parentId === parent.id).sort(oldestFirst);
    const zone = familyZone({ timeZone: parent.timeZone, postal: parent.postal, province: familyProvince(kids) });
    const thisMonth = localMonth(now, zone);
    const first = `${thisMonth}-01`;
    if (now < localDateTime(first, zone, SEND_HOUR) || now >= localDateTime(addDays(first, LATE_DAYS), zone)) continue;
    const month = addMonths(thisMonth, -1);
    const childIds = kids.filter((c) => offeredSummaryMonth(firstDeliveryMonth(state.deliveries, state.corrections, c.id, zone), now, zone) === month).map((c) => c.id);
    if (childIds.length === 0) continue;
    const logged = state.log.find((e) => e.kind === "monthly_summary" && e.parentId === parent.id && e.month === month);
    if (logged && (logged.status !== "failed" || logged.attempts >= MAX_SEND_ATTEMPTS)) continue;
    due.push({ parentId: parent.id, month, childIds, retry: logged ? { logId: logged.id, attempts: logged.attempts } : null });
  }
  return due.sort((a, b) => a.month.localeCompare(b.month) || a.parentId.localeCompare(b.parentId));
}

// ---------- The email ----------

export interface MonthlyEmailInput {
  parentName: string;
  /** YYYY-MM. */
  month: string;
  /** Each child with a summary, with the link to the child's Overview. */
  children: { name: string; url: string }[];
  unsubscribeUrl: string;
}

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);
const BUTTON = "#0c0c0e";
const INK_2 = "#44444c";

/** "Priya" from "Priya Shah"; empty for a blank name. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
/** "Leah", "Leah and Sam", "Leah, Sam and Ava". */
const joinNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** The monthly email: subject, text and HTML, with the CASL footer and the unsubscribe link. */
export function monthlyEmail(e: MonthlyEmailInput): { subject: string; text: string; html: string } {
  const names = e.children.map((c) => c.name);
  const monthName = formatCalendarDate(`${e.month}-01`, { month: "long" });
  const monthYear = formatCalendarDate(`${e.month}-01`, { month: "long", year: "numeric" });
  const several = e.children.length > 1;
  const subject = `${monthName} summary: ${joinNames(names)}`;
  const ready = several ? `The summaries for ${monthYear} are ready for ${joinNames(names)}.` : `${names[0]}'s summary for ${monthYear} is ready.`;
  const what = several
    ? "Each one is a single page on the child's month: the level, the workbooks and what comes next. You can print it or take it to a teacher meeting."
    : "It is a single page on the month: the level, the workbooks and what comes next. You can print it or take it to a teacher meeting.";
  const where = several ? "You can find each summary on the child's Overview page." : `You can find it on ${names[0]}'s Overview page.`;
  const paragraphs = [ready, what, where];
  const signIn = "If you are signed out, sign in first and the page opens.";
  const greeting = firstName(e.parentName) ? `Hi ${firstName(e.parentName)},` : "Hi there,";
  const button = (name: string) => `Open ${name}'s Overview`;
  const footer = {
    why: "You get this email once a month, when a summary is ready for your family.",
    unsubscribe: { url: e.unsubscribeUrl, label: "Turn off monthly summary emails" },
  };

  const text = [
    greeting,
    ...paragraphs,
    `${e.children.map((c) => `${button(c.name)}: ${c.url}`).join("\n")}\n${signIn}`,
    emailSignatureText(),
    emailFooterText(footer),
  ].join("\n\n");

  const p = (body: string, style = "") => `<p style="margin:0 0 14px;${style}">${body}</p>`;
  const html = emailDocument({ title: subject, preview: ready, footer, body: `
<tr><td style="padding:0 24px 4px">
${p(esc(greeting))}
${paragraphs.map((x) => p(esc(x))).join("\n")}
</td></tr>
${e.children.map((c) => `<tr><td style="padding:6px 24px 8px">
<a href="${esc(c.url)}" style="display:inline-block;background:${BUTTON};color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600">${esc(button(c.name))}</a>
</td></tr>`).join("\n")}
<tr><td style="padding:0 24px 4px">${p(esc(signIn), `margin:8px 0 0;font-size:14px;color:${INK_2}`)}</td></tr>
` });
  return { subject, text, html };
}

/** The Overview of one child. A signed-out parent signs in first and comes back here. */
export const overviewUrl = (origin: string, childId: string) => `${origin}/account?child=${encodeURIComponent(childId)}`;

/** Where the email's unsubscribe links go: the page, and the RFC 8058 one-click address for mail apps. */
export const monthlyLinks = (origin: string, token: string) => ({
  unsubscribeUrl: `${origin}/unsubscribe?t=${token}`,
  oneClickUrl: `${origin}/api/unsubscribe?t=${token}`,
});

/**
 * The email for `due`, to the parent from EMAIL_FROM, with `token` in its unsubscribe link and in the one-click headers.
 * Null when the state lacks the parent or a child.
 */
export function monthlyMessage(due: DueMonthly, token: string, state: MonthlyState, origin: string): EmailMessage | null {
  const parent = state.parents.find((p) => p.id === due.parentId);
  if (!parent) return null;
  const children: MonthlyEmailInput["children"] = [];
  for (const id of due.childIds) {
    const child = state.children.find((c) => c.id === id && c.parentId === parent.id);
    if (!child) return null;
    children.push({ name: child.firstName.trim() || "Your child", url: overviewUrl(origin, child.id) });
  }
  const links = monthlyLinks(origin, token);
  const email = monthlyEmail({ parentName: parent.name, month: due.month, children, unsubscribeUrl: links.unsubscribeUrl });
  return {
    sender: { to: "parent" },
    to: parent.email,
    replyTo: SUPPORT_EMAIL,
    subject: email.subject,
    text: email.text,
    html: email.html,
    headers: { "List-Unsubscribe": `<${links.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// ---------- The run ----------

/** The store the run uses. The real one keeps its claims in public.email_log, whose unique index is the guard. */
export interface MonthlyStore {
  load(now: number): Promise<MonthlyState>;
  /** The send ledger, keyed by (parent, month). A claim stores the unsubscribe token hash in its own write. */
  ledger: SendLedger<DueMonthly, string>;
}

export interface MonthlyRunResult {
  due: number;
  sent: number;
  /** Refused, the email could not be built, or the claim failed: a later run tries again, up to MAX_SEND_ATTEMPTS. */
  failed: number;
  /** Another run took them first. */
  busy: number;
  /** The email may have gone: the claim stays, and nothing sends it again. */
  unknown: number;
}

/** One run at `now`: decides, then sends each email once through the delivery module. */
export async function runMonthlyEmails(
  store: MonthlyStore,
  now: number,
  deps: { origin: string; newToken(): { token: string; hash: string }; transport?: MailTransport; limit?: number; shouldStop?(): boolean },
): Promise<MonthlyRunResult> {
  const state = await store.load(now);
  const due = dueMonthlyEmails(state, now);
  const result: MonthlyRunResult = { due: due.length, sent: 0, failed: 0, busy: 0, unknown: 0 };
  for (const d of due.slice(0, deps.limit ?? RUN_LIMIT)) {
    // Nothing is claimed for an email this run does not reach: the next run sends it.
    if (deps.shouldStop?.()) break;
    const { token, hash } = deps.newToken();
    const message = monthlyMessage(d, token, state, deps.origin);
    if (!message) {
      console.error("[monthly summary] email not built: parent or child not loaded", d.month);
      result.failed++;
      continue;
    }
    try {
      const outcome = await sendEmailOnce(store.ledger, d, message, { transport: deps.transport, claimFields: { unsubscribe_hash: hash } });
      if (outcome.status === "sent") result.sent++;
      else if (outcome.status === "refused") result.failed++;
      else if (outcome.status === "busy") result.busy++;
      else {
        console.error("[monthly summary] delivery unknown; the row stays claimed", d.month, outcome.error);
        result.unknown++;
      }
    } catch (e) {
      // Only the claim can throw, for example for a family being deleted: nothing went, and the other families still get theirs.
      console.error("[monthly summary] claim failed", d.month, e instanceof Error ? e.message : e);
      result.failed++;
    }
  }
  return result;
}
