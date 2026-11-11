# Fast results call build result

## State

Implementation is complete in this Mac worktree on `site/phone-results-call`, based on `3b1e1290db8e7838297fa0513db5a642d3b18f62`. Changes are uncommitted. No email, call, deployment, push, PR, merge, or real parent data access was made.

## Files changed

- Signup and phone: `src/components/account.tsx`, `src/lib/account.ts`, `src/lib/account-server.ts`, `src/app/api/account/finish/route.ts`, `src/lib/phone-number.ts`, `package.json`, `package-lock.json`.
- Admin and privacy: `src/lib/admin-store.ts`, `src/app/(product)/admin/parents/[id]/page.tsx`, `src/app/(site)/privacy/page.tsx`, `src/app/sitemap.ts`.
- Report and delivery: `src/lib/report-email.ts`, `src/lib/report-job.ts`, `src/lib/report-job-store.ts`, `src/lib/report-job-memory.ts`, `src/lib/report-row-ledger-memory.ts`, `src/lib/email-brand.ts`, `src/lib/email-delivery.ts`, `src/lib/email-resend.ts`, `src/lib/contact.ts`.
- Calendar: `src/components/report.tsx`, `src/components/report-next.tsx`, `src/components/report.css`.
- Tests: `src/lib/phone-number.test.ts`, `src/lib/account-finish.test.ts`, `src/components/account-province.test.ts`, `src/components/results-call.test.ts`, `src/lib/report-email.test.ts`, `src/lib/report-job.test.ts`, `src/app/(site)/chat-wording.test.ts`, `src/app/(product)/account/(dashboard)/report/[id]/page.test.ts`, and its three report golden HTML files.
- Evidence: this file and the marker in `build-brief.md`.

Root owns the existing changes to the design contract, migration, SQL test, and generated database files. This build did not edit those files.

## Checks

- `npm ci` and `npm install libphonenumber-js`: completed. The install reported 19 dependency audit findings: 16 moderate, one high, and two critical. `npm ci` reported the same counts before the new dependency.
- Focused tests: 141 passed across six files before the last controls. The later focused run passed 51 tests across three files. The signup tests use fake Auth and database interfaces. The email tests use in-memory delivery and report stores. They do not send email.
- Report golden update: 28 tests passed across two files. The three golden changes contain only the results-call section.
- Final `npm test && npx eslint src && npm run build`: passed. Vitest reported 649 files passed, 20,593 tests passed, and one skipped. ESLint passed. Next.js compiled, type-checked, and generated 141 static pages. Full output: `/tmp/r681-final-gate.log`.
- `git diff --check`: passed.

The tests cover invalid and normalized phone input, existing-family preservation, the unsubscribed report, topic fallback, the deck-based alert, phone removal from the locally retained email copy, consent changes, and removal of booking query data. The analytics test checks the signup event arguments and request URL. It does not prove behavior in a live analytics provider.

## Limits and risks

- Root will perform the Aside browser checks. The test browser does not load external frames. It reports that iframe loading is disabled, while the consent test passes. Calendly rendering, responsive layout, failure state, and its own cookie controls remain unverified in a real browser.
- The migration and hosted deletion probes are reported in the build brief. This implementation did not re-run them or access live data. The local deletion path uses a de-identified assessment copy; the phone is stored on the parent row. The local alert copy removes the number. A delivered team email necessarily contains the number, and this task did not verify retention or deletion in the team's mailbox or email provider.
- The full gate does not prove hosted email delivery, database behavior, or a real results call.
