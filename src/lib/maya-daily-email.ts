// The daily Maya email (#332, spec #297): one email per parent on each day with Maya calls, grouped across the
// family's children, with the parent note of each call (src/lib/maya-call-note.ts) and what was said. No-call days send
// nothing. The email for a day goes the next morning (from SEND_HOUR in the family's time zone), so it holds every call
// of that day. The reminder job (/api/reminders, every 15 minutes) runs it after the reminders.
//
// Each email goes through the parent email delivery module (src/lib/email-delivery.ts) with the send key "parent P, day
// D", claimed in public.email_log (kind maya_daily, one row per parent per day). Refused: a later run tries again, up to
// MAX_SEND_ATTEMPTS; unknown: the claim stays and nothing sends it again. Parent email design A (D-122), from
// EMAIL_FROM, with the CASL footer and an unsubscribe link that turns off only this email (kind maya_unsubscribe).
//
// The child's first name is put into the note here, in the parent's own email; nothing here asks an AI.
// Seams: the store (Supabase: src/lib/maya-daily-email-store.ts; memory: src/lib/maya-daily-email-memory.ts), the mail
// transport and the clock (`now`). Pure otherwise.
import { SUPPORT_EMAIL } from "@/lib/contact";
import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";
import { sendEmailOnce, type EmailMessage, type MailTransport, type SendLedger } from "@/lib/email-delivery";
import { noteSentences, noteTranscriptLines, type CallNote } from "@/lib/maya-call-note";
import { familyZone } from "@/lib/reminder-email";
import { canGetEmail } from "@/lib/reminder-schedule";
import { MAX_SEND_ATTEMPTS, type LogStatus } from "@/lib/reminders";

/** The hour (family time) from which the email for the day before goes. */
export const SEND_HOUR = 7;
/** Days with calls older than this many days are never emailed (a job that was down does not send old news). */
export const LOOKBACK_DAYS = 3;
/** Emails one run sends at most; the next run sends the rest. */
export const RUN_LIMIT = 20;

export interface DailyParent {
  id: string;
  name: string;
  email: string;
  /** Picks the family's time zone (familyZone); null is Pacific. */
  postal: string | null;
}

export interface DailyChild {
  id: string;
  parentId: string;
  firstName: string;
}

/** A row of public.email_log that this email reads. */
export interface DailyLogEntry {
  id: string;
  kind: "maya_daily" | "maya_unsubscribe";
  parentId: string;
  /** The family's local date of the calls (YYYY-MM-DD); null for an unsubscribe. */
  day: string | null;
  status: LogStatus | null;
  attempts: number;
}

/** What the decision reads. The store may pass more than it needs; every rule is checked here. */
export interface DailyState {
  parents: readonly DailyParent[];
  children: readonly DailyChild[];
  /** The notes of the calls that ended in the last LOOKBACK_DAYS days or so. */
  notes: readonly CallNote[];
  log: readonly DailyLogEntry[];
}

/** One email to send: the send key (parent, day) and the calls in it. */
export interface DueDaily {
  parentId: string;
  /** The family's local date of the calls, YYYY-MM-DD. */
  day: string;
  zone: string;
  /** The calls in the email, in the order they ended. */
  callIds: string[];
  /** A send that was refused before: the log row to take again. */
  retry: { logId: string; attempts: number } | null;
}

// ---------- Days in the family's time zone ----------

function parts(at: number, zone: string): Record<string, string> {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  return Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
}

/** The local date at `at` in `zone`, YYYY-MM-DD. */
export function localDay(at: number, zone: string): string {
  const p = parts(at, zone);
  return `${p.year}-${p.month}-${p.day}`;
}

const localHour = (at: number, zone: string) => Number(parts(at, zone).hour);

/** The date `n` days after `day` (YYYY-MM-DD). */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- Who gets which email ----------

/**
 * The emails to send at `now`, oldest day first: one per parent per day with calls, once the day is over and it is
 * SEND_HOUR or later the next day in the family's time zone. None for a parent who turned the email off, for an address
 * that cannot get email, or for a day already sent or held by a run.
 */
export function dueDailyEmails(state: DailyState, now: number): DueDaily[] {
  const off = new Set(state.log.filter((e) => e.kind === "maya_unsubscribe").map((e) => e.parentId));
  const due: DueDaily[] = [];
  for (const parent of state.parents) {
    if (off.has(parent.id) || !canGetEmail(parent.email)) continue;
    const zone = familyZone(parent.postal);
    const today = localDay(now, zone);
    const yesterday = addDays(today, -1);
    const earliest = addDays(today, -LOOKBACK_DAYS);
    const byDay = new Map<string, CallNote[]>();
    for (const n of state.notes) {
      if (n.parentId !== parent.id) continue;
      const day = localDay(Date.parse(n.callEndedAt), zone);
      const over = day < yesterday || (day === yesterday && localHour(now, zone) >= SEND_HOUR);
      if (over && day >= earliest) byDay.set(day, [...(byDay.get(day) ?? []), n]);
    }
    for (const [day, notes] of byDay) {
      const callIds = [...notes].sort(byEnd).map((n) => n.callId);
      const logged = state.log.find((e) => e.kind === "maya_daily" && e.parentId === parent.id && e.day === day);
      if (!logged) due.push({ parentId: parent.id, day, zone, callIds, retry: null });
      else if (logged.status === "failed" && logged.attempts < MAX_SEND_ATTEMPTS) due.push({ parentId: parent.id, day, zone, callIds, retry: { logId: logged.id, attempts: logged.attempts } });
    }
  }
  return due.sort((a, b) => a.day.localeCompare(b.day) || a.parentId.localeCompare(b.parentId));
}

const byEnd = (a: CallNote, b: CallNote) => a.callEndedAt.localeCompare(b.callEndedAt) || a.callId.localeCompare(b.callId);

// ---------- The email ----------

export interface DailyEmailCall {
  endedAt: string;
  minutes: number;
  /** The note's sentences, with the child's name in. */
  sentences: string[];
  transcript: { speaker: string; text: string; note: boolean }[];
}

export interface DailyEmailInput {
  parentName: string;
  day: string;
  zone: string;
  /** Each child with calls that day, in the order of their first call. */
  children: { name: string; calls: DailyEmailCall[] }[];
  unsubscribeUrl: string;
}

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);
const INK_2 = "#44444c";
const RULE = "#e4e4e7";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** "Leah", "Leah and Sam", "Leah, Sam and Ava". */
const joinNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
/** "Sunday, November 1". */
const dayLabel = (day: string) => new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${day}T12:00:00Z`));
const weekday = (day: string) => new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" }).format(Date.parse(`${day}T12:00:00Z`));
/** "4:12 p.m." in the family's time zone. */
const clock = (iso: string, zone: string) => new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(Date.parse(iso));
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The daily Maya email: subject, text and HTML, with the CASL footer and the unsubscribe link. */
export function dailyEmail(e: DailyEmailInput): { subject: string; text: string; html: string } {
  const names = e.children.map((c) => c.name);
  const calls = e.children.reduce((n, c) => n + c.calls.length, 0);
  const subject = `${joinNames(names)} talked with Maya on ${weekday(e.day)}`;
  const intro = e.children.length === 1
    ? `${names[0]} had ${plural(calls, "call")} with Maya, our AI teaching assistant, on ${dayLabel(e.day)}. Here is a short note about ${calls === 1 ? "the call" : "each call"}, and what was said.`
    : `${joinNames(names)} had calls with Maya, our AI teaching assistant, on ${dayLabel(e.day)}. Here is a short note about each call, and what was said.`;
  const preview = e.children.length === 1 ? `${names[0]} had ${plural(calls, "call")} with Maya.` : `${joinNames(names)} had calls with Maya.`;
  const why = "You get this email on days when your child has a call with Maya. We send one email a day, and none on days without calls.";
  const footer = { why, unsubscribe: { url: e.unsubscribeUrl, label: "Turn off these Maya emails" } };
  const several = e.children.length > 1;
  const callLabel = (c: DailyEmailCall, i: number, of: number) => `${of > 1 ? `Call ${i + 1}, ended` : "Ended"} at ${clock(c.endedAt, e.zone)}, ${plural(c.minutes, "minute")}`;

  const textCalls = e.children.flatMap((child) => [
    ...(several ? [child.name.toUpperCase()] : []),
    ...child.calls.map((c, i) => [
      callLabel(c, i, child.calls.length),
      c.sentences.join(" "),
      "What was said:",
      ...c.transcript.map((l) => (l.note ? `(${l.text})` : `${l.speaker}: ${l.text}`)),
    ].join("\n")),
  ]);
  const text = [`Hi ${firstName(e.parentName)},`, intro, ...textCalls, emailSignatureText(), emailFooterText(footer)].join("\n\n");

  const p = (body: string, style = "") => `<p style="margin:0 0 14px;${style}">${body}</p>`;
  const line = (l: DailyEmailCall["transcript"][number]) => l.note
    ? `<p style="margin:0 0 6px;font-size:14px;color:${INK_2};font-style:italic">${esc(l.text)}</p>`
    : `<p style="margin:0 0 6px;font-size:14px"><strong style="font-weight:600">${esc(l.speaker)}:</strong> ${esc(l.text)}</p>`;
  const htmlCalls = e.children.map((child) => `
${several ? `<tr><td style="padding:18px 24px 0"><h2 style="margin:0;font-size:18px;line-height:1.3;font-weight:600">${esc(child.name)}</h2></td></tr>` : ""}
${child.calls.map((c, i) => `<tr><td style="padding:14px 24px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${RULE};padding:16px 0 0">
${p(esc(callLabel(c, i, child.calls.length)), `margin:0 0 8px;font-size:14px;color:${INK_2}`)}
${p(esc(c.sentences.join(" ")))}
${c.transcript.length ? `${p("What was said", `margin:0 0 8px;font-size:14px;font-weight:600;color:${INK_2}`)}
<div style="border-left:3px solid ${RULE};padding:2px 0 2px 12px">${c.transcript.map(line).join("\n")}</div>` : ""}
</td></tr></table>
</td></tr>`).join("\n")}`).join("\n");
  const html = emailDocument({ title: subject, preview, footer, body: `
<tr><td style="padding:0 24px 4px">
${p(`Hi ${esc(firstName(e.parentName))},`)}
${p(esc(intro))}
</td></tr>
${htmlCalls}
` });
  return { subject, text, html };
}

/** Where the email's unsubscribe links go: the page, and the RFC 8058 one-click address for mail apps. */
export const dailyLinks = (origin: string, token: string) => ({
  unsubscribeUrl: `${origin}/unsubscribe?t=${token}`,
  oneClickUrl: `${origin}/api/unsubscribe?t=${token}`,
});

/**
 * The email for `due`, to the parent from EMAIL_FROM, with `token` in its unsubscribe link and in the one-click headers.
 * Null when the state lacks the parent, a child, or a note.
 */
export function dailyMessage(due: DueDaily, token: string, state: DailyState, origin: string): EmailMessage | null {
  const parent = state.parents.find((p) => p.id === due.parentId);
  const notes = due.callIds.map((id) => state.notes.find((n) => n.callId === id));
  if (!parent || notes.some((n) => !n)) return null;
  const children: (DailyEmailInput["children"][number] & { id: string })[] = [];
  for (const note of notes as CallNote[]) {
    const child = state.children.find((c) => c.id === note.childId && c.parentId === parent.id);
    if (!child) return null;
    const name = child.firstName.trim() || "Your child";
    let group = children.find((g) => g.id === child.id);
    if (!group) children.push((group = { id: child.id, name, calls: [] }));
    group.calls.push({
      endedAt: note.callEndedAt,
      minutes: note.facts.minutes,
      sentences: noteSentences(note, name),
      transcript: noteTranscriptLines(note, name).map((l) => ({ speaker: l.speaker === "maya" ? "Maya" : name, text: l.text, note: l.speaker === "note" })),
    });
  }
  const links = dailyLinks(origin, token);
  const email = dailyEmail({ parentName: parent.name, day: due.day, zone: due.zone, children, unsubscribeUrl: links.unsubscribeUrl });
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
export interface DailyStore {
  load(now: number): Promise<DailyState>;
  /** The send ledger, keyed by (parent, day). A claim stores the unsubscribe token hash in its own write. */
  ledger: SendLedger<DueDaily, string>;
}

export interface DailyRunResult {
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
export async function runDailyEmails(
  store: DailyStore,
  now: number,
  deps: { origin: string; newToken(): { token: string; hash: string }; transport?: MailTransport; limit?: number },
): Promise<DailyRunResult> {
  const state = await store.load(now);
  const due = dueDailyEmails(state, now);
  const result: DailyRunResult = { due: due.length, sent: 0, failed: 0, busy: 0, unknown: 0 };
  for (const d of due.slice(0, deps.limit ?? RUN_LIMIT)) {
    const { token, hash } = deps.newToken();
    const message = dailyMessage(d, token, state, deps.origin);
    if (!message) {
      console.error("[maya daily] email not built: parent, child or note not loaded", d.day);
      result.failed++;
      continue;
    }
    const outcome = await sendEmailOnce(store.ledger, d, message, { transport: deps.transport, claimFields: { unsubscribe_hash: hash } });
    if (outcome.status === "sent") result.sent++;
    else if (outcome.status === "refused") result.failed++;
    else if (outcome.status === "busy") result.busy++;
    else {
      console.error("[maya daily] delivery unknown; the row stays claimed", d.day, outcome.error);
      result.unknown++;
    }
  }
  return result;
}
