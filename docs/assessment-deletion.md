# Family deletion (#78)

Apply `supabase/migrations/20261011_add_family_deletion.sql` before this code ships. The migration is additive. It creates no deletion requests and deletes no family. Live application is blocked: the Supabase connector returned `MCP error -32600: You do not have permission to perform this action` for apply, registry, and SQL probes on 11 October 2026. Do not treat isolated SQL validation as live application.

Keep `ASSESSMENT_PILOT=on` only for the existing pilot. The new admin route and `/api/retention` answer 404 with the pilot off. Product AI remains off.

## Process and concurrency

An admin opens a parent record and confirms its email. The route checks the signed-in user with Auth and the current admin registry. The session RPC checks admin membership again under a row lock. It refuses admin accounts and an active card operation. It writes a durable request and freezes the parent. The worker removes all objects in the exact private family folder before deleting Auth. The existing foreign keys remove the family tables. A final SQL check confirms that Auth, parent, and Storage records are absent before it removes the request.

Each family write takes a shared parent row lock through database triggers. A deletion request takes the exclusive parent lock and sets a persistent fence. A test, answer, or card save that wins the lock first changes eligibility before the claim. A write that loses the lock is rejected. The Storage trigger also fences secret-key uploads. Storage object insertion before the claim finishes first and enters the listing. Later insertion fails. A request accepted before admin revocation remains an authorized request; a request after revocation fails, including with the same session token.

Card creation holds the family across external Stripe requests. Retention cannot claim an active hold. After freezing a family, the worker pages through every tracked Stripe customer and its Checkout sessions, expires open sessions, and checks setup intents, payment methods, and subscriptions. Any saved card or uncertain result cancels only the retention check and reopens the family. Explicit deletion does not cancel a subscription or delete Stripe payment history. It must be handled separately if requested.

The last test deadline uses the latest start, completion, or last answer across all children. It includes each stored answer's server timestamp, the facts section's start, and each facts answer's server timestamp. A committed answer changes eligibility even if its separate last-answer update fails. It adds 12 calendar months in UTC. An account with no test has no test-based deadline. Saved-card families and admin identities are excluded. The daily Vercel cron uses `CRON_SECRET` and never sends emails or analytics. Dry mode is `/api/retention?dry=1` with the same authorization. It reports counts only.

Candidates use 100-row keyset pages. Images use 100-object pages in each folder. The worker removes each page, then reads offset zero again. Removed objects are durable progress. A stopped attempt resumes from the remaining objects without rebuilding the whole image tree. A short page is not an end marker. Every folder is read until empty. This avoids skipped objects when removal shifts the listing. Auth is deleted only after the entire family folder is empty. This also removes images with no answer reference and handles nested folders across children and tests.

Family UUIDs are normalized to lowercase before the request, Storage lookup, and Auth deletion. The daily job saves its last family before each attempt. The next run starts after that family and wraps once through the full candidate set. A slow first family cannot reset progress. Each family has at most ten seconds for external requests. Supabase requests use an abort signal. Each Stripe page and request uses the remaining timeout without network retries. The worker awaits these requests; it does not leave a timed-out task in the background. Lease release has the job's separate control deadline. An interrupted release leaves the lease for expiry and reclaim.

## Recovery and deployment checks

Storage failure, Auth failure, or process termination leaves the request and the fence. A five-minute lease prevents duplicate workers. Normal failure releases the lease for a prompt retry. A stopped worker's expired lease can be reclaimed. A stale token cannot change or complete a job. Once the job enters deletion, no payment check can reopen the family. The daily job includes pending requests even when Auth has already been removed.

A process failure or caught Stripe failure during card creation can leave a `family_card_operations` hold. It has no automatic expiry. A known successful result releases only its own hold. A lost response keeps its hold even when the UI offers a later card link. Do not remove it on age alone. First stop the owning run. Reconcile the customer's idempotency reference, every Checkout session, and the saved-card state in Stripe. Record a succeeded setup in `card_setups`, or expire all open sessions and confirm no external request can resume. Then remove only that reconciled operation with `end_family_card_operation(token)`. A hold must block deletion while its result is unknown.

Before the final production rollout:

1. Apply the new migration with the migration tool. Verify the registry and probe the functions and triggers. Do not reapply the admin migration.
2. Deploy this code. Wait for old card-route invocations to finish before testing or enabling a retention run. The old implementation has no external card hold.
3. Test concurrent test starts, answers, card actions, and uploads against the claim in both orderings. Prove the full family scope and current-session admin revocation.
4. Test more than 1,000 candidate rows and private objects. Compare the full ID sets, not one page.
5. Inject Storage, Auth, and final queue failures. Test retry, lease expiry, and stale-token denial.
6. Check the protected preview and deployed cron configuration. Before any bulk QA run, inspect the exact eligible set and prove that every eligible family is a fresh named QA family. Do not use production families as fixtures.

The normal production schedule must use the approved retention policy. The QA runner must not call a live bulk retention route while any eligible production family is present.
