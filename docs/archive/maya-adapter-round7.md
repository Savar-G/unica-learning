# Maya adapter round 7 self-review

Each cell has two tests in `src/lib/maya-text-matrix.test.ts`.
The test name is `input matrix > STATE / INPUT / resume=false` or `resume=true`.
Every case also saves at input receipt and continues that receipt independently.

Each cell gives the controller state after the input. A slash separates live use from resume only when their states differ. The text after a semicolon gives the output policy. The original pending promise can own output in a live case. Resume returns that output from the new input.

| Input | idle | model pending | review pending | output buffered | partially delivered | terminal pending |
|---|---|---|---|---|---|---|
| start | OPEN; no new output | CHECK; keep answer | REDIRECT; review saved candidate | OPEN; retain opening | MODEL_EXAMPLE; keep remaining approvals | CLOSE child_stopped; deliver retained close |
| child | CHECK; accept 66 | CHECK; supersede request; accept 66 | CHECK; supersede candidate; accept 66 | CHECK; opening before answer | CHECK; accept 66 | CLOSE child_stopped; retain stop; close |
| partial | OPEN; silent | ASSESS; cancel request; silent | ASSESS; cancel candidate; silent | OPEN; hold opening; silent | MODEL_EXAMPLE; revoke remaining approvals; silent | ASSESS; remove buffered close; live and silent |
| approved speech | OPEN; consume approval | ASSESS; consume approval; preserve request | ASSESS; consume approval; preserve candidate | OPEN; no delivered approval exists; opening policy | MODEL_EXAMPLE; consume remaining approval | CLOSE child_stopped; consume approval; retain close |
| other speech | OPEN; OPEN ignores report | CHECK; repair before answer; preserve request | TRY_TARGET; repair before teaching; preserve request | OPEN; OPEN ignores repair; retain opening | MODEL_EXAMPLE; repair before teaching | CLOSE child_stopped; retain stop; close |
| content | CLOSE content_issue; content close | CLOSE content_issue; content close | CLOSE content_issue; content close | CLOSE content_issue; content close | CLOSE content_issue; content close | CLOSE content_issue; content close |
| tick | OPEN; no new output | CHECK; defer clock behind answer | REDIRECT; defer clock behind review | OPEN; deliver retained opening | MODEL_EXAMPLE; no new output | CLOSE child_stopped; deliver retained close |
| writing started | OPEN; no new output | WAIT_WRITE; defer; writing pause after answer | REDIRECT; defer behind review | OPEN; deliver retained opening | WAIT_WRITE; writing pause | CLOSE child_stopped; deliver retained close |
| writing done | OPEN; no new output | CHECK; defer; record answer writing | REDIRECT; defer behind review | OPEN; deliver retained opening | MODEL_EXAMPLE; record writing | CLOSE child_stopped; deliver retained close |
| technical | CLOSE technical_issue; technical close | CLOSE technical_issue; technical close | CLOSE technical_issue; technical close | CLOSE technical_issue; technical close | CLOSE technical_issue; technical close | CLOSE technical_issue; technical close |
| finish technical | CLOSE technical_issue; technical close; return trace | CLOSE technical_issue; technical close; return trace | CLOSE technical_issue; technical close; return trace | CLOSE technical_issue; technical close; return trace | CLOSE technical_issue; technical close; return trace | CLOSE technical_issue; technical close; return trace |
| finish stopped | CLOSE child_stopped; child-stopped close; return trace | CLOSE child_stopped; child-stopped close; return trace | CLOSE child_stopped; child-stopped close; return trace | CLOSE child_stopped; child-stopped close; return trace | CLOSE child_stopped; child-stopped close; return trace | CLOSE child_stopped; child-stopped close; return trace |

The matrix proves local input receipt, cancellation rules, controller state, JSON continuation, and valid traces. It does not prove physical speech completion. The buffered-opening fixture has no delivered utterance to approve. Its approved-speech row therefore tests a report with no active approval. The model-pending and review-pending rows test real approved utterances.

Additional adversarial checks:

- `maya-text-round7.test.ts` covers all seven findings, the history limit, board restoration, and stale request ids after checkpoints.
- `maya-text-log.test.ts` runs 2,000 seeds through eight original schedules and five added schedules. The added schedules continue after received responses, buffered openings, pending terminal output, and approved reports. The oracle rejects service by an earlier check-in.
- The oracle derives child duties from supplied inputs. Each child duty requires its own later response. Partial-drop checks require a partial after that input. Priority-drop checks require a later supplied priority event.
- Trace versions 1 to 6 remain tested. Older saved records remain readable. V3b is a text-only content/safety boundary. C30 checks the concern alert through the saved call.
