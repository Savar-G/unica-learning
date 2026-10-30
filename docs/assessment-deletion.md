# Family deletion (#78)

Apply `supabase/migrations/20261011_add_family_deletion.sql`, then `supabase/migrations/20261011225238_add_family_deletion_worker_lease.sql`, before this code ships. Both migrations are additive. They create no deletion requests and delete no family. The owner applied both files in the SQL editor on 11 October 2026 (see PR #108). The SQL editor does not write the migration registry, so the repo files are the record. Hosted checks passed on 13 October 2026 (#117); see [Hosted verification](#hosted-verification-117).

The owner approved public assessment launch without a separate pilot. The Node worker has no pilot requirement. The #82 launch change removed the app feature setting from the app, admin and HTTP routes; their sign-in, admin membership and job secret checks remain. Product AI remains off. Public launch authorization does not activate deletion before its migration, credential and hosted checks pass. These checks passed on 13 October 2026, with the limits in [Hosted verification](#hosted-verification-117).

## Retention rules (#191)

Spec #181 and D-109 (updates D-085) set these rules. Apply `supabase/migrations/20261016_add_customer_retention.sql` before the code ships. It adds three functions and changes no #78 function. The prior handoff records production application on 16 October 2026 (registry version `20261016171444`); this repair did not verify that hosted state. Apply the additive correction `supabase/migrations/20261016_fix_customer_retention.sql` before the repaired code runs. It adds the shared family payment-link function and replaces the candidate and claim functions. It changes no data and no #78 lease or request function. The parent owns migration application and hosted checks. Keep scheduled deletion disabled between migration application and deployment of the repaired worker. An older #191 worker cannot interpret the new booking links.

Apply `supabase/migrations/20261016_fence_booking_operations.sql` after that correction. The parent must stop new scheduled and manual deletion runs and drain all old runs before the booking-marker RPC changes. The parent must also drain old signup handlers and their Stripe calls before the booking fence migration. An old handler can have an acknowledged insert without a hold. Keep deletion off until the new signup handler and worker are deployed and the hosted checks pass. Do not resume old code against the new RPCs.

The booking API now uses the service-only `begin_booking_signup` transaction. It saves the signup, records its family links and takes a durable card-operation hold before it can create a Stripe customer. Anonymous and authenticated direct signup writes are denied. A booking admitted first blocks the freeze. A freeze admitted first blocks the booking. The booking still creates the same setup-mode Checkout and returns the same result fields. The API needs `SUPABASE_SECRET_KEY`; a missing RPC or uncertain admission reply permits no Stripe call.

`finish_booking_signup` releases the hold only after the customer and Checkout creation return and the customer is recorded, or when the API knows that no remote call started. A timeout, abort, lost remote reply or failed store completion keeps the hold. Holds have no time expiry. Reconcile an uncertain booking through its signup reference and Stripe records before an operator completes it. Never mark a booking `not_started` after a remote call began. Do not retry uncertain customer creation. Parent-requested deletion still runs after any in-flight operation is settled.

Email admission locks also cover parent creation and changes to parent/Auth email or email confirmation. Durable links preserve prior booking scope across email changes. Conflicting or unconfirmed identity stays unknown. A reserved signup keeps its payment reference after a known not-started result. A missing customer link stays unknown, so the existing manual card-link follow-up remains protected. Manual follow-up must also take a family hold before a Stripe request. The hosted checks must confirm both lock orders with two connections, new-family admission, identity changes, pending holds, RPC grants, trigger ownership and legacy links. Local PGlite checks do not prove hosted concurrent locks.

| Family | Rule |
| --- | --- |
| Customer: a live subscription, or a saved card that waits for the first workbook | Kept while it is a customer. |
| Former customer: only ended subscriptions in Stripe | Deleted 6 calendar months (UTC) after the latest subscription end (Stripe `ended_at`). Later tests do not change this deadline. |
| Free-test family: no subscription and no saved card, on the site's record or in Stripe | Deleted 12 calendar months (UTC) after the latest test activity. No test means no test-based deadline. Unchanged. |
| Any family, on a parent's request | Deleted at any time. Unchanged. |
| Stripe did not answer, or holds a state the rules do not know | Kept. The run reports `unknown` and is not ok. |

The rules are one pure function, `retentionDecision` in `src/lib/assessment/retention.ts`. Statuses `active`, `trialing`, `past_due`, `unpaid`, `paused` and `incomplete` are live. `canceled` is ended, and it needs `ended_at`; without it the family is unknown. `incomplete_expired` never started: it does not make a family a customer or a former customer. A status that Stripe adds later is unknown. A customer is certain whatever else Stripe holds, so a live subscription or a waiting card on any child's Stripe customer keeps the family. A saved card on a customer whose subscription ended does not wait for a first workbook.

The rules run twice. Only the second answer can start a deletion. The Node worker retries queued requests before it reads Stripe for unrelated families:

1. Before any freeze, read only. `family_retention_candidates` lists the queue, the due free-test families (`family_retention_due`, unchanged), and every non-admin family with Stripe history (a report card setup or a historical booking). For each family with Stripe history, the worker reads every subscription page (`status: all`), the payment methods and the finished Checkout Sessions of each customer (`src/lib/retention-stripe.ts`). Each subscription page must have a Boolean `has_more`; a missing, null or invalid value makes the family unknown. Only `false` confirms the last page. A family that is kept or unknown is not claimed, so it is never frozen. Dry mode stops here.
2. After the freeze. The worker claims with `claim_family_retention`. For a former customer it passes the latest Stripe end date; under the parent row lock the database checks the end date, the 6-month deadline, a payment link, a card operation and admin membership again. A queued family and a free-test claim go through `claim_family_deletion` unchanged. In the checking phase, `checkFamilyPayments` reads every customer again before it changes anything in Stripe. A keep answer unfreezes the family (`decide_family_deletion` with keep) and changes nothing in Stripe. A delete answer closes open card setups, checks that none came back, and decides again from a second complete set of fresh reads. Unknown keeps the request and its fence for a later run, as before.

A succeeded SetupIntent is a card saved in the past. For a former customer it is settled history, like a canceled one, so the cleanup checkpoint can pass it. For any other family it still means a saved card, so the family stays. The rule of the first decision sets this; if the second decision has a different rule, the result is unknown.

Limits:

- The HTTP route `/api/retention` still lists only the #78 candidates (the queue and due free-test families). It never claims a former customer. Its checking phase uses the rules above.
- Historical bookings use a verified link: `family_retention_cards` matches a booking to the confirmed Auth email and parent email, then the worker lists Stripe Customers for the booking email and requires the exact `signups.ref` in customer metadata. Missing references, unconfirmed or conflicting account emails, no matching customer, failed reads and incomplete customer pagination are unknown. All booking rows are checked, including rows without a reference. The same database function supplies candidate and frozen-family facts. Stripe discovery runs again in the final fresh check. A changed customer set cannot authorize deletion.
- Owner step: the restricted key must gain Customers read access. The historical #117 probe below returned 403 for Customers. Verify current access, the new migration registry and grants, booking-link decisions, and a manual workflow dry run before enabling the repaired worker. No hosted permission change or migration ran in this repair.
- A Stripe customer deleted in the Dashboard fails its reads, so the family is unknown and stays. If it was already frozen, it stays frozen until someone reconciles it.
- The read-only step makes about four Stripe list reads per customer per run, one family at a time and four customers at once. It shares the 14-minute work budget with deletions.

## The copy without names (#201)

Spec #181 and D-119 (updates D-085 and D-109). Apply `supabase/migrations/20261016_test_copies_without_names.sql` before this code ships. It adds two tables (`anonymous_tests`, `anonymous_test_links`) and three service-only functions, and changes no existing table, function or trigger. The worker on main writes no copies and keeps working against it. Until the new worker is deployed, its deletions write no copy, as today.

Every deletion runs `deleteFamily` after the payment check has moved the request to the `deleting` phase, which no payment answer can reopen. This covers a parent's request, free-test and former-customer retention, and the manual route. The steps:

1. `family_copy_sources` reads every test of the frozen family. It selects no name, email, postal code, drawing or stroke path, typed working, note or AI text.
2. The assessment core builds each copy with its allowlist (`anonymousTestCopy`, `COPY_FIELDS`). The extra round (#190, D-116) is removed (D-145): copy version 2 has no `extraRound` record and no `round` on a question. Two tests from before the removal still store the round's questions (ids `x-0` to `x-7`), their answers and serves; the copy leaves them out, and its placement leaves out the old `extraRound` note. Copies saved before (version 1) keep their round fields.
3. `save_family_test_copy` saves one copy and its link to the test in one transaction. It requires the current, unexpired deleting lease, a test of this family, the allowlisted fields (at the top and in each question; since migration remove_extra_round_functions, D-145, the list matches the copy's fields and has none of the removed round's), and the database's own grade, province, month and test-family mark. A test that already has its copy returns false and writes nothing.
4. `confirm_family_copies` must return true: every test of the family has its copy.
5. Only after step 4 does the worker remove drawings, then delete Auth.

Any failed, lost or missing step throws. The request and its fence stay for a later run (fail closed). A missing function (migration not applied, `PGRST202`) also stops the deletion. The fence keeps new tests out after the request. The link goes with the family through the Auth cascade, so a retry writes no second copy, and nothing links a copy to a family after the deletion. The copy has no timestamp. Its times are milliseconds since the test started, and its only date is the month.

Dry mode reads `family_copy_sources` for each family it would claim and prints `copy`: `families`, `tests` (copies to write), `copied` (already written), `questions`, `facts`, `profiles`, `questionnaires`, `failed` and `fields` (the field names). It never prints ids or values. `failed` above 0 makes `ok` false. Delete mode prints `copies`, the copies written in that run.

Admins export the copies at `/api/admin/anonymous-copies?format=csv` (one row per question shown) or `?format=json` (every copy, whole). Test families are left out unless `&test=1`. The admin export page (`/admin/export`, #200) lists them as the dataset "Copies without names".

Limits: the local checks ran on PGlite with one connection (the real migration chain, the real built worker entry, blocked network). They do not prove hosted lock behavior. The HTTP route's `dry=1` still lists candidates only. Hosted checks still required: the migration registry and grants, a manual Actions dry run that shows `copy`, and deleting a named QA family on the preview, then confirming that its copies exist and the family is gone.

## Process and concurrency

An admin opens a parent record and confirms its email. The route checks the signed-in user with Auth and the current admin registry. The session RPC checks admin membership again under a row lock. It refuses admin accounts and an active card operation. It writes a durable request and freezes the parent. The worker removes all objects in the exact private family folder before deleting Auth. The existing foreign keys remove the family tables. A final SQL check confirms that Auth, parent, and Storage records are absent before it removes the request.

Each family write takes a shared parent row lock through database triggers. A deletion request takes the exclusive parent lock and sets a persistent fence. A test, answer, or card save that wins the lock first changes eligibility before the claim. A write that loses the lock is rejected. The Storage trigger also fences secret-key uploads. Storage object insertion before the claim finishes first and enters the listing. Later insertion fails. A request accepted before admin revocation remains an authorized request; a request after revocation fails, including with the same session token.

Card creation holds the family across external Stripe requests. Retention cannot claim an active hold. After freezing a family, the worker deduplicates every tracked Stripe customer and checks up to four customers concurrently. Confirmed saved state cancels only the retention check and reopens the family. Unknown state keeps the checking request and the family fence. A timeout must not discard completed work or authorize deletion. Explicit deletion does not cancel a subscription or delete Stripe payment history. It must be handled separately if requested.

Checkout reads use Stripe's supported `open` and `complete` status filters. Each open page is expired, then the worker reads the first open page again. Expiration is durable progress. Historical expired sessions do not need traversal. Cleanup resumes across attempts. A completed canceled-intent checkpoint skips repeated cleanup for that customer. It does not establish that sessions or cards are clear. After all customers are prepared, a separate pass reads every customer's open sessions and current intent head. A changed head or open session invalidates preparation and keeps the request frozen. The final pass then reads completed sessions, payment methods, and subscriptions for every customer. No clear payment decision is stored between attempts. An interrupted final pass starts again with fresh reads for the full customer set.

SetupIntent listing has no status filter. The worker checks every page, including histories with more than 1,000 entries. A succeeded intent preserves the family. A processing or unrecognized state remains unknown. An unused intent in a supported cancelable state is canceled before traversal advances. The cursor records only immutable canceled intents. Partial traversal checks the current first page before resuming. Completed traversal is revalidated in the separate full-family pass; a new head or nonterminal entry resets preparation. A final fresh head check and current payment reads are required before deletion. Stripe states that operations on canceled SetupIntents fail. This terminal state permits durable traversal without caching a mutable clear result. See [SetupIntent listing](https://docs.stripe.com/api/setup_intents/list), [cancellation](https://docs.stripe.com/api/setup_intents/cancel), and [Checkout listing](https://docs.stripe.com/api/checkout/sessions/list).

Before each expiration or cancellation, a lease-guarded SQL operation record is written. A lost response leaves that record. A retry reads the resource's current state; it does not repeat an uncertain mutation. Only a fresh expired/canceled or complete/succeeded result can settle the record. Terminal records remain until the queue is removed, so a stale listing cannot cause a second mutation. Unknown reads and unresolved records block both the SQL deletion decision and reopening. A stale worker cannot settle a record or advance traversal after lease takeover. SetupIntents owned by Checkout cannot be canceled directly. If session expiration has not left the intent terminal, its state stays unknown. Do not force a clear result. Reconcile with Stripe before removing a hold. Live provider behavior and restricted-key cancellation access still require hosted verification.

A confirmed not-started operation is different from a lost remote result. If the journal request fails, or its response consumes the deadline before the Stripe method is invoked, the worker uses the separate control deadline to remove only its own pending record. The journal stores the originating lease token. `abandon_family_payment_operation` requires the same current, unexpired token, the same origin, and a null outcome. It cannot remove terminal records or a previous worker's uncertainty. The worker never invokes this recovery after calling a Stripe mutation. A failed recovery retains the record and the fence. A process crash with no reliable not-started result remains uncertain and requires reconciliation; age alone cannot release it.

The last test deadline uses the latest start, completion, or last answer across all children. It includes each stored answer's server timestamp, the facts section's start, and each facts answer's server timestamp. A committed answer changes eligibility even if its separate last-answer update fails. It adds 12 calendar months in UTC. An account with no test has no test-based deadline. Families with Stripe history follow the [retention rules](#retention-rules-191), and admin identities are excluded. The daily GitHub Actions worker (below) runs retention; it never sends emails or analytics. The Vercel schedule for `/api/retention` was removed at handover (#117). The route remains for manual use with `CRON_SECRET`. Dry mode is `/api/retention?dry=1` with the same authorization. It reports counts only.

Candidates use 100-row keyset pages. Images use 100-object pages in each folder. The worker removes each page, then reads offset zero again. Removed objects are durable progress. A stopped attempt resumes from the remaining objects without rebuilding the whole image tree. A short page is not an end marker. Every folder is read until empty. This avoids skipped objects when removal shifts the listing. Auth is deleted only after the entire family folder is empty. This also removes images with no answer reference and handles nested folders across children and tests.

Family UUIDs are normalized to lowercase before the request, Storage lookup, and Auth deletion. The daily job saves its last family before each attempt. The next run starts after that family and wraps once through the full candidate set. A slow first family cannot reset progress. Each scheduled family has at most thirty seconds for external requests within the route's 45-second work budget. The first attempt uses the current remaining time, including when the clock has advanced since the initial budget read. Later attempts require the initial full attempt budget before the cursor advances. This prevents a later family from repeatedly receiving only a short final attempt. Supabase requests use an abort signal. Each Stripe page and request uses the remaining timeout without network retries. Four customers are checked at once; current-state checking starts three reads per customer, so four concurrent customers can use twelve concurrent reads. At most four mutations run inside each customer. No call is scheduled after the deadline. Every started call is awaited, including when another call fails. Lease release and confirmed not-started recovery use the job's separate control deadline. An interrupted release leaves the lease for expiry and reclaim. A local timeout does not prove that Stripe canceled its remote work; the durable operation record retains this uncertainty.

## Recovery and deployment checks

Storage failure, Auth failure, or process termination leaves the request and the fence. A five-minute lease prevents duplicate workers. Normal failure releases the lease for a prompt retry. A stopped worker's expired lease can be reclaimed. A stale token cannot change or complete a job. Once the job enters deletion, no payment check can reopen the family. The daily job includes pending requests even when Auth has already been removed.

A process failure or caught Stripe failure during card creation can leave a `family_card_operations` hold. It has no automatic expiry. A known successful result releases only its own hold. A lost response keeps its hold even when the UI offers a later card link. Do not remove it on age alone. First stop the owning run. Reconcile the customer's idempotency reference, every Checkout session, and the saved-card state in Stripe. Record a succeeded setup in `card_setups`, or expire all open sessions and confirm no external request can resume. Then remove only that reconciled operation with `end_family_card_operation(token)`. A hold must block deletion while its result is unknown.

Before the final production rollout:

1. Apply the new migration with the migration tool. Verify the registry and probe the functions and triggers. Do not reapply the admin migration.
2. Deploy this code. Wait for old card-route invocations to finish before testing or enabling a retention run. The old implementation has no external card hold.
3. Test concurrent test starts, answers, card actions, and uploads against the claim in both orderings. Prove the full family scope and current-session admin revocation.
4. Test more than 1,000 candidate rows and private objects. Compare the full ID sets, not one page.
5. Inject Storage, Auth, and final queue failures. Test retry, lease expiry, and stale-token denial.
6. Check payment progress with eight customers, larger distinct-customer sets, and more than 1,000 sessions and SetupIntents. Verify current saved/processing state, supported cancellation permissions, remote lost results, pending records, and lease takeover. Do not run these tests against customer records.
7. Check the protected preview and deployed cron configuration. Before any bulk QA run, inspect the exact eligible set and prove that every eligible family is a fresh named QA family. Do not use production families as fixtures.

The normal production schedule must use the approved retention policy. The QA runner must not call a live bulk retention route while any eligible production family is present.

## Payment completion evidence and limits

The old ten-second budget failed twice for twenty distinct tracked customers with 400-millisecond responses. The previous round 3 source (`9e26a99`) completed that exact fixture in one ten-second attempt within a thirty-second budget. It made 180 provider calls, including 120 fresh current-state reads covering all twenty customers. It also completed twenty customers with one-second responses in 25 seconds, and 32 customers with 400-millisecond responses in 16 seconds. These are isolated service-boundary checks. They do not prove live Stripe behavior or completion for arbitrary customer counts, response times, or continual remote changes.

Those results describe the previous source. Round 4 found that the same thirty-second budget repeatedly failed for eight customers with four-second responses and 32 customers with one-second responses. The separated cleanup and decision correction completes both cases in two attempts. The final attempt takes 16 seconds, makes 40 calls for eight customers or 160 calls for 32 customers, and covers the full customer set with fresh reads. The first attempt persists only immutable preparation, not a clear decision. The time cap and four-customer limit remain unchanged.

There is no database child-count constraint; the account route's separate count and insert requests do not establish an eight-customer invariant. Do not truncate the customer set or use a cached clear result to permit deletion. Large histories preserve confirmed expiration and canceled-only traversal progress. A family whose fresh decision cannot fit in the bounded route still remains frozen and pending. Treat it as unresolved, not as deletion permission. The migration and hosted checks remain required before scheduled deletion can be enabled.

The final decision has a finite execution limit. In the uniform-latency service fixture, its two full-family passes require about `2 * ceil(customer_count / 4) * response_latency` plus Data, SQL, Storage, and Auth time. Preparation can span attempts; mutable clear reads cannot. The foreground Node worker below provides execution outside the HTTP route. It still cannot guarantee completion for arbitrary counts, persistent unknown reads or continual remote changes. A cached decision or a child-count assumption is not an accepted alternative.

## Foreground Node worker

The source contains `.github/workflows/retention.yml`. It is active and hosted-verified (#117): it runs daily at 15:17 UTC. Scheduled runs require `RETENTION_WORKER_ENABLED=on`. Manual mode defaults to `dry`. Delete mode requires that same activation flag and authenticated production credentials. The job accepts only `refs/heads/main`, uses one concurrency group with cancellation disabled, and grants the GitHub token only `contents: read`. Checkout and setup-node use pinned commit hashes. Secrets enter only the final Node step. The Vercel keepalive schedule stays. The Vercel retention schedule was removed at handover (#117).

Build with `node scripts/build-retention-worker.mjs`. Run the foreground entry with `node --conditions=react-server .retention/worker.mjs --mode dry`. The default mode is dry. This mode reads every candidate page and, with the Stripe key, makes the read-only Stripe reads of step 1 in [Retention rules](#retention-rules-191), within the work budget. It prints the decision counts for the families checked: `eligible` (families a delete run would claim), `queued`, `delete_free_test`, `delete_former_customer`, `keep_customer`, `keep_former_customer`, `keep_free_test`, `keep_no_test` and `unknown`. It also prints `deferred`, the number of candidates not processed within the budget. Without a Stripe key, every checked family with Stripe history is `unknown`. Any `unknown` or `deferred` makes `ok` false. Dry mode does not claim, read or advance the cursor, renew, mutate providers or delete. Delete mode prints the same counts and the deletion counts. The client uses explicit SDK credentials and has no Next request context or environment-file loader. Do not copy local/test keys to GitHub.

The job has a twenty-minute limit. Four setup steps have one-minute limits. Node allows fourteen minutes of work, up to ten minutes per family, and thirty seconds for final control cleanup. The HTTP scheduler keeps its thirty-second default. The Node worker first processes queued requests, in cursor order, before other candidates. It saves the cursor before each candidate's reads or deletion attempt. It processes each candidate before it starts another. This includes candidates that it keeps or cannot decide, so slow reads do not restart the same scan on every run. The first Node attempt uses its current remaining time. Later candidates require the reserved full family budget before cursor advancement. A deletion uses at most that budget and the time that remains after its reads. After a long failed attempt, the next invocation starts after that family within its queued or unqueued group. These are operating bounds, not guaranteed response times.

The worker renews checking and deleting leases once per minute, one request at a time. `renew_family_deletion_work` requires the current unexpired token. A checking card hold, expired token, stale token, false result or failed renewal blocks work. Renewal cannot reclaim, reopen, change an operation origin, or clear uncertainty. The existing deleting-only renewal stays in place. Stop and join the heartbeat before lease release. A completed lease must not continue to renew in the background.

SIGINT and SIGTERM stop new work. Supabase and Stripe use combined work, attempt and per-request abort signals. Work requests have a thirty-second limit. Control requests have a ten-second limit and an independent signal for release and confirmed not-started recovery. Await every started request. A local abort cannot prove a remote mutation stopped. Retain its journal and reconcile through fresh reads. Hard runner loss can prevent cleanup. The lease then expires; a later claim may resume, but renewal itself cannot reclaim. A new owner cannot erase a prior-origin uncertain record. Never abandon after invoking a mutation. GitHub cancellation can kill the process before graceful cleanup finishes. See [cancellation semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation).

Required GitHub inputs:

| GitHub name | Worker name | Required access |
| --- | --- | --- |
| Variable `RETENTION_SUPABASE_URL` | `SUPABASE_URL` | Exact project URL `https://cdjobwsyzndtltzfpyqa.supabase.co` |
| Secret `RETENTION_SUPABASE_SECRET_KEY` | `SUPABASE_SECRET_KEY` | Dedicated server secret: service RPCs/card reads, private Storage list/remove and Auth admin delete. This key bypasses RLS. |
| Secret `RETENTION_STRIPE_SECRET_KEY` | `STRIPE_SECRET_KEY` | Dedicated restricted live key: Checkout Sessions and SetupIntents read/write; Customers, Payment Methods and Subscriptions read. No charges, refunds, subscription cancellation or Customer deletion. Dry mode uses it for reads only. Subscriptions read was confirmed on 13 October 2026 (#117), and every run checks it again before any claim. |
| Variable `RETENTION_WORKER_ENABLED` | Same | `on` since 13 October 2026 (#117). Set it to any other value to stop scheduled and delete runs. |

Delete rejects missing, test, publishable, placeholder, unrestricted Stripe and wrong-project inputs. Dry mode accepts no Stripe key, and rejects any Stripe key that is not a restricted live key. Format validation is insufficient by itself. Before any claim or cursor change, authenticated reads check the Stripe key (an open Checkout Sessions list and a Subscriptions list, both in live mode), and the paged candidate RPC validates Supabase access. Neither preflight proves every later write permission. Restricted-key expiration/cancellation, Checkout-owned refusal, Storage permissions and live SQL grants remain deployment checks. The worker prints only aggregate status and constant errors. No IDs, payment payloads, environment values or SDK error details enter logs.

The 64-customer one-second-response fixture fails seven times in the HTTP path. The actual built Node entry completes cold preparation and deletion in 81.094 simulated seconds, and a prepared family in 33.046 seconds. The 128-customer three-second case completes in 483.175 seconds with eight renewals. A deleting-phase test drains exactly 1,007 nested images in 457.103 seconds with seven renewals. A ten-minute timeout preserves progress. These tests use real SDK transport parsing with a virtual clock and synthetic responses. They do not prove Actions execution, real keys, hosted SQL, live contention or managed Storage behavior.

## Worker activation checks

1. Apply both migrations in dependency order with permitted access. Verify the registry, grants, blank search paths, trigger ownership, expired/stale refusal and live concurrency. Do not reapply the admin migration.
2. Provision dedicated production secrets through the owner's private input. Confirm actual permissions, credential rotation, Actions access controls, remaining minutes and billing limits. Keep activation off. No local placeholder is a production key.
3. Before this workflow is on the default branch, validate YAML, pinned actions, local build/help, and the actual entry through isolated transports. `workflow_dispatch` and schedules require the workflow on the default branch. Local syntax checks do not prove hosted Actions behavior. See [workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
4. After separately authorized hosted deployment, run manual dry mode first. Then use only an inspected exact named-QA set for recovery, renewal beyond five minutes, signals/hard loss, current payment reads, Storage-before-Auth and restricted-key tests. No customer fixture or live bulk request is permitted as a test.
5. Enable the Node schedule only after those checks pass. Then remove only the Vercel retention schedule. Keep keepalive, admin requests and aggregate job monitoring. No additional application emails. Status 13 October 2026: steps 4 and 5 are done with the limits in [Hosted verification](#hosted-verification-117).

GitHub-hosted jobs permit six hours; this job uses twenty minutes. Private Free includes 2,000 minutes/month and Pro 3,000. Standard Linux overage is USD 0.006/minute. Thirty-one daily twenty-minute runs plan for 620 minutes, or USD 3.72 if all are chargeable. Other jobs and rounding add usage. Actual account quota is unverified. Schedules can be delayed or dropped. This source creates no subscription or billing configuration. See [limits](https://docs.github.com/en/actions/reference/limits), [rates](https://docs.github.com/en/billing/reference/actions-runner-pricing), and [billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Hosted verification (#117)

Run on 13 October 2026 against production, with four new named QA families (`qa117-a` to `qa117-d@unicalearning.com`). The queue held only these four families, and the dry run found 0 eligible families before delete mode ran. No Stripe customer fixture was used.

| Check | Result |
| --- | --- |
| Actions runner, dry mode | Run 38333980108 on `main`: `{"ok":true,"dry":true,"eligible":0}`. |
| Credentials | Dedicated Supabase secret key `retention_worker` and live restricted Stripe key `unica-retention-worker` (Checkout Sessions write, Setup Intents write, Payment Methods read, Subscriptions read; read on the Stripe review screen). Read probe: Checkout Sessions, SetupIntents and Subscriptions lists 200; Customers, Charges and Balance 403. No write call was made, so write access is configured but not exercised. |
| Fence, write first | Two concurrent connections. The deletion request waited 6 s for the open child insert to commit, then returned `requested`. |
| Fence, request first | The late child insert waited 7.6 s for the request to commit, then failed with `family_unavailable` (55000). |
| Storage trigger | After the request, a new upload and an overwrite with the server secret key both failed with 55000. Existing images stayed. |
| Delete mode and lease recovery | Run 38334927154: 2 deleted, 1 busy (QA family held by a fake live lease), 1 failed (see #138). Run 38335331038 after lease expiry: 2 deleted, 0 failed. It resumed the partial family and took over the expired lease. The old lease token then returned `false` from `renew_family_deletion_work`. |
| Storage before Auth | The failed family kept its Auth user, rows and queue entry while 2 images remained. After the final run: QA Auth users 0, parents 0, children 0, images 0, queue 0, payment records 0. Non-QA counts were unchanged (1 parent, 8 images). |

Not covered: renewal beyond five minutes, signals and hard runner loss, live Stripe cancellation and expiration, and Checkout-owned intents. These need a QA family with Stripe history, and the rules above do not allow a customer fixture. Only the isolated tests in this document cover them. A family with Stripe history keeps its fence when a payment read is unknown, so these paths fail closed.

Open defect: #138. A family with mixed-case sibling folders in Storage stops at every run. On 13 October 2026, no non-QA object had a mixed-case path.

## Parent PIN (#300)

`public.parent_pins` holds one row per parent (the PIN's salted hash and the attempt count). Its `parent_id` references `public.parents` with `on delete cascade`, so the existing family deletion removes the row when it deletes the parent's Auth user. The worker needs no code change and no table list. Checked on the live database (29 October 2026): the foreign key delete rule is cascade; the table has the family write fence trigger; no role except the secret key can read or write the table or call `claim_pin_attempt`. Row-level security is on with no policy, so a signed-in parent reads no row, theirs or another family's.

## Workbooks (#299)

`public.workbooks`, `public.workbook_pages` and `public.workbook_questions` (migration `add_workbooks`) hold each workbook, its pages and its questions. Each row carries the family's `parent_id`. The workbook references the child and the parent with `on delete cascade`, and the pages and questions reference their workbook and page the same way, so the existing family deletion removes every row when it deletes the parent's Auth user. The three tables have the family write fence trigger.

The page images and workbook PDFs are in the private Storage bucket `workbook-pages`, at `<parent id>/<workbook id>/<name>`. The worker empties the family's folder in both family buckets (`shown-work` and `workbook-pages`, `FAMILY_BUCKETS` in `src/lib/assessment/deletion.ts`) before it deletes Auth. `complete_family_deletion` refuses to finish while either folder has a file, and the Storage fence trigger refuses new files in either bucket for a family that is being deleted. The retention worker runs the same deletion, so it needs no other change.

Checked on the live database (29 October 2026), in transactions that were rolled back: with a deletion request, a new file in `workbook-pages` failed with `family_unavailable`; deleting the test family's Auth user left 0 workbook, page and question rows; `complete_family_deletion` answered false while the family's 3 page images were still in the bucket.

The migration went live on 29 October 2026, before the worker code of #299 merged. In that time the worker on `main` did not empty `workbook-pages`, so a deletion of the one test family with the sample workbook would stop before it completed and keep its request for a later run.

## Learning events (#302)

`public.learning_events` (migration `add_learning_events`) holds the append-only learning events of each child: from calls, marked pages and assessment answers (`src/lib/learning-events.ts`). Every row has `parent_id` (references `public.parents`), `child_id` with `parent_id` (references `public.children (id, parent_id)`), and for an assessment question `assessment_id` with `child_id` (references `public.assessments (id, child_id)`), all `on delete cascade`. The existing family deletion removes every row when it deletes the parent's Auth user, and a test deletion removes that test's events. The worker needs no code change and no table list. The retention rules need no change: a free-test family has events only from its tests, so its last test is still its last activity; a family with calls is a customer, and the worker keeps it.

The service role may only insert and read: it has no update, delete or truncate grant, and a trigger refuses every update, from any role. The foreign key cascades run as the table owner, so they still delete the rows. The table has the family write fence trigger. Row-level security is on; the one policy lets admins read. A signed-in parent reads no row, theirs or another family's.

Checked on the live database (29 October 2026), in one transaction that was rolled back, for a test family (`test_accounts`) and one other family:

| Check | Result |
|---|---|
| Server insert (service role) of an assessment event and a call event | 2 rows |
| Retry with the same idempotency key | refused (23505); 1 row for the key |
| Update or delete by the service role | refused (42501) |
| Update by the table owner | refused (55000, "learning events are append only") |
| A child under another family's parent id | refused (23503, foreign key) |
| Another family's child on this family's test | refused (55000, `family_scope`) |
| A signed-in parent reads: own family, another family | 0 rows, 0 rows |
| A signed-in parent inserts; anon reads | refused (42501), refused (42501) |
| An admin reads | 2 rows |
| Insert after the family's deletion request | refused (55000, `family_unavailable`) |
| The service role deletes the child | 0 events left |
| The Auth user is deleted (the deletion's last step) | 0 events left, 0 parent rows |

The backfill (`backfillAssessment` in `src/lib/learning-events-assessment-store.ts`) ran once on the hosted database with the secret key for the test family's finished test: 42 events from 42 answers (34 right, 8 wrong), a second run 0 new and 42 already stored, a range read 42. The owner then removed those rows; the table held 0 rows after.

## Child profiles (#303)

`public.child_profiles` (migration `add_child_profiles`) holds one current profile per child, built by code from the child's latest test profile and every learning event of the child (`src/lib/child-profile.ts`). `parent_id` references `public.parents`, `child_id` with `parent_id` references `public.children (id, parent_id)`, and `assessment_id` with `child_id` references `public.assessments (id, child_id)`, all `on delete cascade`. The existing family deletion removes the row when it deletes the parent's Auth user. A test deletion removes the profile built on that test. The site has no single-test deletion: a test deleted by hand should be followed by a rebuild of the child's profile (`rebuildChildProfile`), which builds it again from what is left, or replaces it with an empty profile when nothing is left (it also drops an older test's events from the facts). The worker needs no code change and no table list. The retention rules need no change: the profile is built from the tests and the events, so it adds no activity of its own. Its AI findings (#304) are part of the profile's JSON, so they go with the row; each links only event ids of the same child.

The service role may only read, insert and update: it has no delete grant. The table has the family write fence trigger. Each stored build has a random `build_token` (migration `child_profile_build_token`); a rebuild stores only over the token it read, so after a test deletion removes the row and a new first build starts again at revision 1, a rebuild that read the deleted row stores nothing over the new one. A save that names a test deleted since the rebuild read it fails in the fence trigger (55000 `family_scope`, before the foreign key); the store then checks that the test is gone and builds again from what is left. Row-level security is on; the one policy lets admins read. A signed-in parent reads no row, theirs or another family's.

Checked on the live database (29 October 2026), in one transaction that was rolled back, for a test family (`test_accounts`) and one other family:

| Check | Result |
|---|---|
| Server insert (service role), one profile in each family | 2 rows |
| Update that expects revision 1, then the same update again (compare and set) | 1 row, then 0 rows |
| A second first save for the same child | refused (23505) |
| Delete by the service role | refused (42501) |
| A child under another family's parent id | refused (23503, foreign key) |
| A profile on another family's test | refused (55000, `family_scope`) |
| `schema_version` that does not match the JSON | refused (23514) |
| A signed-in parent reads: any, own child, another family | 0 rows, 0 rows, 0 rows |
| A signed-in parent updates, inserts; anon reads | refused (42501), refused (42501), refused (42501) |
| An admin reads | 2 rows |
| The profile's test is deleted | 0 rows left for the child |
| Update after the family's deletion request | refused (55000, `family_unavailable`) |
| The Auth user is deleted (the deletion's last step) | 0 rows left for the family; the other family's row kept |
| After `child_profile_build_token` (29 October 2026): the base test is deleted, a new first build is stored | 0 rows, then revision 1 with a new token |
| An update with the deleted row's token; with the new token | 0 rows; 1 row |
| A save naming the deleted test; naming another family's test | refused (55000 `family_scope`) both, in the trigger before the foreign key |
