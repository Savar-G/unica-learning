# Referral settlement review

VERDICT: FAIL

Two P1 payment defects remain. One new P2 email queue defect is confirmed. The finalized-invoice repair preserves the committed discount and the receivable correctly under the approved rule. It does not require voiding and replacing the invoice.

## Fixed scope

- Machine: Savars-MacBook-Pro-5.local.
- Prepared checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-a3a2f138-a93606108e32bc1b`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-a3a2f138-a93606108e32bc1b`.
- Branch, read before use: `t3/a3a2f138`.
- Reviewed HEAD: `26f41b2ed943b4d0ced4efe2e40a199997544b98`.
- Base: `5b09bcf91ea3328106e61d2d9c0aab6a147662d3`.
- Original candidate: `451af98eac89b65e6490c5263e977401f066168d`.
- Full comparison: `git diff 5b09bcf91ea3328106e61d2d9c0aab6a147662d3 HEAD`. Both repair commits were inspected separately.

I read AGENTS.md, both independent reports, the full referral change, the approved contract, the implementation document, both repair records, and the supplied provider evidence. I did not delegate or retry the PC. The model and account were not changed.

The rejection conditions were a lost charge, a stranded benefit, an incorrect email recipient, an unauthorized ledger operation, or a failed focused check. Additional checks tested replay after benefit reuse, settlement with the retained subscription start key, and deletion before bounded email selection. Each check needed to expose an incorrect public result or ledger state.

## Confirmed remaining defects

### 1. P1: A late zero-invoice replay reactivates a released operation

Location: [src/lib/referrals.ts:128](/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-a3a2f138-a93606108e32bc1b/src/lib/referrals.ts:128). Related write: [migration:311](/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-a3a2f138-a93606108e32bc1b/supabase/migrations/20261113234609_family_referrals.sql:311).

An immediate start receives the coupon, but customer credit makes its invoice zero. The repair binds and releases that operation. A later renewal reserves the same unused entitlement and receives the coupon. A replay of the earlier zero invoice calls `start_result` with `result: "applied"` before its release. SQL changes the old absent operation back to applied. The later operation already owns that entitlement, so `referral_entitlement_one_operation` rejects the write.

This also breaks ordinary history recovery. When the later renewal pays, `reconcileReferralInvoice` refreshes all paid history. It processes the earlier zero invoice and throws before it records the later payment. The referring family earns no reward. The affected family's referral overview also cannot complete its history read.

Fresh proof used the public `referralStarts`, `recordReferralInvoice`, and `reconcileReferralInvoice` functions with the actual migration in PGlite. No product source was changed. The sequence was reserve immediate start, record zero twice, apply the next renewal, replay zero, then record the next payment.

```text
AFTER_ZERO_REPLAY: zero=absent
AFTER_NEXT_DISCOUNT: zero=absent, next=applied
LATE_ZERO_REPLAY FAIL: duplicate key value violates unique constraint "referral_entitlement_one_operation"
NEXT_PAID_RECONCILE FAIL: duplicate key value violates unique constraint "referral_entitlement_one_operation"
FIRST_RECEIPT: first_invoice=null
EARNED_COUNT: 0
```

Minimum fix: Bind and release a definitive zero or void creation in one absent-state transition. Do not pass through applied when replaying its terminal receipt. Prevent later subscription invoices from rebinding an earlier creation operation by its start key. Add a public TypeScript plus SQL regression that replays the old invoice after the entitlement has another operation and then records the later payment.

The existing regression repeats zero before benefit reuse. The memory store does not enforce the SQL unique index. Its passing result therefore does not reject this failure.

Proof limit: Synthetic provider invoices and base tables. This establishes a failure in the actual command SQL and public reconciliation code. It does not establish a hosted occurrence.

### 2. P1: A retained subscription start key defeats full-price reservation release

Location: [src/lib/referrals.ts:146](/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-a3a2f138-a93606108e32bc1b/src/lib/referrals.ts:146). Related selector: [migration:300](/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-a3a2f138-a93606108e32bc1b/supabase/migrations/20261113234609_family_referrals.sql:300).

An immediate paid start uses its incoming benefit. Its operation is used and retains `original-start`. The family later earns another reward. A renewal reserves that reward but pays at full price before the coupon write succeeds. The current paid invoice still carries `original-start`, because the adapter takes `startKey` from subscription metadata for every invoice at [src/lib/referral-stripe.ts:83](/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-a3a2f138-a93606108e32bc1b/src/lib/referral-stripe.ts:83).

The repaired release supplies both the new invoice and that old start key. SQL selects an operation using invoice OR start key. Both operations match. The observed selection returns the old used operation, then exits through the used-state guard. The new reservation and permanent family card hold remain. The next renewal is refused. Family deletion remains blocked.

Fresh proof used the public functions and actual SQL. Both families confirmed codes before their own first payments. The first operation was used normally. A later actual payment earned the second reward. The provider boundary then simulated finalization and full-price payment during its coupon write.

```text
SAME_START_KEY_PAID_WITHOUT_COUPON:
  initial=used, start_key=original-start
  race=reserved, start_key=null
DELETION_HOLDS: 1
NEXT_RENEWAL FAIL: Referral command refused: unavailable
```

An invoice-only completion control against the same database changed `race` to absent, left `initial` used, removed the hold, and allowed the next renewal. The original reviewer control also passes when its renewal omits `startKey`. That narrower pass does not settle the real adapter case.

Minimum fix: Select the exact invoice operation before any creation-key fallback. Do not send the subscription creation key as a competing selector when releasing a renewal. Preserve a key fallback only for the matching initial creation that still needs binding. Add a regression with a used initial operation and a later full-price renewal on the same subscription.

Proof limit: Local controlled provider timing and actual SQL. No provider or hosted write occurred.

### 3. P2: Deleted owners can block all later reward emails

Location: [migration:339](/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-a3a2f138-a93606108e32bc1b/supabase/migrations/20261113234609_family_referrals.sql:339).

Email selection limits rewards before joining the account to its current parent. Family deletion retains financial reward rows and removes their parent link. An unsent clear earned reward for a deleted owner therefore remains in the limited candidate set forever. It never reaches the sender, so no attempt timestamp moves it back in the queue.

After 20 such older rewards, `sendReferralRewards` always receives an empty list even when a current family has an eligible reward. Its email limit is 20. Repeated reminder runs cannot advance past the deleted owners. Parents with a deletion request can cause the same selection problem while their rows still exist.

Fresh proof created 20 synthetic owners with unsent earned rewards, deleted those parents through the actual local migration trigger, and added one current owner with a later eligible reward. Two due calls both returned zero emails. A query that joined and filtered current recipients before the limit returned one.

```text
ACTUAL_LOCAL_DELETION_TRIGGER: total=21, removed=20
DUE_ROUND 1: 0
DUE_ROUND 2: 0
FILTER_BEFORE_LIMIT_CONTROL: 1
```

Minimum fix: Join and filter current eligible parents before applying email order and limit. Keep financial rows as required. Add a queue test with at least 20 older deleted owners and one current waiting family.

Proof limit: Actual local deletion and selection SQL with synthetic financial fixtures. No hosted deletion or email was performed.

## Settlement of every prior finding

| Previous finding | Settled status | Reason |
| --- | --- | --- |
| Review 1, finding 1: zero immediate invoice strands benefit | NOT SETTLED | The early replay repair works. Late replay after reuse still fails with actual SQL. See finding 1 above. |
| Review 1, finding 2, and review 2, finding 4: revocation voids the whole monthly invoice | RESOLVED | The adapter retains the finalized discount and monthly receivable. It restores the saved automatic-collection setting after a hold. The operation remains applied until payment or confirmed retirement. |
| Review 1, finding 3, and review 2, finding 3: signed-in share redirect loses code | RESOLVED IN LOCAL SCOPE | The real Start page preserves the normalized code in `/account/referrals?referral=...`. The destination is included in draft capture. The focused page tests pass. Browser navigation remains the parent's check. |
| Review 2, finding 1: full-price payment leaves reservation and deletion hold | NOT SETTLED | The original control passes without a start key. A renewal with the actual adapter's retained subscription key still fails. See finding 2 above. |
| Review 2, finding 2: correction/deletion sends to stale email recipient | RESOLVED | Claim, final admission, result, and copy bind owner, address, and token. Correction refuses sending or unknown claims. The original combined SQL/transport control sends nothing to the deleted owner and stores no stale recipient. A public test sends only to the corrected owner on the next run. |
| Review 2, finding 5: full-price first-charge promises | RESOLVED | Restart states a maximum charge, conditional referral charge, and regular monthly price. Plan-start email and free-month text state a ceiling and the referral condition. Focused price and email tests pass. The confirmation still binds the maximum regular rate. |

The repair record also reports a coupon expansion defect found in test mode. Both coupon creation and retrieval now expand `applies_to`. The adapter continues to validate the product, percentage, duration, expiry, and redemption cap. Focused SDK transport tests pass.

## Finalized-invoice reasoning

The earlier reports correctly rejected cancellation of the entire monthly receivable. Their proposed full-price replacement was one possible repair, not the only repair allowed by the approved rule.

The current approved contract expressly keeps a discount fixed on a finalized invoice. The supplied provider evidence states that a once coupon is used at finalization. The current adapter therefore returns `committed` for an open or uncollectible invoice after revocation. It does not void the invoice. It preserves the discount and amount owed. If a referral hold changed collection, it restores only the saved automatic-collection value. The core keeps the operation applied. Later paid evidence marks it used.

Fresh SDK transport tests check retained coupon, open status, collection restoration, no void request, and the uncollectible branch. A separate public core test checks applied-to-used settlement after revocation. The supplied Stripe test-mode evidence confirms that the receivable stays open and pays normally. I accept this reasoning. I did not repeat that provider proof. An operator can still pay an already finalized held invoice directly; this documented provider limit is separate from the application flow.

## Fresh checks and limits

The checkout had no `node_modules`. Initial checks stopped at missing dependencies. A first programmatic run also lacked an external package alias. These were test setup failures, not product test failures. Completed runs used existing local dependencies through `NODE_PATH` and programmatic Vitest aliases. Every source path resolved to this review checkout. No dependency link or installation was written here. Vitest used the repository's include rule and 30-second timeout. Cache was disabled.

- Eight focused referral files passed, 69 tests. They cover public commands, SDK transport, immediate start, deletion admission, draft storage, the parent card, parent API, and signed-in redirect.
- Nine focused integration files passed, 176 tests. They cover family deletion, plan controls, start recovery, signed webhook, reminders, admin start, Account price text, plan-start emails, and generated state checks.
- The requested local SQL runner passed the actual migration and rollback probe. Its platform base tables and fences are synthetic.
- Both original reviewer scripts were read before use. They use `process.cwd()` for this candidate. Their narrower full-price and stale-recipient controls now pass.
- The new public-function plus SQL controls fail as described in findings 1 and 2. The invoice-only control resolves finding 2's synthetic state.
- The local deletion queue control fails as described in finding 3. Filtering recipients before the limit exposes the waiting family.
- A nonadmin authenticated role read zero referral accounts. Direct insert and command execution both failed with SQLSTATE 42501. This uses the local synthetic role and `is_admin` fixture.
- `git diff --check` passed. The pins were rechecked before report creation. The tree was clean before this report.

| Subsystem | Fresh result | What this does not prove |
| --- | --- | --- |
| Settlement | Two actual SQL failures remain despite passing memory tests. | No real payment race was induced. |
| Finalized benefits | Adapter request and core settlement tests pass. | Provider invoice behavior is supplied evidence. |
| Email identity | Original correction/deletion transport control passes. | No email delivery was requested. The queue failure remains. |
| Queue and duplicate admission | Unique keys, the program advisory lock, ordered family locks, fixed cohorts, and separate child queues were read. Focused tests cover duplicate payments and active sibling progress. | PGlite is one local backend. It does not prove two-session hosted concurrency. |
| RLS and deletion | Local denial probes, actual migration triggers, receipt preservation tests, and rollback checks pass in their stated cases. | Synthetic fences do not prove hosted Auth, Storage, inherited roles, or full deletion behavior. |
| Access and public text | Parent/desk route checks, redirect tests, price tests, and source inspection pass. | No browser, phone, keyboard, or complete hosted parent journey was checked. |

The generated database types and checks include the referral schema. The user supplied the applied live version `20261114013255_family_referrals`, successful hosted rollback probe, and type/check generation. The local source filename remains `20261113234609_family_referrals.sql`. These are supplied hosted results, not fresh hosted proof from this review.

The ten Stripe test-mode results in the committed evidence are supplied adapter/provider proof. They do not combine the hosted ledger and provider into one journey. Current production webhook subscriptions and restricted-key permissions were not read. The root full gate and parent/admin browser checks remain in progress as supplied. This review makes no completion claim for them.

No full suite, paid model call, browser, environment file, secret, hosted/provider write, commit, push, PR comment, or product edit was performed. Only this report was written. No merge or release is approved.

REFERRAL_SETTLEMENT_DONE
