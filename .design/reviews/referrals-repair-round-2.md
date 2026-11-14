# Referral repair round 2

Machine: Savars-MacBook-Pro-5. Original review pin: 451af98eac89b65e6490c5263e977401f066168d. This is a builder record, not independent approval.

- A definitive full-price paid invoice now releases an unused reservation. The benefit can fund a later renewal. The public command test failed before the repair and passed after it. The reviewer's actual TypeScript plus SQL control now reports `absent`, zero deletion holds and a successful next renewal. Its paid-with-coupon control remains `used`.
- Reward email claims now bind the reward, family, recipient and token. Final admission and saved copies use the same binding. A stale due-list recipient cannot follow an attribution transfer. Corrections refuse an in-flight or unknown email result. The original combined SQL and transport control now sends no email to the removed family and stores no recipient. A public-interface test confirms that the next run sends only to the current family.
- Restart states the maximum immediate charge, the conditional referral charge and the regular monthly rate separately. Plan-start emails and free-month status text state a charge ceiling and the referral condition. The frozen confirmation token still binds the maximum regular rate.
- The admin-start test now checks the referral reservation seam passed to the start. The Parent home snapshot includes the new referral link and a direct link assertion. The email matrix checks price terms and reminder conditions instead of an obsolete whole-message digest.

Five focused files passed, 313 tests. The Parent home file passed, 49 tests. The generated-state and referral tests passed, 56 tests. These sets overlap. Do not add their counts.

## Hosted database

Applied the additive migration through Supabase MCP to project `cdjobwsyzndtltzfpyqa`. The returned history entry is `20261114013255_family_referrals`; the local source file remains `20261113234609_family_referrals.sql`. The first rollback probe refused incomplete synthetic admin data. The corrected probe passed on the hosted database and rolled back all synthetic rows. It tests duplicate awards, email recipient/token admission, correction during email delivery, immediate-start claims, used-reward correction, reordered risk and deletion history.

All eight referral tables have RLS and one admin read policy. Anonymous reads and authenticated inserts are disabled. The command RPC is service-only. `npm run db:types` and `npm run db:checks` completed. TypeScript passed with the generated schema. The Supabase security advisor reported no referral finding.

The full gate found the stale Parent home snapshot. Its focused test passed after repair. The full gate must run again. Parent/admin browser checks and independent settlement remain pending. No push, PR, merge or application deployment has occurred.
