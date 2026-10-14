// The reminder emails (#73, D-085): "continue your test", "come back" and "start your test". Pure: the reminder job
// (src/lib/reminders.ts) sends them through the parent email delivery module (#152). Same look as the report email
// (src/lib/report-email.ts).
// CASL: every reminder names the sender, gives the mailing address and the website, and has an unsubscribe link.
import { BUSINESS_NAME, MAILING_ADDRESS, WEBSITE } from "@/lib/contact";
import type { ReminderKind } from "@/lib/reminders";

interface Common {
  parentName: string;
  childName: string;
  /** Opens the child's start screen, through sign-in when the parent is signed out. */
  url: string;
  unsubscribeUrl: string;
  /** The parent's postal code: it picks the time zone for the deadline. */
  postal: string;
  /** Questions in the test for the child's grade. */
  total: number;
}

export type ReminderEmailInput =
  | (Common & { kind: "continue"; answered: number; resumeUntil: number })
  | (Common & { kind: Exclude<ReminderKind, "continue"> });

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);

// Colours and font of the report email (warm look). Email clients need them inline, as hex.
const INK = "#0c0c0e";
const INK_2 = "#44444c";
const LINE = "#e4e4e7";
const BUTTON = "#2b2622";
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The time zone of the province that a postal code's first letter belongs to. A guess for the few that span two zones. */
const ZONE: Record<string, string> = {
  A: "America/St_Johns",
  B: "America/Halifax",
  C: "America/Halifax",
  E: "America/Moncton",
  G: "America/Toronto",
  H: "America/Toronto",
  J: "America/Toronto",
  K: "America/Toronto",
  L: "America/Toronto",
  M: "America/Toronto",
  N: "America/Toronto",
  P: "America/Toronto",
  R: "America/Winnipeg",
  S: "America/Regina",
  T: "America/Edmonton",
  V: "America/Vancouver",
  X: "America/Yellowknife",
  Y: "America/Whitehorse",
};
const zoneFor = (postal: string) => ZONE[postal.trim().charAt(0).toUpperCase()] ?? "America/Vancouver";

/** "4:15 p.m. PDT on Monday, October 12" in the family's time zone. */
function deadline(at: number, postal: string): string {
  const timeZone = zoneFor(postal);
  const time = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(at);
  const day = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone }).format(at);
  return `${time} on ${day}`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What each reminder says: the subject, a line for the inbox preview, the paragraphs and the button. */
function content(e: ReminderEmailInput): { subject: string; preview: string; paragraphs: string[]; button: string } {
  const name = e.childName;
  const alone = `${name} takes it alone, in one sitting, on a laptop or tablet.`;
  switch (e.kind) {
    case "continue": {
      const until = `${name} can continue from the same question until ${deadline(e.resumeUntil, e.postal)}.`;
      return {
        subject: `${name} can finish the math test`,
        preview: until,
        paragraphs: [
          e.answered > 0
            ? `${name} stopped the free math placement test after ${e.answered} of ${e.total} questions.`
            : `${name} opened the free math placement test but did not answer a question yet.`,
          until,
          `After that, the test closes and ${name} starts again with new questions.`,
        ],
        button: `Continue ${name}'s test`,
      };
    }
    case "come_back":
      return {
        subject: `${name} can start the math test again`,
        preview: `${name} can start again with new questions.`,
        paragraphs: [
          `${name} did not finish the free math placement test within 24 hours, so it closed.`,
          `${name} can start again with ${e.total} new questions. ${alone}`,
        ],
        button: "Start again",
      };
    case "start":
      return {
        subject: `${name} has not started the free math test`,
        preview: `${name}'s test has ${e.total} questions, in one sitting.`,
        paragraphs: [
          `${name} has not started the free math placement test yet.`,
          `The test has ${e.total} questions. ${alone} When ${name} finishes, you get the report by email.`,
        ],
        button: `Start ${name}'s test`,
      };
  }
}

/** One reminder email, with its CASL footer and unsubscribe link. */
export function reminderEmail(e: ReminderEmailInput): { subject: string; text: string; html: string } {
  const { subject, preview, paragraphs, button } = content(e);
  const first = firstName(e.parentName);
  const signIn = "If you are signed out, sign in first and the test opens.";
  const why = `You get this reminder because you signed up for ${e.childName}'s free math placement test.`;
  const sender = `${BUSINESS_NAME}, ${MAILING_ADDRESS}`;

  const text = [
    `Hi ${first},`,
    ...paragraphs,
    `${button}: ${e.url}\n${signIn}`,
    [why, `Unsubscribe from reminders: ${e.unsubscribeUrl}`, sender, `${WEBSITE} · Questions? Reply to this email.`].join("\n"),
  ].join("\n\n");

  const p = (body: string, style = "") => `<p style="margin:0 0 14px;${style}">${body}</p>`;
  const small = `margin:0 0 6px;font-size:13px;color:${INK_2}`;
  const html = `<div style="background:#ffffff;padding:24px 0">
<span style="display:none;max-height:0;overflow:hidden">${esc(preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:${FONT};font-size:16px;line-height:1.5;color:${INK}">
<tr><td style="padding:0 24px 14px;border-bottom:1px solid ${LINE};font-size:18px;font-weight:600">${esc(BUSINESS_NAME)}</td></tr>
<tr><td style="padding:24px 24px 4px">
${p(`Hi ${esc(first)},`)}
${paragraphs.map((x) => p(esc(x))).join("\n")}
</td></tr>
<tr><td style="padding:6px 24px 8px">
<a href="${esc(e.url)}" style="display:inline-block;background:${BUTTON};color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600">${esc(button)}</a>
</td></tr>
<tr><td style="padding:0 24px 28px">${p(esc(signIn), `margin:8px 0 0;font-size:14px;color:${INK_2}`)}</td></tr>
<tr><td style="padding:16px 24px 0;border-top:1px solid ${LINE}">
${p(`${esc(why)} <a href="${esc(e.unsubscribeUrl)}" style="color:${INK_2}">Unsubscribe from reminders</a>.`, small)}
${p(esc(sender), small)}
${p(`<a href="https://${WEBSITE}" style="color:${INK_2}">${WEBSITE}</a> · Questions? Reply to this email.`, small)}
</td></tr>
</table>
</div>`;
  return { subject, text, html };
}
