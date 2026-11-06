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
