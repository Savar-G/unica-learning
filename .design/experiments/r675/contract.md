# Parent problem explanation

Route: `/design direct`. Job: new. Surface: component and product. Constraint: existing system.

A parent can request short steps for a wrong answer on the existing Page results screen, after every item on the page has finished its check. The explanation stays beside that question. The stored answer stays separate and authoritative. The child has no control on the Desk.

The implementation uses `ScanMarkingResults`, `ScanMarkChange`, `.scan-link`, `.scan-mark-review`, `--card`, `--line`, `--ink`, and `--ink-2`. It adds no visual system. The button has a minimum height of 44 pixels. Its status and result have associated IDs. Loading has an accessible status. Retry and cap have an alert. Output is text only.

D-299 records the approved behavior. D236 and D249 still restrict release. This task does not enable a family switch. Root owns browser evidence and the independent review.

## State matrix

| State | Parent view | Request behavior | Evidence |
|---|---|---|---|
| Complete page; wrong and readable | Explain this problem beside the question | Explicit POST with item and mark version | Component and route tests |
| Right or blank | No explanation control | Server refuses direct stale requests | Component and SQL tests |
| Selected item pending, unscored, invalid, unsupported, missing key | No output; unavailable when requested | No AI dispatch | Core and SQL tests |
| Another page item pending, missing or awaiting a parent check | No explanation control or cached output | Server refuses each direct context, admission, save and read | Component and SQL phase tests |
| Literal less-than or greater-than key | Original key and plain comparison steps | Stored answer is unchanged; no HTML rendering | Public generated-package and SQL tests |
| Loading | Preparing the explanation; disabled button | One request; no automatic retry | Component test |
| Concurrent press | Plain pending message; explicit retry | One durable claim | Core and two-connection SQL tests |
| Ready | Stored correct answer, short steps, Say to your child | First successful version is cached | Core and SQL integration test |
| Repeat | Same explanation | Zero new dispatches | Core and SQL integration test |
| AI off or failure | Plain retry message | No successful cache | Fake AI tests |
| Limit | Plain retry message | Global budget refuses dispatch | Two-family SQL test |
| Changed mark, reading, package, print, child or account | Old output cannot enter the new context | Current checks at claim, admission, save and read | Core, component and SQL tests |
| Deleted family or child | No private result | Fences and cascades; anonymous charge remains | SQL test |
| Expired photo | Mark remains an identity reference | No photo is sent to AI | Existing result contract and SQL identity path |

## Remaining evidence

No screenshot was made. Root must inspect desktop, tablet and phone states in the existing inert Admin preview. Root must check keyboard use, focus, zoom and long text. Root must verify the hosted RPC and a few bounded provider calls after price verification. These tasks remain outside this implementation.
