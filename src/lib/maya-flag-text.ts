// Plain words for the admin Maya call pages: a call's flag and its team alert emails (#333), and the model's name.
// The admin reads these at a glance: no provider error text, no internal names or ids. The technical detail of a failed
// send (the email provider's answer) stays in a tooltip and the server log.
import type { AlertStatus, FlagLevel } from "@/lib/maya-call";

/** What the flag says happened in the call. */
export const FLAG_TEXT: Record<FlagLevel, string> = {
  safety_immediate: "Child may be in danger now",
  safety_concern: "Possible safety concern",
  unsafe_request: "Child asked for harmful content",
};

/** The alert email's state. The alert emails go only to the team, never to parents. */
export const ALERT_TEXT: Record<AlertStatus, string> = {
  sent: "Alert email sent to the team",
  sending: "Sending the alert email",
  refused: "Alert email not sent",
  unknown: "Alert email may not have gone",
};

/**
 * The plain line after an alert's state: what the admin does next, or null when nothing is needed. A live call sends a
 * refused alert again with its next turn; an ended call with the button. An unknown send is never sent again.
 */
export function alertNote(status: AlertStatus, live: boolean): string | null {
  if (status === "refused") return live ? "The email didn't send. The next turn tries again." : "The email didn't send. Try again.";
  if (status === "unknown") return "We're not sure the email went. Check the inbox before sending again.";
  return null;
}

/** The line when the flag has no alert email yet. */
export const noAlertNote = (live: boolean) => (live ? "The next turn sends it." : "Send it with the button below.");

/**
 * The model in plain words: "Scripted" for the rule player (Maya's lines come from code, not the AI), else "AI" and the
 * model's name without its provider ("anthropic/claude-sonnet-5.5" is "AI (Claude Sonnet 5.5)").
 */
export function modelName(model: { id: string; fake: boolean }): string {
  if (model.fake) return "Scripted";
  const words = (model.id.split("/").pop() ?? "").split(/[-_]+/).filter(Boolean);
  const name = words.map((w) => (/^gpt$/i.test(w) ? "GPT" : w[0].toUpperCase() + w.slice(1))).join(" ");
  return name ? `AI (${name})` : "AI";
}
