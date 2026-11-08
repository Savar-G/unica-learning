# First-book marking formats

This change covers tick-and-number, circle, show-work final answers, spot-the-error, two-ways parent review, write-words, fractions and decimals. D-293 records the first-shipment decisions. It changes no printed package, page layout, family release switch, marking model or shared monthly budget.

## Contracts

- Read one whole normalized page. Send local aliases, measured regions and choice labels. Do not send a separate answer key or family identifier.
- Keep one canonical original per printed item. A definite wrong region can make an item wrong. Partial or ambiguous evidence cannot make it right or blank.
- A parent checks both methods and the final answer for two-ways. Automatic-only frozen eligibility does not authorize parent mastery.
- Literal checked text matches can be right. Other text forms stay pending for a parent. A literal mismatch cannot prove that a written time or other expression is wrong.
- Fraction and decimal checks preserve the original text. Exact rational comparison uses the stored operation, accepted forms and required simplification. Decimal conversion cannot round a different written value to the key.
- Mixed-number readings with a signed denominator stay pending. Ordinary signed fractions and a clear zero denominator use their separate rules.
- Crops, canonical versions, parent changes, retention, event publication and cost admission use the existing S4/S5 paths.

## Local proof

The public-interface tests in scan-marking.test.ts cover all result states, malformed and duplicate readings, exact precision, mixed formats, immediate concurrent devices, parent changes, retakes and request contents. The final mixed-sign repair has four fail-first reader/worker cases. All four now remain pending with no event. Its core run passed 188 tests in three files. TypeScript and focused lint passed.

The local production-SQL tests passed 48 S4 cases. The S5 policy run passed 37 cases. The scalar retention run passed 39 cases, overlapping the base 36 S5 cases. These counts are separate runs, not independent totals. One initial S4 rerun found test prices left enabled by the earlier fixture. Resetting that owned local ledger to its documented initial state restored all 48 checks. No assertion changed.

The full suite, source lint and production build passed at integration pin 821882ab7fdaf4d0c32196424e57f7142e4ffeee before the final mixed-sign repair: 457 files, 16,954 tests passed and one skipped. The repair requires current-head full checks and a scoped independent recheck before merge. Their final pins and results belong in the PR.

## Hosted policy proof

The additive scan_two_ways_review_policy migration is applied as version 20261106193345. Its source file is 20261106192851_scan_two_ways_review_policy.sql. It corrects existing expected review policy, advances affected marking revisions and prevents old writers from restoring automatic mastery. It preserves observations, printed content, raw events and append-only history.

The service-role rollback probe in supabase/tests/scan_two_ways_policy_hosted.sql returned SCAN_TWO_WAYS_POLICY_HOSTED_OK. It checked the old-writer path, parent choices after expiry, retained history, excluded event intent and child-deletion refusal. Its synthetic rows rolled back. The final probe found zero canonical items and zero enabled marking prices. Security advisor counts were unchanged. Normal database type generation ran; this trigger adds no public RPC signature. The integrated S8 generated declarations remain intact.

## Approval sample coverage

The no-store U16 approval sample came from source 99f0e00ec714391859d31b5b90ce4ae3b52bb126. Its PDF SHA-256 is ce341c9620cacd697a20ed5d911b9623f51bb9133d7c4959dd6ecef652985e25. Its saved census contains 578 questions on 84 pages: 389 write-number, 80 circle, 60 show-work, 19 spot-the-error, 16 tick-and-number, seven two-ways and seven write-words.

The full saved-package probe has 571 code-reading paths and seven parent-review paths, with no unsupported package. It uses synthetic measured boxes. It does not prove real crop geometry or recognition. The fraction on page 21 and decimal on page 62 are covered by the authorized scalar extensions.

## Release limits

There is no final customer printed revision yet. Recount after the approved customer Prepare run. Human sample approval, the D-267 fixed whole-page recognition test, screen approval and the physical iPhone/Android booklet test remain separate launch evidence. The team reads marked pages daily during book 1. Provider privacy work stays visible on #542 as deferred by Savar. No paid call or family activation is part of this implementation proof.
