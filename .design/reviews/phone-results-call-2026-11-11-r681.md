# Fast results call review, 2026-11-11

Code review independence: two fresh Codex Personal gpt-6.1-sol high reviewers, then a third independent settlement review. Initial candidate: `91d32cbe8d6b485c34cb1794c2b709e097ffbf98`, base `3b1e1290db8e7838297fa0513db5a642d3b18f62`.

## Standards

No concrete P1 or P2 defect found. Source review covered phone normalization and persistence, service-only writes, unchanged existing-family behavior, deletion, saved-copy removal, report email claim/retry rules, unsubscribe behavior, and consent loading. No tests or hosted checks ran in this review.

## Specification and settlement

Two P2 findings were accepted after the third reviewer checked the objections against the code.

1. A clear developing finding, 4/6 correct, produced a neutral opening because the code required needs-attention. Assessment certainty permits that developing result. The fix includes clear non-secure topics.
2. The parent name `Priya\nPhone: +12125550123\nShah` made the code parse a false phone line before the stored phone. The actual phone stayed in the saved alert text and HTML. The fix passes the stored phone directly to the saved-copy removal function. This was a retained-copy failure while the family exists, not evidence of survival after cascade deletion.

Both public-interface regression cases failed before their fixes. The ordinary cases passed. After the fixes, all 89 report-email and report-job tests passed. The tests use memory seams and send no email. Logs: `/tmp/r681-regressions-red.log` and `/tmp/r681-regressions-green.log`.

## Visual review

Independence: self-review. Evidence: the approved r681 prototype, actual signup validation, and the owned-test-family Aside report screenshots at desktop and 390 pixels. No observed visual blocker. No booking was made.

| Dimension | Score | Product weight | Evidence |
|---|---:|---:|---|
| Task fit | 8 | 20 | Phone remains in signup; calendar stays in the approved report section. |
| Content and hierarchy | 8 | 15 | Topic and booking button lead the email; report order is preserved. |
| System coherence | 8 | 15 | Existing field, card, footer, and consent components are used. |
| Interaction and states | 7 | 15 | Acceptance and withdrawal passed; the fallback stays visible. Live provider failure was not induced. |
| Accessibility and responsive behavior | 7 | 15 | Native labeled input; first-invalid focus observed; no 390-pixel page overflow. Full keyboard and zoom audits remain outside this check. |
| Visual expression | 7 | 5 | Existing Unica styles are preserved. |
| Craft | 7 | 10 | The live calendar has its own scroll area on a phone. |
| Evidence and fidelity | 8 | 5 | Approved mockup and actual rendered report evidence are available. |

Weighted visual score: 75.5/100. The weakest limits are live failure coverage and a full keyboard/zoom audit. The calendar uses its own cookie settings after site consent and sends no report referrer or family prefill data.

## Gate

The earlier full gate passed before the last privacy and sitemap corrections. The obsolete gate on `91d32cbe` was cancelled after the review findings were settled. Do not treat that interrupted run as a pass.

Recommendation: complete the final full gate and the corrected-head review before opening the PR. Hosted email delivery, mailbox retention, and email-provider deletion remain unverified. No merge is authorized.

## Type correction after recheck

The independent recheck accepted both functional fixes but found TS2367: StruggleFinding already excludes secure status. The redundant status comparison was removed. `npx tsc --noEmit` failed before this one-line correction and passed after it. No other supported P1/P2 finding was reported. The obsolete full gate on e2766243 was stopped before this correction. A new final gate will check the corrected candidate.

## Final verification

Source candidate `4285ebf3268ca82f5aae5551e0f7b47b98bd10d7` passed the final Sol high source recheck and the Mac gate: `npm test && npx eslint src && npm run build`. Results: 649 test files passed, 20,595 tests passed, one skipped; lint and build passed. The worktree stayed clean during the checks. The final gate worker did not save the requested full log and discarded build stdout through a redirection error. The root checked the T3 command record and the completed build artifact. No gate was repeated solely to recreate this log.

The Happy DOM iframe loading warning is a test-environment limitation. The actual Calendly frame was checked in Aside on the owned test family. No live email was sent. Hosted delivery, mailbox retention, and provider deletion remain unverified.

All settled source findings are resolved. The recommendation is to open the PR for Savar's review. Do not merge automatically. Later evidence-only commits do not change the checked production source.
