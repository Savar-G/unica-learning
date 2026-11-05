// The weekly Maya family recap (#332, spec #297). Monday at 7 a.m. family time, for uncovered completed calls.
// No calls means no email. Claims in email_log use (parent, week_start). Refused sends can retry three times;
// unknown sends stay claimed. The shared reminder job runs this through sendEmailOnce after the reminders.
// The CASL footer and Maya unsubscribe are separate from the reminders. No AI call is made here. The email gives a
// count per child and a sign-in link to the notes, never words from a call (D-284).
import { SUPPORT_EMAIL } from "@/lib/contact";
import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";
import { sendEmailOnce, type EmailMessage, type MailTransport, type SendLedger } from "@/lib/email-delivery";
import { NOTE_CALL_KINDS, type CallNote } from "@/lib/maya-call-note";
import { notesPath } from "@/lib/parent-maya-notes";
import { addDays, familyZone, familyProvince, formatCalendarDate, localDateTime, localDay, weekStartFor, type FamilyZone } from "@/lib/family-time";
export { localDay, weekStartFor } from "@/lib/family-time";
import { canGetEmail } from "@/lib/reminder-schedule";
import { MAX_SEND_ATTEMPTS, type LogStatus } from "@/lib/reminders";

/** Monday release hour in the family time zone. */
export const SEND_HOUR = 7;
/** A delivery slot expires at the next Monday midnight. */
export const LATE_DAYS = 7;
/** Uncovered calls expire after this many elapsed days. The store loads wider for clock and zone slack. */
export const LOOKBACK_DAYS = 7 + LATE_DAYS;
/** Emails one run sends at most; the next run sends the rest. */
export const RUN_LIMIT = 20;

export interface WeeklyParent {
  id: string;
  name: string;
  email: string;
  /** The stored browser zone takes precedence over postal and province. */
  timeZone?: string | null;
  postal: string | null;
  /** A test family (public.test_accounts): never emailed (R421W-5). The rehearsal family (#530) is loaded as not a test. */
  test?: boolean;
}

export interface WeeklyChild {
  id: string;
  parentId: string;
  firstName: string;
  province?: string | null;
  created_at?: string;
}

/** A completed call, including one whose note is not saved yet. */
export interface WeeklyCall {
  callId: string;
  parentId: string;
  childId: string;
  endedAt: string;
  notePending: boolean;
  /** maya_calls.kind: only a family call counts (NOTE_CALL_KINDS), never an admin test call (R421W-5). */
  kind: string;
}

/** A row of public.email_log that this email reads. */
export interface WeeklyLogEntry {
  id: string;
  kind: "maya_weekly" | "maya_unsubscribe";
  parentId: string;
  /** The Monday label of the delivery slot (the preceding family-local week) (YYYY-MM-DD); null for an unsubscribe. */
  weekStart: string | null;
  status: LogStatus | null;
  attempts: number;
  /** All completed calls included in this recap, also those without a displayed note. */
  callIds?: string[];
}

/** What the decision reads. The store may pass more than it needs; every rule is checked here. */
export interface WeeklyState {
  parents: readonly WeeklyParent[];
  children: readonly WeeklyChild[];
  calls: readonly WeeklyCall[];
  /** The notes of the calls that ended in the last LOOKBACK_DAYS days or so. */
  notes: readonly CallNote[];
  log: readonly WeeklyLogEntry[];
}

/** One email to send: the send key (parent, week start) and the calls in it. */
export interface DueWeekly {
  parentId: string;
  /** The Monday label of the delivery slot (the preceding family-local week), YYYY-MM-DD. */
  weekStart: string;
  zone: FamilyZone;
  /** The calls in the email, newest first. */
  callIds: string[];
  /** A send that was refused before: the log row to take again. */
  retry: { logId: string; attempts: number } | null;
}

// ---------- Who gets which email ----------

/** One recap per parent and delivery week, from Monday 7 a.m. until the next Monday midnight. */
export function dueWeeklyEmails(state: WeeklyState, now: number): DueWeekly[] {
  const off = new Set(state.log.filter((e) => e.kind === "maya_unsubscribe").map((e) => e.parentId));
  const due: DueWeekly[] = [];
  for (const parent of state.parents) {
    if (parent.test || off.has(parent.id) || !canGetEmail(parent.email)) continue;
    const zone = familyZone({ ...parent, province: familyProvince(state.children.filter((c) => c.parentId === parent.id)) });
    const today = localDay(now, zone);
    const monday = weekStartFor(today);
    const weekStart = addDays(monday, -7);
    const release = localDateTime(monday, zone, SEND_HOUR);
    const expires = localDateTime(addDays(monday, LATE_DAYS), zone);
    if (now < release || now >= expires) continue;
    const logs = state.log.filter((e) => e.kind === "maya_weekly" && e.parentId === parent.id);
    const logged = logs.find((e) => e.weekStart === weekStart);
    if (logged && (logged.status !== "failed" || logged.attempts >= MAX_SEND_ATTEMPTS)) continue;
    // Call identity owns coverage. Week labels only set cadence and the displayed calendar grouping.
    const covered = new Set(logs.filter((e) => e.status === "sent" || e.status === "claimed").flatMap((e) => e.callIds ?? []));
    const calls = [...new Map(state.calls.filter((c) => c.parentId === parent.id
      && (NOTE_CALL_KINDS as readonly string[]).includes(c.kind) && !covered.has(c.callId)
      && Date.parse(c.endedAt) >= now - LOOKBACK_DAYS * 86_400_000
      && Date.parse(c.endedAt) < localDateTime(monday, zone)).map((c) => [c.callId, c])).values()];
    if (!calls.length) continue;
    const incomplete = calls.some((c) => c.notePending || !state.notes.some((n) => n.callId === c.callId && n.parentId === c.parentId && n.childId === c.childId));
    if (incomplete && today < addDays(monday, LATE_DAYS - 1)) continue;
    const callIds = calls.sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt) || a.callId.localeCompare(b.callId)).map((c) => c.callId);
    due.push({ parentId: parent.id, weekStart, zone, callIds, retry: logged ? { logId: logged.id, attempts: logged.attempts } : null });
  }
  return due.sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.parentId.localeCompare(b.parentId));
}

// ---------- The email ----------

/** One child's line in the email: a count and the link to the child's notes. Never words from a call (D-284). */
export interface WeeklyEmailChild {
  name: string;
  /** Every completed call of the child in this email, with or without a note. */
  calls: number;
  /** Calls whose note says Maya stopped for safety. */
  safetyCalls: number;
  /** The sign-in link that opens the child's notes from Maya. */
  notesUrl: string;
}

export interface WeeklyEmailInput {
  parentName: string;
  weekStart: string;
  coveredWeeks?: string[];
  /** Each child with calls, in the order of their newest call. */
  children: WeeklyEmailChild[];
  unsubscribeUrl: string;
  missingNotes: number;
}

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** "Leah", "Leah and Sam", "Leah, Sam and Ava". */
const joinNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
/** "Sunday, November 1". */
const dayLabel = (day: string) => formatCalendarDate(day, { weekday: "long", month: "long", day: "numeric" });
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * The weekly Maya email: subject, text and HTML, with the CASL footer and the unsubscribe link. It says how many calls
 * each child had and links to the child's notes behind sign-in. It never carries the transcript, the note's sentences
 * or anything else said in a call (D-284): an email is copied to mail servers and kept in inboxes we do not control.
 */
export function weeklyEmail(e: WeeklyEmailInput): { subject: string; text: string; html: string } {
  const names = e.children.map((c) => c.name);
  const calls = e.children.reduce((n, c) => n + c.calls, 0);
  const subject = `Maya this week: ${joinNames(names)}`;
  const weeks = e.coveredWeeks?.length ? [...e.coveredWeeks].sort() : [e.weekStart];
  const period = `${dayLabel(weeks[0])} to ${dayLabel(addDays(weeks.at(-1)!, 6))}`;
  const intro = `${joinNames(names)} had ${plural(calls, "call")} with Maya, our AI teaching assistant, from ${period}.`;
  const privacy = "To keep your family's calls private, this email does not include what was said. Sign in to read each note.";
  const missing = e.missingNotes ? `${plural(e.missingNotes, "call")} this week ${e.missingNotes === 1 ? "has" : "have"} no note yet.` : "";
  const preview = `${joinNames(names)} had ${plural(calls, "call")} with Maya this week.`;
  const why = "You get one Maya email each week when your family has calls with Maya. We send none for weeks without calls.";
  const footer = { why, unsubscribe: { url: e.unsubscribeUrl, label: "Turn off these Maya emails" } };
  const several = e.children.length > 1;
  // With one child the intro already gives the count.
  const count = (c: WeeklyEmailChild) => (several ? `${c.name} had ${plural(c.calls, "call")}.` : "");
  const linkLabel = (c: WeeklyEmailChild) => `Read ${c.name}'s notes from Maya`;
  const safety = (c: WeeklyEmailChild) => c.safetyCalls
    ? `Maya stopped the math in ${c.safetyCalls} of ${c.name}'s calls because of something ${c.name} said. Please read the ${c.safetyCalls === 1 ? "note" : "notes"}.`
    : "";

  const textChildren = e.children.map((c) => [safety(c), `${[count(c), linkLabel(c)].filter(Boolean).join(" ")}: ${c.notesUrl}`].filter(Boolean).join("\n"));
  const text = [`Hi ${firstName(e.parentName)},`, intro, ...(missing ? [missing] : []), ...textChildren, privacy, emailSignatureText(), emailFooterText(footer)].join("\n\n");

  const p = (body: string, style = "") => `<p style="margin:0 0 14px;${style}">${body}</p>`;
  const htmlChildren = e.children.map((c) => [
    safety(c) ? p(esc(safety(c)), "font-weight:600") : "",
    p([count(c) ? esc(count(c)) : "", `<a href="${esc(c.notesUrl)}">${esc(linkLabel(c))}</a>`].filter(Boolean).join(" ")),
  ].join("\n")).join("\n");
  const html = emailDocument({ title: subject, preview, footer, body: `
<tr><td style="padding:0 24px 4px">
${p(`Hi ${esc(firstName(e.parentName))},`)}
${p(esc(intro))}
${missing ? p(esc(missing)) : ""}
${htmlChildren}
${p(esc(privacy))}
</td></tr>
` });
  return { subject, text, html };
}

/** Where the email's links go: the unsubscribe page, the RFC 8058 one-click address, and a child's notes behind sign-in. */
export const weeklyLinks = (origin: string, token: string) => ({
  unsubscribeUrl: `${origin}/unsubscribe?t=${token}`,
  oneClickUrl: `${origin}/api/unsubscribe?t=${token}`,
});
/** Signs the parent in (or passes a signed-in parent through) and opens the child's notes from Maya. */
export const notesSignInUrl = (origin: string, childId: string) => `${origin}/sign-in?next=${encodeURIComponent(notesPath(childId))}`;

/**
 * The email for `due`, to the parent from EMAIL_FROM, with `token` in its unsubscribe link and in the one-click headers.
 * Null when the state lacks the parent, a child, or a completed call.
 */
export function weeklyMessage(due: DueWeekly, token: string, state: WeeklyState, origin: string): EmailMessage | null {
  const parent = state.parents.find((p) => p.id === due.parentId);
  const calls = due.callIds.map((id) => state.calls.find((c) => c.callId === id && c.parentId === due.parentId));
  if (!parent || calls.some((c) => !c)) return null;
  const completed = calls as WeeklyCall[];
  const noteOf = (c: WeeklyCall) => state.notes.find((n) => n.callId === c.callId && n.parentId === c.parentId && n.childId === c.childId);
  // due.callIds is newest first, so children come in the order of their newest call.
  const children: (WeeklyEmailChild & { id: string })[] = [];
  for (const call of completed) {
    const child = state.children.find((c) => c.id === call.childId && c.parentId === parent.id);
    if (!child) return null;
    let group = children.find((g) => g.id === child.id);
    if (!group) children.push((group = { id: child.id, name: child.firstName.trim() || "Your child", calls: 0, safetyCalls: 0, notesUrl: notesSignInUrl(origin, child.id) }));
    group.calls++;
    if (noteOf(call)?.facts.safety) group.safetyCalls++;
  }
  const links = weeklyLinks(origin, token);
  const email = weeklyEmail({
    parentName: parent.name,
    weekStart: due.weekStart,
    coveredWeeks: [...new Set(completed.map((c) => weekStartFor(localDay(c.endedAt, due.zone))))],
    children,
    missingNotes: completed.filter((c) => !noteOf(c)).length,
    unsubscribeUrl: links.unsubscribeUrl,
  });
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
export interface WeeklyStore {
  load(now: number): Promise<WeeklyState>;
  /** The send ledger, keyed by (parent, week start). A claim stores the unsubscribe token hash in its own write. */
  ledger: SendLedger<DueWeekly, string>;
}

export interface WeeklyRunResult {
  due: number;
  sent: number;
  /** Refused, or the email could not be built: a later run tries again, up to MAX_SEND_ATTEMPTS. */
  failed: number;
  /** Another run took them first. */
  busy: number;
  /** The email may have gone: the claim stays, and nothing sends it again. */
  unknown: number;
}

/** One run at `now`: decides, then sends each email once through the delivery module. */
export async function runWeeklyEmails(
  store: WeeklyStore,
  now: number,
  deps: { origin: string; newToken(): { token: string; hash: string }; transport?: MailTransport; limit?: number },
): Promise<WeeklyRunResult> {
  const state = await store.load(now);
  const due = dueWeeklyEmails(state, now);
  const result: WeeklyRunResult = { due: due.length, sent: 0, failed: 0, busy: 0, unknown: 0 };
  for (const d of due.slice(0, deps.limit ?? RUN_LIMIT)) {
    const { token, hash } = deps.newToken();
    const message = weeklyMessage(d, token, state, deps.origin);
    if (!message) {
      console.error("[maya weekly] email not built: parent, child or note not loaded", d.weekStart);
      result.failed++;
      continue;
    }
    const outcome = await sendEmailOnce(store.ledger, d, message, { transport: deps.transport, claimFields: { unsubscribe_hash: hash } });
    if (outcome.status === "sent") result.sent++;
    else if (outcome.status === "refused") result.failed++;
    else if (outcome.status === "busy") result.busy++;
    else {
      console.error("[maya weekly] delivery unknown; the row stays claimed", d.weekStart, outcome.error);
      result.unknown++;
    }
  }
  return result;
}
