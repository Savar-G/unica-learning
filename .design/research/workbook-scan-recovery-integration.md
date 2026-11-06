# Workbook scan recovery integration

Computer: `Savars-MacBook-Pro-5.local`.

Branch: `site/workbook-scan-receipts-475`.

Base: `597c04c1ebc0a6d5a160bef7ee7fba2da1ad1ac8`.

The bounded recovery turn selects unseeded deliveries and due stored calendars. It checks each selector's bound and identity set. It reconciles at most two batches of 100 books. It then recovers a bounded set of stored calendar requests. The execution clock controls the request budget. The database controls admission time. A caller must also abort its service requests at the deadline.

A confirmed delivery or correction schedules a short `after` callback. It rechecks the confirmed book and attempts one current global calendar request. It does not promise that this book is first in that queue. The SQL delivery hook already holds its durable request. Callback failure does not change a committed delivery response. The callback sends no email and queues no workbook.

The falsifiers were an unauthorized or refused request starting recovery, browser calendar values entering the trusted calculation, a failed callback changing the saved delivery result, malformed selectors producing a partial success, or a new batch starting after the execution deadline.

Validation: six focused suites passed, 66 tests. Scoped ESLint passed. A scoped TypeScript program, including the generated Next route declarations and all scan progress, clock and recovery modules, returned zero diagnostics. Whitespace checks passed.

Proof: local public-interface and route checks only. The callback tests capture and then run `after`; they do not prove hosted post-response execution. Selector SQL, scheduled integration, reminder episodes, hosted recovery, UI, the full gate and final independent review remain open. No printed source, customer draft, model call, email, family flag, push or PR changed.

HANDOFF_INTEGRATION_IN_PROGRESS

## Parent progress HTTP read

The parent read at `/api/account/scans/progress` uses the live scan session and its existing release gate. The session selects the parent. The request supplies only the selected child and workbook IDs. The scoped store checks the family, child, shipped book and printed revision. The route repeats the session check after the read.

The response holds frozen printed page numbers, accepted scans, gaps, separate marking status, delivery clock status and a minimal persisted trigger status. It returns no raw receipts, photo IDs, audit IDs, answer text, child name or costs. The automatic marking release gate remains separate. When marking is off, accepted progress remains available and review status remains unknown. A missing stored calendar does not become an invented deadline. A current readiness calculation does not become a saved claim.

The reader now includes its frozen page-ID to printed-number map for this explicit projection. No stored page or printed content changes.

Falsifiers: a browser parent or time changing scope or admission, another family's book succeeding, an ended session returning progress, marking completion establishing acceptance, raw private records reaching the response, or a calculated deadline replacing the stored calendar.

Validation: the 15 HTTP cases run through the real pure progress and history readers with memory stores. Together with the two reader suites, all 84 tests passed. Scoped ESLint and TypeScript passed with zero diagnostics. These are local source and synthetic HTTP checks. They do not prove hosted session behavior, UI appearance, reminder dispatch or release. The final combined independent review remains open.
