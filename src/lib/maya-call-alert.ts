import "server-only";
import { ADMIN_PATH } from "@/lib/admin-view";
import { sendEmailOnce, type MailTransport, type SendLedger } from "@/lib/email-delivery";
import type { AlertCall, AlertState, CallAlerts, FlagLevel } from "@/lib/maya-call";

// The internal alert of a flagged Maya call (#333, spec #297): when the controller's SAFETY interrupt fires (or a child
// asks for harmful content, by UNSAFE_REQUEST_FLAG), an email goes to the team (SIGNUP_NOTIFY_EMAIL, the address of the
// other internal alerts), so someone acts the same day. It goes through the email delivery module with a send key (the
// call and the flag level), so each alert is sent once; a higher flag on the same call sends its own alert.
//
// The email holds only what the team needs to act: the flag, when it was raised, which call, and a link to the admin
// call page. Never the child's words, name or question: those stay on the call page, behind the admin sign-in.
//
// The send ledger (the claims) is public.maya_call_alerts: src/lib/maya-call-alert-store.ts in production,
// src/lib/maya-call-alert-memory.ts in tests. A refused alert releases its claim, so the call's next request sends it
// again; an unknown one keeps it (it may have gone). Both are shown on the admin call page.

/** The send key of an alert: one per call and flag level. `parentId` is the call's family, for the ledger's row. */
export interface AlertKey {
  callId: string;
  parentId: string;
  level: FlagLevel;
}

/** The alert ledger: a send ledger of alerts, and the alerts of a call for the admin page. */
export interface AlertLedger<H = unknown> extends SendLedger<AlertKey, H> {
  /** The call's alerts, oldest first. Throws when they cannot be read. */
  list(callId: string): Promise<AlertState[]>;
}

const FLAG_TEXT: Record<FlagLevel, { subject: string; body: string }> = {
  safety_immediate: {
    subject: "Maya safety flag: immediate danger",
    body: "Safety flag, immediate danger. Something the child said may mean they are in danger now.",
  },
  safety_concern: {
    subject: "Maya safety flag",
    body: "Safety flag. Something the child said may mean they are not safe.",
  },
  unsafe_request: {
    subject: "Maya flag: harmful request",
    body: "Harmful request. The child asked for content Maya does not give (sexual, violent or other harmful content).",
  },
};

/** The flag time in Vancouver time, where the team works. */
const pacific = (iso: string) =>
  `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", dateStyle: "full", timeStyle: "short" }).format(new Date(iso))} Pacific time`;

/** The alert email: which call, when, and the link to the admin call page. Never the child's words. */
export function safetyAlertEmail(call: AlertCall, origin: string): { subject: string; text: string } {
  const flag = FLAG_TEXT[call.flag.level];
  const test = call.kind === "admin_test";
  const url = `${origin}${ADMIN_PATH}/maya/${call.id}`;
  return {
    subject: `${test ? "[Test call] " : ""}${flag.subject}: read the call today`,
    text: [
      "Maya flagged a call. Read it on the admin call page today.",
      "",
      flag.body,
      `Flagged: ${pacific(call.flag.at)} (${call.flag.at})`,
      `Call: ${call.id}${test ? " (an admin test call in a test family)" : ""}`,
      `Open the call: ${url}`,
      "",
      "This email leaves out the child's words on purpose. They are on the call page.",
    ].join("\n"),
  };
}

/** A transport that sends nothing: the alert has no address to go to. */
const noAddress: MailTransport = { send: async () => ({ status: "refused", error: "SIGNUP_NOTIFY_EMAIL is not set" }) };

/**
 * The alerts seam of the call module. `to`: the team's address (SIGNUP_NOTIFY_EMAIL); without it each alert is stored
 * as refused, so the call page shows it did not go. `origin`: the site the admin link points to. `transport`: Resend
 * when not given; tests give the in-memory one.
 */
export function callAlerts({ ledger, to, origin, transport }: { ledger: AlertLedger; to: string | null; origin: string; transport?: MailTransport }): CallAlerts {
  return {
    async send(call) {
      const key: AlertKey = { callId: call.id, parentId: call.parentId, level: call.flag.level };
      try {
        const outcome = await sendEmailOnce(ledger, key, { sender: { to: "savar" }, to: to ?? "", ...safetyAlertEmail(call, origin) }, { transport: to ? transport : noAddress });
        if (outcome.status === "sent") console.info("[maya alert] sent", call.id, call.flag.level);
        else if (outcome.status !== "busy") console.error("[maya alert] not sent", call.id, call.flag.level, outcome.status, outcome.error);
      } catch (e) {
        // The claim failed (a store error): nothing was sent, and the call's next request tries again.
        console.error("[maya alert] claim failed", call.id, call.flag.level, e instanceof Error ? e.message : String(e));
      }
    },
    list: (callId) => ledger.list(callId),
  };
}
