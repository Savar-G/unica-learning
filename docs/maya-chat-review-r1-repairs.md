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
