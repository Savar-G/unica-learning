# Maya chat review repairs

Root repaired the three independent findings from review of 4c422bf9 against cfab8191. This report records local evidence, not a practice or release approval.

- R1-1: written-digit claims recognize the passive word `written`. The existing column-role check validates its digit. Unreadable claims still require clarification.
- R1-2: the step sentence check permits exact fraction forms from the trusted operation and its checked step. Operand parsing applies only to these code-written texts. The child-turn parser, false-equation check, exact claimed-step check and commitment rules stay in force.
- R1-3: recovered messages retain the ownership check. If their book is no longer shipped, the call ends at the recovered revision without replaying the child message. The terminal revision releases the pending admission. A conflicting end still refuses.

Public regression cases failed before the repair: 7 failed, 23 passed. After the repair, the three regression files and controller-fixes tests passed 260 cases, including two additional hostile fraction controls. These counts are separate runs, not additive.

Recovery proof uses a real public runChat call with local storage and an HTTP database seam. It models the recovery RPC revision increment. It does not prove hosted concurrency. Controller proof uses public createSession and step calls with fake proposals. No provider call is involved.

The full check run on pre-repair 4c422bf9 was stopped after the review returned CHANGES. That interrupted run is not a pass. Focused changed-code lint passes. The normal TypeScript check found one missing union narrowing in the copied recovery fixture; root added the explicit fixture guard. A complete check run and independent re-review remain required on the repaired candidate. Paid practice remains required before merge. Paid practice used: 0 of 2 authorized runs. No judge threshold, model configuration, required case, repetition, privacy route, print source or family switch changed.

IMPLEMENT_DONE_MAYA_CHAT_R1_REPAIRS
