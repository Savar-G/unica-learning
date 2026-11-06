# Maya chat review repairs

Root repaired the three independent findings from review of 4c422bf9 against cfab8191. This report records local evidence, not a practice or release approval.

- R1-1: written-digit claims recognize the passive word `written`. The existing column-role check validates its digit. Unreadable claims still require clarification.
- R1-2: the step sentence check permits exact fraction forms from the trusted operation and its checked step. Operand parsing applies only to these code-written texts. The child-turn parser, false-equation check, exact claimed-step check and commitment rules stay in force.
- R1-3: recovered messages retain the ownership check. If their book is no longer shipped, the call ends at the recovered revision without replaying the child message. The terminal revision releases the pending admission. A conflicting end still refuses.

Public regression cases failed before the repair: 7 failed, 23 passed. After the repair, the three regression files and controller-fixes tests passed 260 cases, including two additional hostile fraction controls. These counts are separate runs, not additive.

Recovery proof uses a real public runChat call with local storage and an HTTP database seam. It models the recovery RPC revision increment. It does not prove hosted concurrency. Controller proof uses public createSession and step calls with fake proposals. No provider call is involved.

The full check run on pre-repair 4c422bf9 was stopped after the review returned CHANGES. That interrupted run is not a pass. Focused changed-code lint passes. The normal TypeScript check found one missing union narrowing in the copied recovery fixture; root added the explicit fixture guard. A complete check run and independent re-review remain required on the repaired candidate. Paid practice remains required before merge. Paid practice used: 0 of 2 authorized runs. No judge threshold, model configuration, required case, repetition, privacy route, print source or family switch changed.

IMPLEMENT_DONE_MAYA_CHAT_R1_REPAIRS

## Current-main integration

Main PR686 at 8491309d merged without a source conflict. The repaired session and chat recovery source stayed byte-identical to de2226c7. The integration check found two fixture mismatches: the held-question desk test needed the new confirmed delivery receipt, and the awaiting-delivery page test needed the page-and-question input label. Both fixtures retain the delivery refusal, no-package-read, no-image-signing, Leave, and eligible-chat assertions.

The combined integration check passed 295 tests across 6 files. The initial standalone type check used stale route declarations for PR686's new answer page. `next typegen` regenerated those declarations. No product type or runtime assertion was relaxed. The fresh TypeScript check and changed-file lint are recorded separately by root.

The full check run that began before root read the integration failure was stopped. It is not counted as passed. Root starts a new complete run only after the combined focused gate succeeds.

## R2 writing-claim repair

The second independent review resolved fraction and withdrawn-book recovery findings. It found one remaining P1 in writing claims: pause punctuation or a question mark could discard the recognized claim before its digit was checked.

Root added six unsafe public cases and two correct pause controls. Before the repair: 6 failed and 8 passed. The parser now recognizes a leading ellipsis as a pause after a writing verb or its existing filler words. A recognized verb always yields a claim, including an empty or unreadable value. A missing numeric value remains unclear. The existing digit-role and carry checks then apply without change.

After the repair, 303 tests passed across six files, including the earlier fraction, recovery, desk and delivery cases. The earlier complete check on e9407f90 was stopped after CHANGES and is not counted as a pass. Root will run the final complete gate after scoped approval of this repair. No paid practice ran.

## R3 carry-relation repair

R3 found that a second ellipsis discarded a named carry source or destination. The controller could award the ones step even when the child named an invalid outgoing carry from the tens column. Root added ten unsafe controls and two correct controls. Before the repair, 10 failed and 16 passed in the writing-claim file.

The claim reader now keeps ellipses as spaces throughout the claim, preserves named relations after punctuation as unclear rather than inferring a column, and treats digit-to-digit repeated dots as an unclear value. Public controls also cover ten common punctuation forms at three places in a carry source.

The first 51-file regression found two compatibility regressions: the ESL request "where put?" was read as a completed claim, and "the 1 I carried" lost the incoming digit. Neither expectation or fixture was changed. Root excludes only the empty position question from completed claims and reads the backward carry reference through the same numeric and role checks. A new control refuses an incoming reference of 2 where the checked carry is 1.

Final direct behavior check: 618 tests passed in eight files. The complete 51-file Maya regression then passed 4,125 tests, with zero failures and zero skips. The machine-filtered count is in root's saved r3-regression51-final.log. Type and lint results are recorded separately. These are local fake-model checks, not paid practice or live-family proof.

The planned review limit extends from three to five only for this evidenced progress-state blocker. The public failures award unchecked Session.done progress; maya-text.saved serializes this session in its durable call state. This is the sol-loop state-integrity exception. R4 remains scoped to the changed claim reader and open finding. Budget end is not approval. Paid practice remains 0 of 2.

## R4 carry-source and reference repairs

R4-1: a relation prefix after sentence punctuation now keeps the claim unclear even when another separator interrupts its column. The reader cannot discard `from, the tens` and infer the ones column. R4-2: a backward carry reference must contain the complete numeric form. The preceding words `the ones and I` cannot replace the explicit number after `carried`. Empty or unreadable claims still require clarification.

Before these repairs, 17 new public controls failed and 58 passed. After the repairs, all 75 passed. A later persistence test also passed, giving 76 final claim tests. It uses the public text adapter, a fake model and a JSON save/restore round trip. The wrong carry source receives no live, saved or restored ones credit. It does not test hosted storage.

The 51-file regression passed 4,143 tests with zero failures and zero skips. Product source stayed fixed during this run. The claim test file gained the persistence test during the run; its final 76-case check ran separately after that edit. Do not add these overlapping counts. The final TypeScript and changed-code lint checks passed. No old expectation was weakened. No current full-repository gate, live provider or practice pass is claimed.

The customer comment batch remains active. No full Chromium run, paid call, browser check, hosted write, push, merge, family switch or print change ran. Paid practice remains 0 of 2. The final scoped review is round five of the existing five-round state-integrity budget. Budget end is not approval. If it still finds a blocker, stop the review loop and report it to Savar.

## Repair prepared after round five

R5 resolved R4-1. It kept R4-2 open because the numeric capture included the optional word `that` in correct references such as `the 1 that I carried`. The root agrees with this P2 finding. The complete numeric check must remain: removing it would restore the earlier nonnumeric-clause defect.

The prepared repair changes one regex quantifier to prefer the shorter capture, leaving `that` for the existing optional relative-word group. Four public cases cover correct one and wrong two with `that I` and `that we`. Before the repair, two failed and 78 passed. After the repair, 430 focused tests passed in four files. Normal TypeScript and changed-file lint passed. These local checks do not replace independent review or API practice.

The five-round review budget is complete. No sixth review has started. Root requests one additional scoped Sol review of this prepared repair. Until authorization and approval, Maya remains unmerged and paid practice remains unused at 0 of 2. The marking work continues separately. The reviewer report's active customer hold is stale: the generator released the non-print hold at 2026-11-06T23:19:50Z. Feedback687 retains the next coordinated merge position. Print approval remains held.
