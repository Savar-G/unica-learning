import { ADMIN_PATH } from "@/lib/admin-view";
import { PACIFIC_ZONE, addDays, localDateTime, localDay } from "@/lib/family-time";

// The team's daily digest email (docs/team-digest.md). One email a day to SIGNUP_NOTIFY_EMAIL with every signal of the last
// day, so no stuck family is missed; on Fridays it adds "This week": the 7-day totals against the week before, and a short
// list of things to look at, made by the fixed rules in `lookAt` (no AI).
//
// This module is pure: it builds the email from rows a reader gives (src/lib/team-digest-store.ts in production,
// src/lib/team-digest-memory.ts in tests). The email leaves our system, so it holds only counts, ids and admin links:
// never a child's name, a parent's email or name, or the text of a message.

/** The digest's hour in Vancouver: the day it covers ends at 7 a.m. Pacific, and the email goes from then. */
export const TEAM_DIGEST_HOUR = 7;

/** A row's time, as the database gives it (ISO 8601). */
type At = string;

/** What the reader gives for one digest: every row from `from` up to `to`, plus the few current states. */
export interface TeamDigestRows {
  /** Admins' own families and families marked as a test (public.admin_users, public.test_accounts). */
  testFamilies: string[];
  /** New parents (public.parents.created_at). */
  signups: { parentId: string; at: At }[];
  /** Finished tests (public.assessments.completed_at). */
  finishedTests: { id: string; parentId: string; at: At }[];
  /** Parent feedback (public.feedback): never its text. */
  feedback: { parentId: string; status: string; at: At }[];
  /** Resend delivery problems (public.email_events: bounced, complained, failed, suppressed). No family link. */
  emailProblems: { type: string; at: At }[];
  /** Maya's safety alerts (public.maya_call_alerts). */
  safetyAlerts: { callId: string; parentId: string; level: string; at: At }[];
  /** Current plan rows in payment_failed, ending or paying (public.child_plan_states), with the Stripe event time. */
  planStates: { childId: string; parentId: string; kind: string; eventAt: At | null }[];
  /** Plan starts (public.plan_starts) that are open now, or that started in the period. */
  planStarts: { parentId: string; state: string; startedAt: At; finishedAt: At | null }[];
  /** Workbook runs that failed or were stopped (public.workbook_runs), at their end time (or creation when none). */
  workbookRuns: { id: string; childId: string; parentId: string; status: string; at: At }[];
  /** Book 1 starting records waiting for recovery (public.workbook_book1_baseline_pending). */
  book1Pending: { draftId: string; childId: string; parentId: string; reason: string; at: At }[];
  /** Tagged ad visits (public.ad_visits). */
  adVisits: { visitId: string; campaign: string | null; source: string | null; at: At }[];
  /** Signup steps of those visits (public.ad_visit_steps). */
  adSteps: { visitId: string; step: string; at: At }[];
  /** AI calls with their cost (public.ai_usage_events), test families included: the provider bills them too. */
  aiUsage: { feature: string; costUsd: number | null; calls: number; at: At }[];
  /** Real families' answers waiting for a team mark now (scan_team_waiting_count). */
  scanWaiting: number;
  /** Reads that stopped at their row limit: their counts are at least what is shown. */
  capped: string[];
}

/** The times one digest covers. All are instants (ms). */
export interface DigestPeriod {
  /** The Pacific day the email is for (YYYY-MM-DD): its send key. */
  day: string;
  /** The last day: from 7 a.m. Pacific the day before up to 7 a.m. Pacific on `day`. */
  from: number;
  to: number;
  /** Fridays only: the last 7 days and the 7 days before them. */
  week: { from: number; to: number; previousFrom: number } | null;
}

/** The period of the digest for `day`. A Friday digest also covers the week. */
export function digestPeriod(day: string): DigestPeriod {
  const at = (d: string) => localDateTime(d, PACIFIC_ZONE, TEAM_DIGEST_HOUR);
  const to = at(day);
  const friday = new Date(`${day}T12:00:00Z`).getUTCDay() === 5;
  return {
    day,
    from: at(addDays(day, -1)),
    to,
    week: friday ? { from: at(addDays(day, -7)), to, previousFrom: at(addDays(day, -14)) } : null,
  };
}

/** The Pacific day of `now`, and whether its digest may go yet (from 7 a.m. Pacific). */
export function digestDay(now: number): { day: string; due: boolean } {
  const day = localDay(now, PACIFIC_ZONE);
  return { day, due: now >= localDateTime(day, PACIFIC_ZONE, TEAM_DIGEST_HOUR) };
}

/** The first instant the reader must read from: the day's start, or two weeks back on a Friday. */
export const readFrom = (p: DigestPeriod): number => p.week?.previousFrom ?? p.from;

/** One line of the email: words, and an admin page when there is one. */
export interface DigestLine { text: string; path?: string }
export interface DigestSection { title: string; lines: DigestLine[] }

/** What the week rules see: the totals of one 7-day period. */
export interface WeekTotals {
  signups: number;
  finishedTests: number;
  feedback: number;
  emailProblems: number;
  safetyAlerts: number;
  failedRuns: number;
  adVisits: number;
  adCodesSent: number;
  aiCostUsd: number;
}

export interface TeamDigest {
  day: string;
  weekly: boolean;
  sections: DigestSection[];
  /** Fridays only. */
  week: { current: WeekTotals; previous: WeekTotals; lookAt: DigestLine[] } | null;
  /** True when nothing happened and nothing waits: the email still goes, so a missing email means a broken run. */
  quiet: boolean;
}

const OPEN_START_HOURS = 24;
const HOUR = 3_600_000;
const NO_CAMPAIGN = "(no campaign)";

const ms = (at: At) => Date.parse(at);
const inRange = (at: At | null, from: number, to: number) => at !== null && ms(at) >= from && ms(at) < to;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const usd = (n: number) => `USD ${n.toFixed(2)}`;
const short = (id: string) => id.slice(0, 8);

function realOnly<T extends { parentId: string }>(rows: T[], test: Set<string>): T[] {
  return rows.filter((r) => !test.has(r.parentId));
}

const PROBLEM_TYPES = new Set(["bounced", "complained", "failed", "suppressed"]);
const PROBLEM_WORDS: Record<string, string> = { bounced: "bounced", complained: "marked as spam", failed: "failed", suppressed: "suppressed" };
const LEVEL_WORDS: Record<string, string> = { safety_immediate: "immediate safety", safety_concern: "safety concern", unsafe_request: "unsafe request" };
const STEP_ORDER = ["start_open", "form_start", "google_start", "code_sent"] as const;
const STEP_WORDS: Record<string, string> = { start_open: "opened /start", form_start: "started the form", google_start: "chose Google", code_sent: "got an email code" };

function totals(rows: TeamDigestRows, test: Set<string>, from: number, to: number): WeekTotals {
  const within = <T extends { at: At }>(list: T[]) => list.filter((r) => inRange(r.at, from, to));
  const visits = within(rows.adVisits);
  const visitIds = new Set(rows.adVisits.map((v) => v.visitId));
  return {
    signups: within(realOnly(rows.signups, test)).length,
    finishedTests: within(realOnly(rows.finishedTests, test)).length,
    feedback: within(realOnly(rows.feedback, test)).length,
    emailProblems: within(rows.emailProblems).filter((e) => PROBLEM_TYPES.has(e.type)).length,
    safetyAlerts: within(rows.safetyAlerts).length,
    failedRuns: within(realOnly(rows.workbookRuns, test)).length,
    adVisits: visits.length,
    adCodesSent: within(rows.adSteps).filter((s) => s.step === "code_sent" && visitIds.has(s.visitId)).length,
    aiCostUsd: within(rows.aiUsage).reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
  };
}

/** The fixed rules of "Things to look at". Each rule names a number and a page; none guesses a cause. */
export function lookAt(current: WeekTotals, previous: WeekTotals, now: { paymentFailed: number; openStarts: number; scanWaiting: number; newFeedback: number; quietCampaigns: string[] }): DigestLine[] {
  const out: DigestLine[] = [];
  if (current.signups > 0 && current.finishedTests === 0) out.push({ text: `${plural(current.signups, "family", "families")} signed up this week and no test was finished.`, path: `${ADMIN_PATH}/dashboard` });
  else if (current.signups >= 4 && current.finishedTests * 2 < current.signups) out.push({ text: `Only ${current.finishedTests} of ${current.signups} new families finished a test this week.`, path: `${ADMIN_PATH}/dashboard` });
  if (previous.signups >= 4 && current.signups * 2 <= previous.signups) out.push({ text: `Signups fell from ${previous.signups} to ${current.signups}.`, path: `${ADMIN_PATH}/traffic` });
  if (current.emailProblems >= 3 || (current.emailProblems > 0 && current.emailProblems >= previous.emailProblems * 2 && previous.emailProblems > 0)) {
    out.push({ text: `${plural(current.emailProblems, "email")} had a delivery problem this week (last week ${previous.emailProblems}).`, path: `${ADMIN_PATH}/emails` });
  }
  if (current.aiCostUsd >= 5 && current.aiCostUsd >= previous.aiCostUsd * 1.5) out.push({ text: `AI cost rose to ${usd(current.aiCostUsd)} from ${usd(previous.aiCostUsd)}.`, path: `${ADMIN_PATH}/ai` });
  if (current.failedRuns >= 2) out.push({ text: `${plural(current.failedRuns, "workbook run")} failed or stopped this week.`, path: `${ADMIN_PATH}/workbooks` });
  if (current.safetyAlerts > 0) out.push({ text: `${plural(current.safetyAlerts, "Maya safety alert")} this week.`, path: `${ADMIN_PATH}/maya` });
  for (const campaign of now.quietCampaigns) out.push({ text: `Campaign "${campaign}" had 20 or more visits this week and no email code was sent.`, path: `${ADMIN_PATH}/traffic` });
  if (now.paymentFailed > 0) out.push({ text: `${plural(now.paymentFailed, "child", "children")} with a failed payment now.`, path: `${ADMIN_PATH}/next-steps` });
  if (now.openStarts > 0) out.push({ text: `${plural(now.openStarts, "plan start")} open for more than ${OPEN_START_HOURS} hours.`, path: `${ADMIN_PATH}/next-steps` });
  if (now.newFeedback > 0) out.push({ text: `${plural(now.newFeedback, "feedback message")} from this week not read yet.`, path: `${ADMIN_PATH}/feedback` });
  if (now.scanWaiting > 0) out.push({ text: `${plural(now.scanWaiting, "answer")} waiting for a team mark.`, path: `${ADMIN_PATH}/scans` });
  return out;
}

/** Builds the digest for `period` from the reader's rows. Test families are left out of every family signal except safety. */
export function buildTeamDigest(rows: TeamDigestRows, period: DigestPeriod): TeamDigest {
  const test = new Set(rows.testFamilies);
  const { from, to } = period;
  const day = <T extends { at: At }>(list: T[]) => list.filter((r) => inRange(r.at, from, to));
  const sections: DigestSection[] = [];
  const add = (title: string, lines: DigestLine[]) => { if (lines.length) sections.push({ title, lines }); };

  // Families
  const signups = day(realOnly(rows.signups, test));
  const tests = day(realOnly(rows.finishedTests, test));
  add("New families", [
    ...(signups.length ? [{ text: `${plural(signups.length, "new parent signup")}`, path: `${ADMIN_PATH}/dashboard` }] : []),
    ...signups.slice(0, 10).map((s) => ({ text: `Family ${short(s.parentId)}`, path: `${ADMIN_PATH}/parents/${s.parentId}` })),
    ...(tests.length ? [{ text: `${plural(tests.length, "finished test")}`, path: `${ADMIN_PATH}/tests` }] : []),
    ...tests.slice(0, 10).map((t) => ({ text: `Test ${short(t.id)}`, path: `${ADMIN_PATH}/assessments/${t.id}` })),
  ]);

  // Safety first among the problems: every alert, test families marked, as each one needs a look.
  const alerts = day(rows.safetyAlerts);
  add("Maya safety alerts", alerts.map((a) => ({
    text: `${LEVEL_WORDS[a.level] ?? a.level}${test.has(a.parentId) ? " (test family)" : ""}, call ${short(a.callId)}`,
    path: `${ADMIN_PATH}/maya/${a.callId}`,
  })));

  // Plans
  const paymentFailed = realOnly(rows.planStates, test).filter((p) => p.kind === "payment_failed");
  const ending = realOnly(rows.planStates, test).filter((p) => p.kind === "ending" && inRange(p.eventAt, from, to));
  const paying = realOnly(rows.planStates, test).filter((p) => p.kind === "paying" && inRange(p.eventAt, from, to));
  const started = realOnly(rows.planStarts, test).filter((s) => s.state === "started" && inRange(s.finishedAt, from, to));
  const openStarts = realOnly(rows.planStarts, test).filter((s) => s.state === "open" && ms(s.startedAt) <= to - OPEN_START_HOURS * HOUR);
  add("Plans", [
    ...paymentFailed.map((p) => ({ text: `Payment failed (now), child ${short(p.childId)}`, path: `${ADMIN_PATH}/children/${p.childId}` })),
    ...(openStarts.length ? [{ text: `${plural(openStarts.length, "plan start")} open for more than ${OPEN_START_HOURS} hours`, path: `${ADMIN_PATH}/next-steps` }] : []),
    ...ending.map((p) => ({ text: `Plan set to end, child ${short(p.childId)}`, path: `${ADMIN_PATH}/children/${p.childId}` })),
    ...(started.length ? [{ text: `${plural(started.length, "free month")} started`, path: `${ADMIN_PATH}/next-steps` }] : []),
    ...paying.map((p) => ({ text: `Paying, a Stripe payment event, child ${short(p.childId)}`, path: `${ADMIN_PATH}/children/${p.childId}` })),
  ]);

  // Waiting for the team
  const runs = day(realOnly(rows.workbookRuns, test));
  const book1 = day(realOnly(rows.book1Pending, test));
  add("Waiting for the team", [
    ...(rows.scanWaiting > 0 ? [{ text: `${plural(rows.scanWaiting, "answer")} waiting for a team mark (now)`, path: `${ADMIN_PATH}/scans` }] : []),
    ...runs.map((r) => ({ text: `Workbook run ${r.status === "stale" ? "stopped" : "failed"}, run ${short(r.id)}`, path: `${ADMIN_PATH}/workbooks/runs/${r.id}` })),
    ...book1.map((b) => ({ text: `Book 1 starting record pending (${b.reason}), child ${short(b.childId)}`, path: `${ADMIN_PATH}/next-steps` })),
  ]);

  // Feedback: counts only, never the text.
  const feedback = day(realOnly(rows.feedback, test));
  if (feedback.length) {
    const families = new Set(feedback.map((f) => f.parentId)).size;
    add("Parent feedback", [{ text: `${plural(feedback.length, "message")} from ${plural(families, "family", "families")}`, path: `${ADMIN_PATH}/feedback` }]);
  }

  // Email delivery
  const problems = day(rows.emailProblems).filter((e) => PROBLEM_TYPES.has(e.type));
  const byType = new Map<string, number>();
  for (const e of problems) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  add("Email delivery problems", [...byType].sort(([a], [b]) => a.localeCompare(b)).map(([type, n]) => ({ text: `${plural(n, "email")} ${PROBLEM_WORDS[type]}`, path: `${ADMIN_PATH}/emails` })));

  // Ads by campaign
  const visits = day(rows.adVisits);
  const campaignOf = new Map(rows.adVisits.map((v) => [v.visitId, v.campaign?.trim() || NO_CAMPAIGN]));
  const steps = day(rows.adSteps).filter((s) => campaignOf.has(s.visitId));
  const campaigns = new Map<string, { visits: number; steps: Map<string, number> }>();
  const campaign = (name: string) => campaigns.get(name) ?? campaigns.set(name, { visits: 0, steps: new Map() }).get(name)!;
  for (const v of visits) campaign(v.campaign?.trim() || NO_CAMPAIGN).visits++;
  for (const s of steps) { const c = campaign(campaignOf.get(s.visitId)!); c.steps.set(s.step, (c.steps.get(s.step) ?? 0) + 1); }
  add("Ad visits by campaign", [...campaigns].sort(([a, x], [b, y]) => y.visits - x.visits || a.localeCompare(b)).map(([name, c]) => ({
    text: `${name}: ${plural(c.visits, "visit")}${STEP_ORDER.filter((s) => c.steps.get(s)).map((s) => `, ${c.steps.get(s)} ${STEP_WORDS[s]}`).join("")}`,
    path: `${ADMIN_PATH}/traffic`,
  })));

  // AI cost
  const ai = day(rows.aiUsage);
  if (ai.length) {
    const byFeature = new Map<string, { cost: number; calls: number }>();
    for (const r of ai) {
      const f = byFeature.get(r.feature) ?? { cost: 0, calls: 0 };
      byFeature.set(r.feature, { cost: f.cost + (r.costUsd ?? 0), calls: f.calls + r.calls });
    }
    const total = ai.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
    const calls = ai.reduce((sum, r) => sum + r.calls, 0);
    add("AI cost", [
      { text: `${usd(total)} for ${plural(calls, "call")}`, path: `${ADMIN_PATH}/ai` },
      ...[...byFeature].sort(([a, x], [b, y]) => y.cost - x.cost || a.localeCompare(b)).slice(0, 5).map(([f, v]) => ({ text: `${f}: ${usd(v.cost)}, ${plural(v.calls, "call")}` })),
    ]);
  }

  let week: TeamDigest["week"] = null;
  if (period.week) {
    const current = totals(rows, test, period.week.from, period.week.to);
    const previous = totals(rows, test, period.week.previousFrom, period.week.from);
    const weekVisits = rows.adVisits.filter((v) => inRange(v.at, period.week!.from, period.week!.to));
    const codes = new Set(rows.adSteps.filter((s) => s.step === "code_sent" && inRange(s.at, period.week!.from, period.week!.to)).map((s) => s.visitId));
    const perCampaign = new Map<string, { visits: number; codes: number }>();
    for (const v of weekVisits) {
      const name = v.campaign?.trim() || NO_CAMPAIGN;
      const c = perCampaign.get(name) ?? { visits: 0, codes: 0 };
      perCampaign.set(name, { visits: c.visits + 1, codes: c.codes + (codes.has(v.visitId) ? 1 : 0) });
    }
    const quietCampaigns = [...perCampaign].filter(([, c]) => c.visits >= 20 && c.codes === 0).map(([name]) => name).sort();
    const newFeedback = realOnly(rows.feedback, test).filter((f) => f.status === "new" && inRange(f.at, period.week!.from, period.week!.to)).length;
    week = { current, previous, lookAt: lookAt(current, previous, { paymentFailed: paymentFailed.length, openStarts: openStarts.length, scanWaiting: rows.scanWaiting, newFeedback, quietCampaigns }) };
  }

  if (rows.capped.length) sections.push({ title: "Read limits", lines: rows.capped.map((what) => ({ text: `The ${what} read stopped at its row limit: its counts are at least what is shown.` })) });
  return { day: period.day, weekly: !!week, sections, week, quiet: sections.length === 0 && !(week && week.lookAt.length) };
}

const WEEK_ROWS: [keyof WeekTotals, string][] = [
  ["signups", "New parent signups"], ["finishedTests", "Finished tests"], ["feedback", "Feedback messages"],
  ["emailProblems", "Email delivery problems"], ["safetyAlerts", "Maya safety alerts"], ["failedRuns", "Workbook runs failed or stopped"],
  ["adVisits", "Ad visits"], ["adCodesSent", "Ad visits that got an email code"], ["aiCostUsd", "AI cost"],
];
const weekValue = (key: keyof WeekTotals, v: number) => (key === "aiCostUsd" ? usd(v) : String(v));

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email: subject, plain text and simple HTML, with full admin links on `origin`. */
export function teamDigestEmail(d: TeamDigest, origin: string): { subject: string; text: string; html: string } {
  const count = d.sections.filter((s) => s.title !== "Read limits").length;
  const subject = `Unica daily digest ${d.day}${d.weekly ? " with this week" : ""}: ${d.quiet ? "nothing new" : plural(count, "section")}`;
  const link = (p?: string) => (p ? `${origin}${p}` : null);
  const textLine = (l: DigestLine) => (link(l.path) ? `- ${l.text.replace(/\.$/, "")}: ${link(l.path)}` : `- ${l.text}`);
  const text: string[] = [`Unica Learning, daily digest for the 24 hours up to ${TEAM_DIGEST_HOUR} a.m. Pacific on ${d.day}.`, "Test families are left out, except for safety alerts.", ""];
  const html: string[] = [`<p>Daily digest for the 24 hours up to ${TEAM_DIGEST_HOUR} a.m. Pacific on ${escape(d.day)}. Test families are left out, except for safety alerts.</p>`];
  if (d.quiet) {
    text.push("Nothing new in the last day, and nothing waits for the team.", "");
    html.push("<p>Nothing new in the last day, and nothing waits for the team.</p>");
  }
  for (const s of d.sections) {
    text.push(s.title.toUpperCase(), ...s.lines.map((l) => textLine(l)), "");
    html.push(`<h3 style="margin:20px 0 6px;font-size:15px">${escape(s.title)}</h3><ul style="margin:0;padding-left:20px">${s.lines.map((l) => `<li>${link(l.path) ? `<a href="${escape(link(l.path)!)}">${escape(l.text)}</a>` : escape(l.text)}</li>`).join("")}</ul>`);
  }
  if (d.week) {
    const w = d.week;
    text.push("THIS WEEK (last 7 days, the 7 days before in brackets)", ...WEEK_ROWS.map(([k, label]) => `- ${label}: ${weekValue(k, w.current[k])} (${weekValue(k, w.previous[k])})`), "");
    html.push(`<h3 style="margin:24px 0 6px;font-size:15px">This week</h3><table style="border-collapse:collapse;font-size:14px"><tr><th style="text-align:left;padding:2px 12px 2px 0"></th><th style="text-align:right;padding:2px 12px">Last 7 days</th><th style="text-align:right;padding:2px 0 2px 12px">7 days before</th></tr>${WEEK_ROWS.map(([k, label]) => `<tr><td style="padding:2px 12px 2px 0">${label}</td><td style="text-align:right;padding:2px 12px">${weekValue(k, w.current[k])}</td><td style="text-align:right;padding:2px 0 2px 12px">${weekValue(k, w.previous[k])}</td></tr>`).join("")}</table>`);
    const items = w.lookAt.length ? w.lookAt : [{ text: "Nothing the rules flag this week." }];
    text.push("THINGS TO LOOK AT", ...items.map((l) => textLine(l)), "");
    html.push(`<h3 style="margin:20px 0 6px;font-size:15px">Things to look at</h3><ul style="margin:0;padding-left:20px">${items.map((l) => `<li>${link(l.path) ? `<a href="${escape(link(l.path)!)}">${escape(l.text)}</a>` : escape(l.text)}</li>`).join("")}</ul>`);
  }
  text.push(`Dashboard: ${origin}${ADMIN_PATH}`);
  html.push(`<p style="margin-top:24px"><a href="${origin}${ADMIN_PATH}">Open the admin dashboard</a></p>`);
  return {
    subject,
    text: text.join("\n"),
    html: `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f;max-width:640px;margin:0 auto;padding:16px;line-height:1.45">${html.join("")}</body></html>`,
  };
}
