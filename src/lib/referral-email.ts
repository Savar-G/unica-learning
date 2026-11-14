import "server-only";
import { randomUUID } from "node:crypto";
import { sendEmailOnce, type MailTransport, type SendLedger } from "@/lib/email-delivery";
import type { ReferralEmail, ReferralStore } from "@/lib/referrals";

export async function sendReferralRewards(store: ReferralStore, transport: MailTransport, origin: string, inTime: () => boolean) {
  const due = await store.command({ action: "due", operation: "email", limit: 20 });
  if (!due.ok || !due.due) throw new Error("Referral emails unreadable");
  let sent = 0, deferred = 0;
  const ledger: SendLedger<ReferralEmail, { reward: string; token: string }> = {
    async claim(key) {
      if (!inTime()) return null;
      const token = randomUUID();
      const answer = await store.command({ action: "email_claim", reward: key.reward, token });
      if (!answer.ok) throw new Error("Referral email claim failed");
      return answer.token ? { reward: key.reward, token: answer.token } : null;
    },
    async sent(handle, emailId) { await store.command({ action: "email_result", ...handle, emailState: "sent", emailId }); },
    async refused(handle) { await store.command({ action: "email_result", ...handle, emailState: "refused" }); },
    async unknown(handle) { await store.command({ action: "email_result", ...handle, emailState: "unknown" }); },
    async keepCopy(handle, _key, copy) { await store.command({ action: "email_copy", ...handle, copy }); },
  };
  for (const email of due.due.emails) {
    if (!inTime()) { deferred++; continue; }
    const result = await sendEmailOnce(ledger, email, {
      sender: { to: "parent" }, to: email.email, subject: "You earned a referral reward",
      text: `You earned 50% off one paid month for your family. The discount covers each child enrolled when this reward starts, including the sibling price. Separate referrals give separate discounted months. Unused discounts wait through a pause or cancellation.\n\nSee your referral rewards: ${new URL("/account/referrals", origin).href}\n\nUnica Learning`,
    }, { transport, admit: async () => inTime() && (await store.command({ action: "email_admit", reward: email.reward })).admitted === true });
    if (result.status === "sent") sent++;
    if (result.status === "refused") deferred++;
  }
  return { sent, deferred };
}
