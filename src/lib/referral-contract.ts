/** Public parent data. Never include the other family's identity or provider identifiers. */
export interface ReferralOverview {
  code: string;
  shareUrl: string;
  rewardsEarned: number;
  rewardsRemaining: number;
  pendingReferrals: number;
  appliedCode: string | null;
  /** Remains true when deletion removes the source family's public code. */
  benefitApplied?: boolean;
  canApply: boolean;
}

export type ReferralError = "invalid" | "self_referral" | "already_paid" | "already_applied" | "unavailable" | "family_unavailable" | "rate_limited" | "signed_out" | "desk_open";
export type ReferralResult = { ok: true; overview: ReferralOverview } | { ok: false; error: ReferralError };
export const REFERRAL_API = "/api/account/referrals";
export const REFERRAL_PATH = "/account/referrals";
export const REFERRAL_MESSAGES: Record<ReferralError, string> = {
  invalid: "We could not use this referral code. Check the code and try again.",
  self_referral: "You cannot use your own family's referral code.",
  already_paid: "Referral codes are for families that have not made a payment yet. Contact us if you need a correction.",
  already_applied: "Your family already has a referral code. Contact us if you need a correction.",
  unavailable: "We could not confirm your referral details. Please try again.",
  family_unavailable: "Referrals are unavailable while your account is being deleted.",
  rate_limited: "Please wait before you try another referral code.",
  signed_out: "Sign in again to manage your referrals.",
  desk_open: "Leave the child's desk with your PIN before you manage referrals.",
};

export const REFERRAL_OFFER = "Give a family 50% off its first paid month. After its first payment, get 50% off one paid month for your family too.";
export const REFERRAL_SCOPE = "The discount covers each enrolled child, including the sibling price. Your free month stays. Separate referrals give separate discounted months.";

/** A code is public, but it must stay bounded before it enters a URL, request or local storage. */
export function referralCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{5,31}$/.test(code) ? code : null;
}
