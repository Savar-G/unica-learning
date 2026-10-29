// The report emails (#65): the report to the parent, and an alert to Savar for each finished test.
// The parent email has the look of the chosen report design (D-087, #80): one 600 px column, the level and the verdict
// in the grainy colour band with the K-8 ruler, a meter per area. It says what the report page says
// (src/lib/report-view.ts). Pure: the background job (src/lib/report-job.ts) sends them through the email delivery
// module (src/lib/email-delivery.ts).
// Email-safe: tables and inline styles only, no web fonts, no forms; the band's one image is an absolute URL, with the
// band's base colour behind it for mail apps that block images.
import { PAUSE_WINDOW, STRAND_DEVELOPING_PERCENT, STRAND_SECURE_PERCENT, TOO_FAST_MS, TOP_LEVEL, type Flag, type HelpAnswer, type StrandStatus } from "@/lib/assessment";
import { BOOKING_URL } from "@/lib/contact";
import { emailEndHtml, emailFooterText, emailHeaderHtml, emailSignatureText } from "@/lib/email-brand";
import type { AiOutcome } from "@/lib/work-review";
import {
  NEXT_STEP_ANCHOR,
  STATUS_LABEL,
  certaintyText,
  comparisonView,
  factsView,
  helpWarning,
  howWeHelp,
  leftOutLine,
  levelName,
  levelNotes,
  levelSentence,
  moreCount,
  nextStep,
  questionsAndMinutes,
  reliabilityNote,
  sharePercent,
  STRENGTHS_SHOWN,
  STRUGGLES_SHOWN,
  strengthsNote,
  strengthsView,
  strugglesNote,
  strugglesView,
  summaryText,
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
const LINE_SOFT = "#ececef";
const CARD = "#f5f4f2";
const BUTTON = "#2b2622";
const ACCENT = "#ff6a3d";
/** The colour band's base (peach): what shows when a mail app blocks the band image. */
const BAND_BASE = "#ffd9b8";
/** The grainy colour band (sunflower, sky, mint on peach), served from public/email. */
const BAND_IMAGE = "/email/report-band.jpg";
/** Sunflower: the help warning (#71), a caution, never the tangerine of "behind". */
const SUNFLOWER = "#ffc93c";
/** The working level's marker: behind tangerine, on grade leaf, ahead sky (DESIGN.md, report). */
const VERDICT_COLOUR = { behind: "#ff6a3d", "on-grade": "#2fb37a", ahead: "#5b8def" } as const;
/** The span between the working level and the school grade: the verdict colour, 16% on white. */
const VERDICT_TINT = { behind: "#ffe7e0", "on-grade": "#def3ea", ahead: "#e5edfc" } as const;
/** Status chips, as on the report page (src/components/report.css): a tint and a dark text of the same colour. */
const STATUS_CHIP: Record<StrandStatus, { bg: string; fg: string }> = {
  secure: { bg: "#e3f5ec", fg: "#146b45" },
  developing: { bg: "#fff2c7", fg: "#6e5200" },
  "needs-attention": { bg: "#ffe6db", fg: "#a8360f" },
};
/** The meter's three zones, as on the report page. */
const ZONE = { attention: "#ffd9cb", developing: "#ffe9a6", secure: "#cdeedc" } as const;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const chip = ({ bg, fg }: { bg: string; fg: string }, label: string) =>
  `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${bg};color:${fg};font-family:${MONO};font-size:12px;line-height:1.3;white-space:nowrap">${esc(label)}</span>`;

/**
 * The K-8 ruler on white: the working level filled in the verdict colour, the school grade in a dashed ring, the span
 * tinted. D-156: grade 9 is past the end of the ruler: no ring and no span, and the legend says where the scale stops.
 */
function rulerHtml(v: ReportView): string {
  const { working, grade } = v.model.level;
  const onScale = grade <= TOP_LEVEL;
  const mark = onScale ? grade : working;
  const [lo, hi] = [Math.min(working, mark), Math.max(working, mark)];
  const verdict = v.model.howWeHelp;
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((level) => {
    const label = level === 0 ? "K" : String(level);
    const inSpan = lo !== hi && level >= lo && level <= hi;
    const cell = [
      "padding:6px 0",
      inSpan ? `background:${VERDICT_TINT[verdict]}` : "",
      inSpan && level === lo ? "border-radius:6px 0 0 6px" : "",
      inSpan && level === hi ? "border-radius:0 6px 6px 0" : "",
      level > 0 && !inSpan && !(level === hi + 1 && lo !== hi) ? `border-left:1px solid ${LINE_SOFT}` : "",
    ].filter(Boolean).join(";");
    const fill = level === working ? `background:${VERDICT_COLOUR[verdict]};font-weight:600;color:${INK};` : `color:${onScale && level === grade ? INK : "#6b6b74"};`;
    const ring = onScale && level === grade ? `border:2px dashed ${INK};` : "border:2px solid transparent;";
    return `<td align="center" width="11%" style="${cell}"><span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:50%;${fill}${ring}font-size:14px">${label}</span></td>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;border-radius:10px">
<tr><td style="padding:8px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr>${cells.join("")}</tr></table></td></tr>
</table>
<p style="margin:10px 0 0;font-family:${MONO};font-size:12px;line-height:1.5;color:${INK}"><span style="white-space:nowrap"><span style="color:${VERDICT_COLOUR[verdict]}">&#9679;</span>&nbsp;Working level: ${esc(levelName(working))}</span> &nbsp;&nbsp; <span style="white-space:nowrap">&#9676;&nbsp;School grade: ${esc(levelName(grade))}${onScale ? "" : " (the scale stops at grade 8)"}</span></p>`;
}

/**
 * One area's meter, drawn with table cells: three zones (Needs attention, Developing, Secure, split at the thresholds)
 * and an ink marker at the share right. Decorative: the count beside it carries the number.
 */
function meterHtml(share: number): string {
  const at = Math.min(100, Math.max(0, share));
  const zones: [number, number, string][] = [
    [0, STRAND_DEVELOPING_PERCENT, ZONE.attention],
    [STRAND_DEVELOPING_PERCENT, STRAND_SECURE_PERCENT, ZONE.developing],
    [STRAND_SECURE_PERCENT, 100, ZONE.secure],
  ];
  const before = zones.map(([a, b, c]): [number, number, string] => [a, Math.min(b, at), c]).filter(([a, b]) => b > a);
  const after = zones.map(([a, b, c]): [number, number, string] => [Math.max(a, at), b, c]).filter(([a, b]) => b > a);
  const seg = ([a, b, c]: [number, number, string], first: boolean, last: boolean) =>
    `<td width="${b - a}%" style="padding:5px 0"><div style="height:8px;line-height:8px;font-size:0;background:${c};border-radius:${first ? "4px" : "0"} ${last ? "4px 4px" : "0 0"} ${first ? "4px" : "0"}">&nbsp;</div></td>`;
  const cells = [
    ...before.map((z, i) => seg(z, i === 0, false)),
    `<td width="3" style="width:3px;background:${INK};border-radius:2px;font-size:0;line-height:0">&nbsp;</td>`,
    ...after.map((z, i) => seg(z, false, i === after.length - 1)),
  ];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr style="height:18px">${cells.join("")}</tr></table>`;
}

/** Accuracy beside speed in one line (accuracy alone in grades 1-4, D-120), or what happened when nothing was answered. */
const factsLine = (f: FactsView) =>
  f.accuracy ? `${f.accuracy.value} (${f.accuracy.label})${f.speed ? `, ${f.speed.value} (${f.speed.label})` : ""}` : (f.note ?? "");

/** The facts chips: Secure and Quick in leaf, Needs practice in sunflower (never the tangerine of "Needs attention"). */
const factsChip = (label: string) => chip(label === "Needs practice" ? STATUS_CHIP.developing : STATUS_CHIP.secure, label);

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

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:${BUTTON};color:#ffffff;text-decoration:none;padding:15px 24px;border-radius:6px;font-weight:600;font-size:16px;line-height:1.2">${esc(label)}</a>`;

/**
 * The report for the parent, with a link that opens it in their account. CASL: the email offers a plan, so it names the
 * sender, gives the mailing address and the website, and has an unsubscribe link (#80). `offer` is false when the
 * parent has unsubscribed: the email is then only the report they asked for, with no plan or waitlist button.
 */
export function reportEmail({ view: v, parentName, url, unsubscribeUrl, offer = true }: { view: ReportView; parentName: string; url: string; unsubscribeUrl: string; offer?: boolean }) {
  const name = v.childName;
  const first = firstName(parentName);
  const subject = `${name}'s math report is ready`;
  const intro = `${name} finished the math placement test: ${questionsAndMinutes(v)}.`;
  const notes = levelNotes(v);
  // #68: the AI paragraph, when the report has one, follows the level as on the report page.
  const summary = summaryText(v);
  const fsa = v.model.fsa;
  const comparison = comparisonView(v);
  const facts = factsView(v);
  const help = howWeHelp(v);
  const warning = helpWarning(v);
  // #189: how sure each result is, the reliability note (its new test opens from the report), and left-out answers.
  const reliability = reliabilityNote(v);
  const levelSure = certaintyText(v, v.model.level.certainty);
  const leftOut = leftOutLine(v);
  const sure = (s: ReportView["model"]["strands"][number]) => certaintyText(v, s.certainty);
  // #198: strengths and struggles, from the learner profile's facts. The workbook 1 preview needs the
  // AI parts, which the job writes after this email (D-117), so the email has none; the account report shows it.
  const strengths = strengthsView(v);
  const struggles = strugglesView(v);
  const shownStrengths = strengths?.slice(0, STRENGTHS_SHOWN) ?? [];
  const shownStruggles = struggles?.slice(0, STRUGGLES_SHOWN) ?? [];
  const moreStruggles = (struggles?.length ?? 0) - shownStruggles.length;
  const moreStrengths = (strengths?.length ?? 0) - shownStrengths.length;
  const step = offer ? nextStep(v) : null;
  const stepUrl = step ? withStep(url, step.email.step) : null;
  const areas = v.model.strands.map((s) => `${s.name}: ${STATUS_LABEL[s.status]}, ${s.correct} of ${s.total} right${sure(s) ? ` (${sure(s)})` : ""}`);
  // #67: the drawings stay in private storage, so the email does not carry them; the report shows them after sign-in.
  const work = (v.model.work ?? []).length > 0 ? `${name}'s work from the whiteboard is in the full report.` : null;
  const why = `You get this email because you asked for ${name}'s free math placement report.`;
  const unsubscribe = offer
    ? `Unsubscribe to stop reminders and emails about our plans. ${name}'s report stays in your account.`
    : `You unsubscribed from reminders and emails about our plans, so this email has only the report.`;
  const footer = { why, note: unsubscribe, ...(offer ? { unsubscribe: { url: unsubscribeUrl, label: "Unsubscribe" } } : {}) };
  const origin = new URL(url).origin;

  const text = [
    `Hi ${first},`,
    intro,
    [levelSentence(v), verdictSentence(v), ...(levelSure ? [`How sure: ${levelSure}`] : []), ...notes, ...(summary ? [summary] : [])].join("\n"),
    ...(reliability ? [`${reliability.title}\n${reliability.text}\n${reliability.offer}`] : []),
    ...(fsa ? [`For context: ${fsa.text}\nSource: ${fsa.source.name}, ${fsa.source.url}`] : []),
    ...(comparison ? [`${comparison.title}\n${comparison.text}\n${comparison.note}`] : []),
    ...(warning ? [`${warning.title}\n${warning.text}\n${warning.retake}`] : []),
    ["By area", ...areas, thresholdsLine(v), ...(leftOut ? [leftOut] : [])].join("\n"),
    ...(strengths ? [["Strengths", strengthsNote(v), ...shownStrengths.map((t) => `- ${t.title} (${t.grade}, ${t.count}, ${t.sure})`), ...(moreStrengths > 0 ? [`And ${moreCount(moreStrengths)} in the full report.`] : [])].join("\n")] : []),
    ...(struggles ? [[`To work on\n${strugglesNote(v)}`, ...shownStruggles.map((t) => [
      `${t.title} (${t.grade}): ${STATUS_LABEL[t.status]}, ${t.count} (${t.sure})`,
      `Question: ${t.question}`,
      `${name}'s answer: ${t.answer}. Right answer: ${t.rightAnswer}.`,
      ...(t.cause ? [`Likely cause: ${t.cause}`] : []),
    ].join("\n")), ...(moreStruggles > 0 ? [`The full report shows ${moreCount(moreStruggles)}.`] : [])].join("\n\n")] : []),
    ...(facts ? [[`Number facts: ${factsLine(facts)}`, ...(facts.accuracy && facts.note ? [facts.note] : []), `${facts.scope} ${facts.round}`].join("\n")] : []),
    ...(work ? [work] : []),
    ...(offer ? [`How we help: ${help.title}\n${help.text}`] : []),
    ...(step && stepUrl ? [`${step.title}\n${step.text}\n${step.email.label}: ${stepUrl}`] : []),
    `See ${name}'s full report: ${url}`,
    ...(BOOKING_URL ? [`Want to talk through the results? Book a free 15-minute call with one of our founders: ${BOOKING_URL}`] : []),
    emailSignatureText(),
    emailFooterText(footer),
  ].join("\n\n");

  const p = (body: string, style = "") => `<p style="margin:0 0 14px;${style}">${body}</p>`;
  const heading = (body: string) => `<p style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:600;color:${INK}">${body}</p>`;
  const areaRows = v.model.strands
    .map(
      (s) => `<tr>
<td style="padding:14px 0 2px;border-top:1px solid ${LINE};font-size:15px;line-height:1.35">${esc(s.name)}</td>
<td align="right" style="padding:14px 0 2px;border-top:1px solid ${LINE};font-family:${MONO};font-size:13px;white-space:nowrap">${s.correct} of ${s.total}</td>
</tr>
<tr>
<td style="padding:4px 16px 14px 0">${meterHtml(sharePercent(s))}</td>
<td align="right" style="padding:4px 0 14px;white-space:nowrap">${chip(STATUS_CHIP[s.status], STATUS_LABEL[s.status])}${sure(s) ? `<br><span style="font-family:${MONO};font-size:11px;line-height:1.6;color:${INK_2}">${esc(sure(s)!)}</span>` : ""}</td>
</tr>`,
    )
    .join("");
  const legend = [
    [ZONE.attention, "Needs attention"],
    [ZONE.developing, "Developing"],
    [ZONE.secure, "Secure"],
  ].map(([c, l]) => `<span style="display:inline-block;width:14px;height:8px;border-radius:2px;background:${c}"></span>&nbsp;${l}`).join(" &nbsp;&nbsp; ");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="background:#ffffff;padding:24px 0">
<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(levelSentence(v))} ${esc(verdictSentence(v))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;font-family:${FONT};font-size:16px;line-height:1.5;color:${INK}">
${emailHeaderHtml(20)}
<tr><td style="padding:0 20px 6px">
${p(`Hi ${esc(first)},`)}
${p(esc(intro))}
</td></tr>
<tr><td style="padding:0 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BAND_BASE}" background="${esc(origin + BAND_IMAGE)}" style="background-color:${BAND_BASE};background-image:url('${esc(origin + BAND_IMAGE)}');background-size:cover;background-position:center;border-radius:14px">
<tr><td style="padding:26px 20px 22px">
<p style="margin:0 0 10px;font-family:${MONO};font-size:12px;line-height:1.2;color:${INK}"><span style="display:inline-block;width:8px;height:8px;margin-right:6px;background:${ACCENT}"></span>Overall</p>
${p(esc(levelSentence(v)), "margin:0 0 8px;font-size:28px;line-height:1.15;font-weight:300;letter-spacing:-0.02em")}
${p(esc(verdictSentence(v)), levelSure ? "margin:0 0 6px;font-size:17px" : "margin:0 0 18px;font-size:17px")}
${levelSure ? p(esc(`How sure: ${levelSure}`), `margin:0 0 18px;font-family:${MONO};font-size:13px`) : ""}
${rulerHtml(v)}
${notes.map((n) => p(esc(n), `margin:12px 0 0;font-size:14px;color:${INK_2}`)).join("\n")}
${summary ? p(esc(summary), "margin:16px 0 0;font-size:16px") : ""}
</td></tr>
</table>
</td></tr>
${fsa ? `<tr><td style="padding:16px 20px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid #5b8def;background:${CARD};padding:12px 16px;font-size:14px;line-height:1.5;color:${INK_2}">
<p style="margin:0 0 4px;font-family:${MONO};font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:${INK}">For context</p>
<p style="margin:0">${esc(fsa.text)}</p>
<p style="margin:4px 0 0;font-size:12px"><a href="${esc(fsa.source.url)}" style="color:${INK_2}">Source: ${esc(fsa.source.name)}</a></p>
</td></tr></table>
</td></tr>` : ""}
${comparison ? `<tr><td style="padding:16px 20px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid #5b8def;background:${CARD};padding:12px 16px;font-size:14px;line-height:1.5;color:${INK_2}">
<p style="margin:0 0 4px;font-family:${MONO};font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:${INK}">${esc(comparison.title)}</p>
<p style="margin:0">${esc(comparison.text)}</p>
<p style="margin:4px 0 0;font-size:12px">${esc(comparison.note)}</p>
</td></tr></table>
</td></tr>` : ""}
${reliability ? `<tr><td style="padding:16px 20px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ${SUNFLOWER};background:${CARD};padding:14px 16px">
<p style="margin:0 0 6px;font-weight:600">${esc(reliability.title)}</p>
${p(esc(reliability.text), "margin:0 0 6px;font-size:15px")}
${p(esc(reliability.offer), "margin:0;font-size:15px")}
</td></tr></table>
</td></tr>` : ""}
${warning ? `<tr><td style="padding:16px 20px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ${SUNFLOWER};background:${CARD};padding:14px 16px">
<p style="margin:0 0 6px;font-weight:600">${esc(warning.title)}</p>
${p(esc(warning.text), "margin:0 0 6px;font-size:15px")}
${p(esc(warning.retake), "margin:0;font-size:15px")}
</td></tr></table>
</td></tr>` : ""}
<tr><td style="padding:30px 20px 0">
${heading("By area")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${areaRows}</table>
<p style="margin:2px 0 6px;font-family:${MONO};font-size:11px;line-height:1.6;color:${INK_2}">${legend}</p>
${p(esc(thresholdsLine(v)), `margin:0;font-size:13px;color:${INK_2}`)}
${leftOut ? p(esc(leftOut), `margin:6px 0 0;font-size:13px;color:${INK_2}`) : ""}
</td></tr>
${strengths ? `<tr><td style="padding:30px 20px 0">
${heading("Strengths")}
${p(esc(strengthsNote(v)), `margin:0 0 10px;font-size:13px;color:${INK_2}`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${shownStrengths.map((t) => `<tr>
<td valign="top" width="14" style="padding:10px 0 8px;border-top:1px solid ${LINE}"><span style="display:inline-block;width:8px;height:8px;margin-top:6px;border-radius:2px;background:${STATUS_CHIP.secure.fg}"></span></td>
<td style="padding:8px 0;border-top:1px solid ${LINE};font-size:15px;line-height:1.4">${esc(t.title)}<br><span style="font-family:${MONO};font-size:12px;color:${INK_2}">${esc(`${t.grade} · ${t.count} · ${t.sure}`)}</span></td>
</tr>`).join("")}</table>
${moreStrengths > 0 ? p(`And ${esc(moreCount(moreStrengths))} in the <a href="${esc(url)}" style="color:${INK}">full report</a>.`, `margin:8px 0 0;font-size:13px;color:${INK_2}`) : ""}
</td></tr>` : ""}
${struggles ? `<tr><td style="padding:30px 20px 0">
${heading("To work on")}
${p(esc(strugglesNote(v)), `margin:0 0 12px;font-size:13px;color:${INK_2}`)}
${shownStruggles.map((t) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr><td style="background:${CARD};border-radius:10px;padding:14px 16px">
<p style="margin:0 0 4px;font-size:16px;line-height:1.35;font-weight:600">${esc(t.title)}</p>
<p style="margin:0 0 10px">${chip(STATUS_CHIP[t.status], STATUS_LABEL[t.status])} <span style="font-family:${MONO};font-size:12px;color:${INK_2}">${esc(`${t.grade} · ${t.count} · ${t.sure}`)}</span></p>
<p style="margin:0 0 4px;font-family:${MONO};font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:${INK_2}">Question</p>
${p(esc(t.question), "margin:0 0 8px;font-size:15px")}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px"><tr>
<td style="padding:0 24px 0 0"><p style="margin:0;font-family:${MONO};font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:${INK_2}">${esc(name)}&#39;s answer</p><p style="margin:2px 0 0;font-size:17px;color:${STATUS_CHIP["needs-attention"].fg}">${esc(t.answer)}</p></td>
<td><p style="margin:0;font-family:${MONO};font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:${INK_2}">Right answer</p><p style="margin:2px 0 0;font-size:17px;color:${STATUS_CHIP.secure.fg}">${esc(t.rightAnswer)}</p></td>
</tr></table>
${t.cause ? `<p style="margin:10px 0 2px;font-family:${MONO};font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:${INK_2}">Likely cause</p>${p(esc(t.cause), "margin:0;font-size:15px")}` : ""}
</td></tr></table>`).join("\n")}
${moreStruggles > 0 ? p(`The <a href="${esc(url)}" style="color:${INK}">full report</a> shows ${esc(moreCount(moreStruggles))}.`, `margin:0;font-size:14px;color:${INK_2}`) : ""}
</td></tr>` : ""}
${facts ? `<tr><td style="padding:30px 20px 0">
${heading("Number facts")}
${facts.accuracy
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="50%" valign="top" style="padding:14px 16px;background:${CARD};border-radius:${facts.speed ? "10px 0 0 10px" : "10px"};border-right:2px solid #ffffff">
<p style="margin:0 0 4px;font-family:${MONO};font-size:12px;color:${INK_2}">Accuracy</p>
<p style="margin:0 0 8px;font-size:18px;line-height:1.3">${esc(facts.accuracy.value)}</p>
${factsChip(facts.accuracy.label)}
</td>
${facts.speed ? `<td width="50%" valign="top" style="padding:14px 16px;background:${CARD};border-radius:0 10px 10px 0">
<p style="margin:0 0 4px;font-family:${MONO};font-size:12px;color:${INK_2}">Speed</p>
<p style="margin:0 0 8px;font-size:18px;line-height:1.3">${esc(facts.speed.value)}</p>
${factsChip(facts.speed.label)}
</td>` : `<td width="50%"></td>`}
</tr></table>`
    : ""}
${facts.note ? p(esc(facts.note), "margin:12px 0 0;font-size:15px") : ""}
${p(`${esc(facts.scope)} ${esc(facts.round)}`, `margin:10px 0 0;font-size:13px;color:${INK_2}`)}
</td></tr>` : ""}
${work ? `<tr><td style="padding:30px 20px 0">
${heading(`${esc(name)}&#39;s work`)}
${p(`${esc(name)}&#39;s work from the whiteboard is in the <a href="${esc(url)}" style="color:${INK}">full report</a>.`, "margin:0;font-size:15px")}
</td></tr>` : ""}
${offer ? `<tr><td style="padding:30px 20px 0">
${heading(`How we help: ${esc(help.title)}`)}
${p(esc(help.text), "margin:0")}
</td></tr>` : ""}
${step && stepUrl ? `<tr><td style="padding:30px 20px 0">
${heading(esc(step.title))}
${p(esc(step.text), "margin:0 0 20px;font-size:15px")}
${button(stepUrl, step.email.label)}
</td></tr>
<tr><td style="padding:18px 20px 4px">
<a href="${esc(url)}" style="color:${INK};text-decoration:underline">See ${esc(name)}&#39;s full report</a>
</td></tr>` : `<tr><td style="padding:30px 20px 4px">
${button(url, `See ${name}'s full report`)}
</td></tr>`}
${BOOKING_URL ? `<tr><td style="padding:22px 20px 4px">
${p(`Want to talk through the results? <a href="${esc(BOOKING_URL)}" style="color:${INK};text-decoration:underline">Book a free 15-minute call</a> with one of our founders.`, "margin:0;font-size:15px")}
</td></tr>` : ""}
${emailEndHtml(footer, 20)}
</table>
</div>
</body>
</html>`;
  return { subject, text, html };
}

const COMPARISON_LABEL = { scale: "grade-level scale only", bands: "bands among Unica children", percentile: "percentile among Unica children" } as const;

const HELP_LABEL: Record<HelpAnswer, string> = { yes: "Yes", "a-little": "A little", no: "No" };

/** "4 min 10 s". */
const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} min ${s % 60} s`;
};

/** A help flag (#71) in plain words, for Savar only. */
function flagText(flag: Flag): string {
  switch (flag.kind) {
    case "helped":
      return `child answered "${HELP_LABEL[flag.answer]}" to "Did anyone help?"`;
    case "too-fast":
      return `${flag.questionIds.length} answer${flag.questionIds.length === 1 ? "" : "s"} under ${TOO_FAST_MS / 1000} seconds, ${flag.right} right (${flag.questionIds.join(", ")})`;
    case "pause-then-perfect":
      return `${duration(flag.pauseMs)} on ${flag.questionId}, then ${PAUSE_WINDOW} right in a row after ${flag.rightBefore} of ${PAUSE_WINDOW} right before`;
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What the AI step did (#68), in one line for Savar. */
function aiLine(ai: AiOutcome): string {
  if (!ai.on) return "AI review: off (no OPENROUTER_API_KEY). The report has no AI comments and no AI text.";
  const parts = [`${plural(ai.pieces, "piece")} of work`, `${ai.reviewed} reviewed`, `${ai.sure} sure enough to show a comment`];
  if (ai.failed > 0) parts.push(`${ai.failed} failed or timed out`);
  if (ai.skipped > 0) parts.push(`${ai.skipped} over the limit not reviewed`);
  const reviews = ai.error ? `the work could not be loaded (${ai.error}), so nothing was reviewed` : parts.join(", ");
  const stored = ai.saved ? "" : " NOT STORED: the reviews are only in this report.";
  const t = ai.text;
  const text = t.kept
    ? "kept."
    : `${t.problem === "failed" ? `failed (${t.detail})` : `rejected (${t.problem}: ${t.detail})`}, so the report has only its plain sentences.`;
  return `AI review (${ai.model}): ${reviews}.${stored} Report text: ${text}`;
}

/** The alert to Savar for each finished test (D-085): grade, working level, flags and the link, as plain text. */
export function reportAlert({
  view: v,
  parent,
  url,
  flags,
  help = null,
  parentEmail,
  ai,
}: {
  view: ReportView;
  parent: ParentContact;
  url: string;
  /** The placement's help flags (#71). Placements stored before #71 have none. */
  flags: readonly Flag[];
  /** The child's answer to "Did anyone help?" (assessments.help); null when the test did not ask it. */
  help?: HelpAnswer | null;
  /** Legacy callers only. Ignored: the count must come from the stored comparison, not a second query. */
  completedInGrade?: number;
  parentEmail: { sent: true } | { sent: false; reason: string; uncertain?: boolean };
  /** What the AI step did (#68); absent when an earlier run built the report. */
  ai?: AiOutcome;
}) {
  const m = v.model;
  // Savar sees the speed at every grade; the parent's report shows it from grade 5 (D-120).
  const facts = factsView(v, { speed: true });
  const comparison = comparisonView(v);
  const measuredCount = m.comparison.stage === "scale" || comparison ? m.comparison.n : undefined;
  const subject = `Test finished: ${v.childName}, ${levelName(m.level.grade)}, working at ${levelName(m.level.working)}`;
  const lines = [
    `Child: ${v.childName}`,
    `School grade: ${m.level.grade === 0 ? "Kindergarten" : m.level.grade} (${v.province})${m.level.grade > TOP_LEVEL ? ", tested up to grade 8" : ""}`,
    `Working level: ${levelName(m.level.working)} (${m.howWeHelp})${m.level.atCeiling ? ", at the top of what the test reached" : ""}${m.level.confidence === "low" ? ", low confidence: no level cleared" : ""}${m.level.certainty ? `, ${m.level.certainty}` : ""}`,
    `Did anyone help?: ${help ? `"${HELP_LABEL[help]}"` : "not asked"}`,
    `Flags: ${flags.length ? flags.map(flagText).join("; ") : "none"}`,
    m.helpWarning ? "Help likely: yes. The report says the level may be too high and suggests a retake." : "Help likely: no",
    `Areas: ${m.strands.map((s) => `${s.name} ${STATUS_LABEL[s.status]} ${s.correct}/${s.total}${s.certainty ? ` ${s.certainty}` : ""}`).join("; ")}`,
    // #189: the reliability note and the rushed wrong answers left out of the score.
    m.reliability ? `Reliability note: yes, ${m.reliability.veryFast} of ${m.reliability.answers} answers very fast. The report offers a new test; the start screen shows when it opens (at once at most once per 30 days, D-108).` : "Reliability note: no",
    ...(m.leftOut ? [`Left out of the score: ${plural(m.leftOut, "rushed wrong answer")}`] : []),
    `Facts: ${facts ? factsLine(facts) : "none"}`,
    ...(ai ? [aiLine(ai)] : []),
    `Questions: ${questionsAndMinutes(v)}`,
    `Comparison: ${COMPARISON_LABEL[m.comparison.stage]} (${measuredCount === undefined ? "no measured cohort stored" : `${measuredCount} eligible children in ${levelName(m.level.grade)}`})`,
    ...(comparison ? [`Comparison result: ${comparison.text}`] : []),
    `FSA line: ${m.fsa ? "shown" : "not shown"}`,
    `Next step: ${m.callToAction}`,
    `Parent: ${parent.name} <${parent.email}>`,
    parentEmail.sent ? `Parent email: sent to ${parent.email}` : parentEmail.uncertain
      ? `Parent email: delivery UNKNOWN (${parentEmail.reason}). Check delivery before sending again.`
      : `Parent email: NOT SENT (${parentEmail.reason}). Send the report link by hand.`,
    `Report: ${url}`,
    `Report id: ${v.id}`,
  ];
  return { subject, text: lines.join("\n") };
}
