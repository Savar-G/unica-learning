// The reminder emails (#73, D-085, D-102): "continue your test", "come back", "start your test" and the last start
// reminder. Pure: the reminder job (src/lib/reminders.ts) sends them through the parent email delivery module (#152).
// Same look as the report email
// (src/lib/report-email.ts).
// CASL: every reminder names the sender, gives the mailing address and the website, and has an unsubscribe link.
import { familyWhen, familyZone } from "@/lib/family-time";
import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";
import type { ReminderKind } from "@/lib/reminders";

interface Common {
  parentName: string;
  childName: string;
  /** Opens the child's start screen, through sign-in when the parent is signed out. */
  url: string;
  unsubscribeUrl: string;
  /** An older signup's postal code (D-224): familyZone uses it after the saved time zone, before the province. Otherwise null. */
  postal: string | null;
  timeZone?: string | null;
  province?: string | null;
  /** Questions in the test for the child's grade. */
  total: number;
}

export type ReminderEmailInput =
  | (Common & { kind: "continue"; answered: number; resumeUntil: number })
  | (Common & { kind: Exclude<ReminderKind, "continue"> });

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);

// Colours and font of the report email (warm look). Email clients need them inline, as hex.
const INK_2 = "#44444c";
const BUTTON = "#2b2622";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What each reminder says: the subject, a line for the inbox preview, the paragraphs and the button. */
function content(e: ReminderEmailInput): { subject: string; preview: string; paragraphs: string[]; button: string } {
  const name = e.childName;
  // The test takes about 20 minutes. Answering alone keeps the report honest, so the copy gives that reason.
  const alone = `It works best when ${name} answers on their own, so the report shows where ${name} really is.`;
  const howLong = `It takes about 20 minutes on a laptop or tablet. ${alone}`;
  const report = `Afterward, you'll get a report by email showing the level ${name} is working at, what's going well, and which skills to work on next.`;
  switch (e.kind) {
    case "continue": {
      const until = `${name} can pick up from the same question until ${familyWhen(e.resumeUntil, familyZone(e))}.`;
      return {
        subject: `${name}'s math test is saved`,
        preview: until,
        paragraphs: [
          e.answered > 0
            ? `${name} answered ${e.answered} of ${e.total} questions on the free math placement test, and those answers are saved.`
            : `${name} opened the free math placement test but hasn't answered a question yet.`,
          until,
          `After that, ${name} would start over with a new set of questions.`,
        ],
        button: `Continue ${name}'s test`,
      };
    }
    case "come_back":
      return {
        subject: `${name} can start the math test fresh`,
        preview: `A new set of questions, about 20 minutes.`,
        paragraphs: [
          `${name}'s free math placement test closed after 24 hours, before ${name} finished. That happens, and it's easy to start again.`,
          `${name} can start fresh with a new set of questions. ${howLong}`,
        ],
        button: "Start again",
      };
    case "start":
      return {
        subject: `${name}'s free math check is ready`,
        preview: `About 20 minutes. Then a report on ${name}'s level and next steps.`,
        paragraphs: [
          `${name}'s free math placement test is ready to go. Just find 20 quiet minutes when ${name} can sit down at a laptop or tablet.`,
          alone,
          report,
        ],
        button: `Start ${name}'s test`,
      };
    case "start_followup":
      // A personal note from the founders (D-225): it asks what is in the way, so a parent can reply.
      return {
        subject: `A quick question about ${name}'s math test`,
        preview: `Is anything getting in the way?`,
        paragraphs: [
          `We're Cedric and Savar, the founders of Unica Learning. We noticed ${name} hasn't had a chance to take the free math test yet, so we wanted to check in ourselves.`,
          `Is anything getting in the way, like timing, signing in, or questions about how it works?`,
          `If you'd like to go ahead, it takes about 20 minutes. It's free, with no card needed.`,
        ],
        button: `Start ${name}'s test`,
      };
  }
}

/** One reminder email, with its CASL footer and unsubscribe link. */
/** The reminders the founders sign (D-225): the last start reminder. The others are notices from the team. */
export const FOUNDER_REMINDERS: readonly ReminderKind[] = ["start_followup"];

export function reminderEmail(e: ReminderEmailInput): { subject: string; text: string; html: string; founders: boolean } {
  const { subject, preview, paragraphs, button } = content(e);
  const first = firstName(e.parentName);
  const signIn = "You may be asked to sign in first.";
  const why = `You get this reminder because you signed up for ${e.childName}'s free math placement test.`;
  const founders = FOUNDER_REMINDERS.includes(e.kind);
  const footer = { why, unsubscribe: { url: e.unsubscribeUrl, label: "Unsubscribe from reminders" }, signer: founders ? "founders" as const : "team" as const };

  const text = [
    `Hi ${first},`,
    ...paragraphs,
    `${button}: ${e.url}\n${signIn}`,
    emailSignatureText(undefined, footer.signer),
    emailFooterText(footer),
  ].join("\n\n");

  const p = (body: string, style = "") => `<p style="margin:0 0 14px;${style}">${body}</p>`;
  const html = emailDocument({ title: subject, preview, footer, body: `
<tr><td style="padding:0 24px 4px">
${p(`Hi ${esc(first)},`)}
${paragraphs.map((x) => p(esc(x))).join("\n")}
</td></tr>
<tr><td style="padding:6px 24px 8px">
<a href="${esc(e.url)}" style="display:inline-block;background:${BUTTON};color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600">${esc(button)}</a>
</td></tr>
<tr><td style="padding:0 24px 4px">${p(esc(signIn), `margin:8px 0 0;font-size:14px;color:${INK_2}`)}</td></tr>
` });
  return { subject, text, html, founders };
}
