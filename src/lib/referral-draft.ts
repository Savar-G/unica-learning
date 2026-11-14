import { referralCode } from "@/lib/referral-contract";
const KEY = "unica-referral-draft-v1";
export interface ReferralDraftStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
let volatileDraft = "";
export function referralDraft(store?: ReferralDraftStorage | null): string {
  try { return referralCode(store?.getItem(KEY)) ?? volatileDraft; } catch { return volatileDraft; }
}
export function keepReferralDraft(value: string, store?: ReferralDraftStorage | null): void {
  volatileDraft = value.slice(0,64);
  try { if (value) store?.setItem(KEY, value.slice(0,64)); else store?.removeItem(KEY); } catch { /* Manual entry still works. */ }
}
export function captureReferral(search: string, store?: ReferralDraftStorage | null): void {
  const code = referralCode(new URLSearchParams(search).get("referral"));
  if (code && !referralDraft(store)) keepReferralDraft(code, store);
}
export function browserReferralStorage(): ReferralDraftStorage | null {
  try { return window.localStorage; } catch { return null; }
}
