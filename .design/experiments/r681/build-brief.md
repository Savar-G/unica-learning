# Fast results call build

FAST_RESULTS_CALL_BUILD_DONE

## Approved contract

Savar approved opening A and the signup and calendar layouts in `preview.html` on 2026-11-11.
Sender: Cedric and Savar, co-founders of Unica Learning.
Use plural pronouns: "Gerald found multiplication hard. Would you like us to explain how we can help Gerald with multiplication?"
Use a neutral opening when the existing data has no clear weak topic. Do not put scores or counts in the opening.
Read AGENTS.md, DESIGN.md, and the relevant decisions first. D-321 records this approval.

## Ownership

- Work only in `/Users/savargupta/.t3/worktrees/pagewise-landing-page/site-phone-results-call`, branch `site/phone-results-call`, base `3b1e1290db8e7838297fa0513db5a642d3b18f62`.
- This is an isolated Mac worktree. The linked PC is unavailable. Do not create another checkout or delegate.
- Own product source, product tests, necessary dependencies, and the build evidence. Do not edit AGENTS.md, DESIGN.md, `.design/decisions.md`, `.design/state.json`, the vault, migration files, `src/lib/database.types.ts`, or `src/lib/database.checks.ts`.
- Root has finished the database work and will not edit product source while this task runs.
- Do not push, open a PR, merge, deploy, send email, call a parent, or change live data.

## Database already applied

`supabase/migrations/20261111_parents_phone.sql` is applied to `cdjobwsyzndtltzfpyqa` as `20261111180531 parents_phone`.
`parents.phone` is nullable text. It has an E.164 NANP shape constraint.
The existing eight-argument `create_family` remains available for the old deployment.
The new nine-argument overload takes required `p_phone` as its final argument. It validates the normalized phone, calls the existing admission function, then saves the phone when the result is `created`, in the same transaction.
Both overloads are service-only and security invoker.
Hosted rollback probes passed: new creation, existing-family preservation, legacy creation with null phone, invalid/null rejection, failed-child rollback, and cascading family deletion.
`npm run db:types` and `npm run db:checks` have generated the checked-in files. The new function overload can require a distributive correction in `database.ts`; never edit generated types by hand.

## Build all requirements

1. Add a required phone field to AccountSignup on `/start`, including its phone-device version, and FinishAccount for Google signup. No explanatory hint under the field. Preserve the current password/code flow. Validate in the UI and on the server. Accept valid Canadian/US phone formats and normalize to E.164. Reject extensions, foreign numbers, partial or invalid inputs. A focused phone library is permitted if needed. Do not confuse the existing `phone` device boolean with the telephone value.
2. Save the number via the new create_family overload. An existing family must return unchanged before phone validation, including an older family with no phone. Avoid phone in source attribution, analytics, ad tags, URLs, logs, and error messages. Show a tap-to-call number on the admin family page. Update the privacy disclosure for the actual collection and purpose using plain factual words. Confirm family deletion and retention remove it and do not create an additional retained copy.
3. The existing team report alert at SIGNUP_NOTIFY_EMAIL must have HTML plus plain text, a tel link, the child's first name and school grade, the main results, and a short call strategy. Reuse `resultsDeck` from #802 for the strategy. Do not add another generator or model call. Link `/admin/reports/<report id>/deck`. Keep existing delivery/claim/retry rules. Send at any hour. Represent absent phone honestly. Never send a real alert or report in this task.
4. The parent report email starts with opening A, using the weakest clear topic from existing code-computed data in plain parent words. Topic only, with a neutral fallback. The button immediately after the opening says "Book your 15-minute results call". Use both approved names and plural pronouns. Quote the display name correctly if its comma requires RFC mailbox quoting. Do not alter other email senders or signatures without need. Preserve offer=false and the report-only footer for unsubscribed parents. Keep HTML/text equivalent.
5. Embed Calendly inside the #795 results-call section. No request to Calendly, iframe, or external script until `getConsent() === 'granted'`. Subscribe to consent changes and remove the frame on withdrawal. Keep the fallback booking link visible during loading, failure, and denied/unset consent. A blocked or slow frame must not remove the link. When BOOKING_URL is empty use the contact email fallback. Do not prefill phone, name, email, child data, or report identifiers into the booking URL. Do not leak the report URL as a referrer. Prefer an iframe without a parent-level third-party script if it meets the embed contract. Keep calendar cookies under Calendly's own controls too. Use the approved compact card layout and responsive dimensions. Preserve the sample report and golden tests.

## Verification and report

- Install dependencies in this worktree if absent. Read the relevant installed `node_modules/next/dist/docs/` guide before writing Next code.
- State a falsifier before each check. Use public interfaces for tests. Add meaningful regression controls for invalid phone, normalized persistence, existing-family preservation, unsubscribed emails, topic fallback, deck reuse, consent changes, and no contact data in analytics/URLs.
- Run focused tests during implementation. At the end run exactly the required gate: `npm test && npx eslint src && npm run build`. Capture output and counts. Do not silently replace a failing full suite with selected passes. Fix relevant failures; report unrelated failures with evidence.
- Do not use Playwright or Puppeteer for browser checks. Root will handle the explicit Aside browser checks after the implementation. No live email or paid call is needed.
- Update the marker above to FAST_RESULTS_CALL_BUILD_DONE when implementation and checks end. Write `.design/experiments/r681/build-result.md` with files changed, commands, results, risks, and missing browser evidence. Leave source uncommitted for root's review and PR.
- Use ASD-STE100 Simplified Technical English for user-visible reports. No em-dashes.
