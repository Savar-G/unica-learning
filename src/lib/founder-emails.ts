// The emails the founders sign at each step with a family (D-223): the welcome after signup (on a phone, the welcome
// with the laptop sign-in link) and the waitlist. The card-saved welcome is the workbook welcome (workbook-email.ts).
// Pure: the callers send them with `sender: { to: "parent", from: "founders" }`. Each goes once by its own guard: the
// family is created once, a child joins the waitlist once.
import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";

/** The founders' one line on why they built Unica Learning, from the home page's "Our promise". */
export const FOUNDERS_WHY = "We both grew up on workbooks and tutored other kids, so we built the middle ground: personal, on paper, and affordable.";

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const BUTTON = "#2b2622";

type Block =
  | { p: string }
  | { list: { lead?: string; text: string }[]; ordered?: boolean }
  | { button: string; url: string };

export interface FounderEmail {
  subject: string;
  text: string;
  html: string;
}

function build({ subject, preview, parentName, blocks, why }: { subject: string; preview: string; parentName: string; blocks: Block[]; why: string }): FounderEmail {
  const footer = { why, signer: "founders" as const };
  const first = firstName(parentName);
  const textBlock = (b: Block) => {
    if ("p" in b) return b.p;
    if ("button" in b) return `${b.button}: ${b.url}`;
    return b.list.map((i, n) => `${b.ordered ? `${n + 1}.` : "-"} ${i.lead ? `${i.lead} ` : ""}${i.text}`).join("\n");
  };
  const htmlBlock = (b: Block) => {
    if ("p" in b) return `<p style="margin:0 0 14px">${esc(b.p)}</p>`;
    if ("button" in b) {
      return `<p style="margin:6px 0 20px"><a href="${esc(b.url)}" style="display:inline-block;background:${BUTTON};color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600">${esc(b.button)}</a></p>`;
    }
    const tag = b.ordered ? "ol" : "ul";
    const items = b.list.map((i) => `<li style="margin:0 0 8px">${i.lead ? `<strong style="font-weight:600">${esc(i.lead)}</strong> ` : ""}${esc(i.text)}</li>`).join("");
    return `<${tag} style="margin:0 0 14px;padding-left:22px">${items}</${tag}>`;
  };
  const text = [`Hi ${first},`, ...blocks.map(textBlock), emailSignatureText(undefined, "founders"), emailFooterText(footer)].join("\n\n");
  const html = emailDocument({
    title: subject,
    preview,
    footer,
    body: `<tr><td style="padding:0 24px 4px">\n<p style="margin:0 0 14px">Hi ${esc(first)},</p>\n${blocks.map(htmlBlock).join("\n")}\n</td></tr>`,
  });
  return { subject, text, html };
}

/** Right after signup on a laptop or tablet. A phone signup gets the sign-in link email instead. */
export function welcomeEmail({ parentName, childName, url }: { parentName: string; childName: string; url: string }): FounderEmail {
  return build({
    subject: "Welcome to Unica Learning",
    preview: `What happens next with ${childName}'s free math test.`,
    parentName,
    why: "You get this email because you made an account for the free math assessment.",
    blocks: [
      { p: `Thanks for signing up. We're Cedric and Savar, the founders of Unica Learning. ${FOUNDERS_WHY}` },
      { p: "Here's what happens next:" },
      {
        ordered: true,
        list: [
          { text: `${childName} takes the free math test on a laptop or tablet, alone, in one sitting.` },
          { text: `You get the report by email within minutes. It shows ${childName}'s math level and the gaps to work on.` },
        ],
      },
      { button: `Start ${childName}'s test`, url },
    ],
  });
}

/**
 * The phone signup's one email (D-223): the founders' welcome and the sign-in link for the laptop or tablet in one, so
 * the parent never gets two emails at once. A link asked for again later is the team's plain link email.
 */
export function phoneWelcomeEmail({ parentName, childName, url }: { parentName: string; childName: string; url: string }): FounderEmail {
  return build({
    subject: "Welcome to Unica Learning: open this on a laptop or tablet",
    preview: `${childName}'s free math test starts on the laptop or tablet ${childName} will use.`,
    parentName,
    why: "You get this email because you made an account for the free math assessment.",
    blocks: [
      { p: `Thanks for signing up. We're Cedric and Savar, the founders of Unica Learning. ${FOUNDERS_WHY}` },
      { p: `Open this email on the laptop or tablet ${childName} will use. The button signs you in and opens ${childName}'s start screen.` },
      { button: "Sign in and start", url },
      { p: "Here's what happens next:" },
      {
        ordered: true,
        list: [
          { text: `${childName} takes the free math test on that laptop or tablet, alone, in one sitting.` },
          { text: `You get the report by email within minutes. It shows ${childName}'s math level and the gaps to work on.` },
        ],
      },
      { p: "The link works once and only for 24 hours. If it doesn't work, the page lets you send a new link." },
    ],
  });
}

/** A child outside BC joined the waitlist from the report. `curriculum`: the province's name, or null for "other". */
export function waitlistEmail({ parentName, childName, curriculum, reportUrl, bookingUrl }: { parentName: string; childName: string; curriculum: string | null; reportUrl: string; bookingUrl: string | null }): FounderEmail {
  return build({
    subject: curriculum ? `You're on the list for ${curriculum} workbooks` : "You're on the workbook waitlist",
    preview: "We'll email you as soon as they're ready.",
    parentName,
    why: `You get this email because you joined the workbook waitlist from ${childName}'s report.`,
    blocks: [
      {
        p: curriculum
          ? `Thanks for joining the waitlist. We're building workbooks for the ${curriculum} curriculum now, and you'll be among the first to know when they're ready.`
          : "Thanks for joining the waitlist. We're building workbooks for more provinces now, and you'll be among the first to know when yours is ready.",
      },
      { p: `Until then, ${childName}'s report stays in your account.` },
      { button: `See ${childName}'s report`, url: reportUrl },
      ...(bookingUrl ? [{ p: `If you'd like to talk through the results, book a free 15-minute call with one of us: ${bookingUrl}` }] : []),
    ],
  });
}
