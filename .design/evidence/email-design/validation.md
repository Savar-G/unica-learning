# Email design A validation

Source: branch `site/email-design`, implementation commit `5d70b49`, based on `eff9d09`, with the later preheader correction recorded in the independent review.

## Results

- `npm test`: 97 test files, 5,369 tests passed.
- `npx eslint src`: no errors. One existing unused `CSSProperties` warning in `src/ds/blocks.tsx:3`.
- `npm run build`: passed, including TypeScript and all page builds.
- `node scripts/render-emails.mjs /tmp/unica-email-design-preview`: generated 12 sample emails from the real functions. No email was sent.
- Browser: 24 checks, all 12 samples at 375 and 1440 px, all passed. No horizontal overflow. Every sample has the wordmark and team signature. Unsubscribe links match the expected policy. All links accept focus.
- Long name: the start reminder with `Alexandria-Marguerite` fits at 375 px.
- Visual inspection: reminder, BC report, sign-in link, and confirmation screenshots. The footer and signature follow A. The report keeps its existing colour band and result content.

## What each check proves

- Reminders: public-interface tests preserve all four message types, deadlines, escaped names, action URLs, and unsubscribe links. The tests do not send through a provider.
- Report: public-interface tests preserve result text, comparisons, links, and the offer/quiet policy. Both variants carry the signature. The tests do not establish hosted report job delivery.
- Sign-in: public-interface tests preserve the token rules, link URL, and expiry text. The tests do not exercise a hosted token exchange.
- Hosted Auth: tests require code-only confirmation and magic link, literal reset token fields, direct support contact, and generated-file equality. They do not exercise Go template substitution or install the templates.
- Delivery: the full suite passed through the existing mocked delivery and ledger tests. This change does not alter the sending code or internal alerts. No live-provider claim follows from those tests.
- Browser: generated HTML fits the tested widths and its links can receive focus. This is browser output, not Gmail, Apple Mail, or Outlook evidence. Auth screenshots use sample replacements for the code and reset fields.

## Browser tool limits

The development server ran with `npm run dev -- --port 3017`. The collaborative browser opened the real generated start reminder successfully. Later calls returned `Preview automation snapshot timed out after 15000ms` and `Preview automation evaluate timed out after 15000ms`. The remaining checks used the T3 headless HTML renderer with the generated output.

## Independent review

Read-only review found no blockers. See `.design/reviews/email-design-2026-10-17.md`. The reviewer reported 112 passing focused tests and separate parent/internal message comparisons. The parent fixed its one preheader wording note and reran the required checks.

## Hosted follow-up

The three files in `supabase/templates/` are prepared, not installed. A site merge does not install Auth templates. Follow `docs/assessment-signup.md` after PR approval. Confirm saved templates and use controlled QA inboxes for code and reset checks. No hosted settings or customer mail changed in this task.
