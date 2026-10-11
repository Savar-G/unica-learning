// The report emails (#65): the report to the parent, and an alert to Savar for each finished test.
// Plain until the report design (#80, D-087) restyles them. The parent email says what the report page says
// (src/lib/report-view.ts). Pure: the background job (src/lib/report-job.ts) sends them through Resend.
import { BUSINESS_NAME } from "@/lib/contact";
import {
  NEXT_STEP_ANCHOR,
  STATUS_LABEL,
  factsView,
  howWeHelp,
  levelName,
  levelNotes,
  levelSentence,
  nextStep,
  questionsAndMinutes,
  thresholdsLine,
  verdictSentence,
  type FactsView,
  type NextStepKey,
  type ReportView,
} from "@/lib/report-view";

/** The parent the report goes to. */
export interface ParentContact {
  name: string;
  email: string;
}

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);

// Colours of the warm look (src/ds/styles/warm.css). Email clients need them inline, as hex.
const INK = "#0c0c0e";
const INK_2 = "#44444c";
const LINE = "#e4e4e7";
const CARD = "#f5f4f2";
const BUTTON = "#2b2622";
/** The working level's marker: behind tangerine, on grade leaf, ahead sky (DESIGN.md, report). */
const VERDICT_COLOUR = { behind: "#ff6a3d", "on-grade": "#2fb37a", ahead: "#5b8def" } as const;
/** Status chips: leaf, sunflower and tangerine, each mixed 22% with white. */
const STATUS_TINT = { secure: "#d1eee2", developing: "#fff3d4", "needs-attention": "#ffded4" } as const;
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** The K-8 scale as a table row: the working level filled in the verdict colour, the school grade in a dashed ring. */
function scaleHtml(v: ReportView): string {
  const { working, grade } = v.model.level;
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((level) => {
    const label = level === 0 ? "K" : String(level);
    const fill = level === working ? `background:${VERDICT_COLOUR[v.model.howWeHelp]};font-weight:600;` : "";
    const ring = level === grade ? `border:2px dashed ${INK};` : "border:2px solid transparent;";
    return `<td align="center" style="padding:6px 0"><span style="display:inline-block;width:32px;height:32px;line-height:32px;border-radius:50%;${fill}${ring}color:${INK};font-size:14px">${label}</span></td>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px"><tr>${cells.join("")}</tr></table>
<p style="margin:10px 0 0;font-size:13px;color:${INK_2}">Filled circle: working level (${esc(levelName(working))}). Dashed ring: school grade (${esc(levelName(grade))}).</p>`;
}

/** Accuracy beside speed in one line, or what happened when nothing was answered. */
const factsLine = (f: FactsView) => (f.accuracy && f.speed ? `${f.accuracy.value} (${f.accuracy.label}), ${f.speed.value} (${f.speed.label})` : (f.note ?? ""));

/** The facts chips: Secure and Quick in leaf, Needs practice in sunflower (never the tangerine of "Needs attention"). */
const factsChip = (label: string) =>
  `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${label === "Needs practice" ? STATUS_TINT.developing : STATUS_TINT.secure};font-size:13px">${esc(label)}</span>`;

/**
 * The report link, opened at the next step (#66): the plan choice or the waitlist. Emails carry links only, so the
 * click on the report page does the step. A signed-out parent signs in first and comes back to the same step.
 */
function withStep(reportUrl: string, step: NextStepKey): string {
  const u = new URL(reportUrl);
  u.searchParams.set("step", step);
  u.hash = NEXT_STEP_ANCHOR;
  return u.toString();
}

/** The report for the parent, with a link that opens it in their account. */
export function reportEmail({ view: v, parentName, url }: { view: ReportView; parentName: string; url: string }) {
  const name = v.childName;
  const first = firstName(parentName);
  const subject = `${name}'s math report is ready`;
  const intro = `${name} finished the math placement test: ${questionsAndMinutes(v)}.`;
  const notes = levelNotes(v);
  const fsa = v.model.fsa;
  const facts = factsView(v);
  const help = howWeHelp(v);
  const step = nextStep(v);
  const stepUrl = withStep(url, step.email.step);
  const areas = v.model.strands.map((s) => `${s.name}: ${STATUS_LABEL[s.status]}, ${s.correct} of ${s.total} right`);
  const footer = `You get this email because you asked for ${name}'s free math placement report. Questions? Reply to this email.`;

  const text = [
    `Hi ${first},`,
    intro,
    [levelSentence(v), verdictSentence(v), ...notes].join("\n"),
    ...(fsa ? [`For context: ${fsa.text}\nSource: ${fsa.source.name}, ${fsa.source.url}`] : []),
    ["By area", ...areas, thresholdsLine(v)].join("\n"),
    ...(facts ? [[`Number facts: ${factsLine(facts)}`, ...(facts.accuracy && facts.note ? [facts.note] : []), `${facts.scope} ${facts.round}`].join("\n")] : []),
    `How we help: ${help.title}\n${help.text}`,
    `${step.title}\n${step.text}\n${step.email.label}: ${stepUrl}`,
    `See ${name}'s full report: ${url}`,
    `${BUSINESS_NAME}\n${footer}`,
  ].join("\n\n");

  const p = (body: string, style = "") => `<p style="margin:0 0 14px;${style}">${body}</p>`;
  const areaRows = v.model.strands
    .map(
      (s) => `<tr>
<td style="padding:10px 0;border-top:1px solid ${LINE}">${esc(s.name)}</td>
<td style="padding:10px 8px;border-top:1px solid ${LINE};white-space:nowrap"><span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${STATUS_TINT[s.status]};font-size:13px">${STATUS_LABEL[s.status]}</span></td>
<td align="right" style="padding:10px 0;border-top:1px solid ${LINE};white-space:nowrap">${s.correct} of ${s.total}</td>
</tr>`,
    )
    .join("");

  const html = `<div style="background:#ffffff;padding:24px 0">
<span style="display:none;max-height:0;overflow:hidden">${esc(levelSentence(v))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:${FONT};font-size:16px;line-height:1.5;color:${INK}">
<tr><td style="padding:0 24px 14px;border-bottom:1px solid ${LINE};font-size:18px;font-weight:600">${esc(BUSINESS_NAME)}</td></tr>
<tr><td style="padding:24px 24px 4px">
${p(`Hi ${esc(first)},`)}
${p(esc(intro))}
</td></tr>
<tr><td style="padding:0 24px">
<div style="background:${CARD};border-radius:10px;padding:22px">
${p(esc(levelSentence(v)), "font-size:26px;line-height:1.2;font-weight:300")}
${p(esc(verdictSentence(v)))}
${scaleHtml(v)}
${notes.map((n) => p(esc(n), `margin:12px 0 0;font-size:14px;color:${INK_2}`)).join("\n")}
${fsa ? p(`For context: ${esc(fsa.text)}<br><a href="${esc(fsa.source.url)}" style="color:${INK_2}">Source: ${esc(fsa.source.name)}</a>`, `margin:14px 0 0;font-size:14px;color:${INK_2}`) : ""}
</div>
</td></tr>
<tr><td style="padding:24px 24px 0">
<p style="margin:0 0 6px;font-weight:600">By area</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${areaRows}</table>
${p(esc(thresholdsLine(v)), `margin:10px 0 0;font-size:13px;color:${INK_2}`)}
</td></tr>
${facts ? `<tr><td style="padding:24px 24px 0">
<p style="margin:0 0 6px;font-weight:600">Number facts</p>
${facts.accuracy && facts.speed
    ? p(`${esc(facts.accuracy.value)} ${factsChip(facts.accuracy.label)} &nbsp;·&nbsp; ${esc(facts.speed.value)} ${factsChip(facts.speed.label)}`, "margin:0 0 8px;font-size:15px")
    : ""}
${facts.note ? p(esc(facts.note), "margin:0 0 8px;font-size:15px") : ""}
${p(`${esc(facts.scope)} ${esc(facts.round)}`, `margin:0;font-size:13px;color:${INK_2}`)}
</td></tr>` : ""}
<tr><td style="padding:24px 24px 0">
<p style="margin:0 0 6px;font-weight:600">How we help: ${esc(help.title)}</p>
${p(esc(help.text))}
<p style="margin:0 0 6px;font-weight:600">${esc(step.title)}</p>
${p(esc(step.text))}
</td></tr>
<tr><td align="center" style="padding:10px 24px 12px">
<a href="${esc(stepUrl)}" style="display:inline-block;background:${BUTTON};color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600">${esc(step.email.label)}</a>
</td></tr>
<tr><td align="center" style="padding:6px 24px 28px">
<a href="${esc(url)}" style="color:${INK};text-decoration:underline">See ${esc(name)}&#39;s full report</a>
</td></tr>
<tr><td style="padding:16px 24px 0;border-top:1px solid ${LINE};font-size:13px;color:${INK_2}">${esc(BUSINESS_NAME)} · ${esc(footer)}</td></tr>
</table>
</div>`;
  return { subject, text, html };
}

const COMPARISON_LABEL = { scale: "grade-level scale only", bands: "bands among Unica children", percentile: "percentile among Unica children" } as const;

/** A flag as one line. Flags arrive with #71; until then the list is empty. */
const flagText = (flag: unknown) => (typeof flag === "string" ? flag : JSON.stringify(flag));

/** The alert to Savar for each finished test (D-085): grade, working level, flags and the link, as plain text. */
export function reportAlert({
  view: v,
  parent,
  url,
  flags,
  completedInGrade,
  parentEmail,
}: {
  view: ReportView;
  parent: ParentContact;
  url: string;
  flags: readonly unknown[];
  /** Completed tests in the child's grade, the count the comparison stage came from. */
  completedInGrade: number;
  parentEmail: { sent: true } | { sent: false; reason: string };
}) {
  const m = v.model;
  const facts = factsView(v);
  const subject = `Test finished: ${v.childName}, grade ${m.level.grade}, working at ${levelName(m.level.working)}`;
  const lines = [
    `Child: ${v.childName}`,
    `School grade: ${m.level.grade} (${v.province})`,
    `Working level: ${levelName(m.level.working)} (${m.howWeHelp})${m.level.atCeiling ? ", at the top of what the test reached" : ""}${m.level.confidence === "low" ? ", low confidence: no level cleared" : ""}`,
    `Flags: ${flags.length ? flags.map(flagText).join("; ") : "none"}`,
    `Areas: ${m.strands.map((s) => `${s.name} ${STATUS_LABEL[s.status]} ${s.correct}/${s.total}`).join("; ")}`,
    `Facts: ${facts ? factsLine(facts) : "none"}`,
    `Questions: ${questionsAndMinutes(v)}`,
    `Comparison: ${COMPARISON_LABEL[m.comparison.stage]} (${completedInGrade} completed tests in grade ${m.level.grade})`,
    `FSA line: ${m.fsa ? "shown" : "not shown"}`,
    `Next step: ${m.callToAction}`,
    `Parent: ${parent.name} <${parent.email}>`,
    parentEmail.sent ? `Parent email: sent to ${parent.email}` : `Parent email: NOT SENT (${parentEmail.reason}). Send the report link by hand.`,
    `Report: ${url}`,
    `Report id: ${v.id}`,
  ];
  return { subject, text: lines.join("\n") };
}
