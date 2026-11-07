# Reduced parent marks #565

Route: `/design direct`. Job: `improve`. Surface: `product` and `component`. Constraint: `existing-system`.

Base: actual #693 main merge `d4af3d62d5fba25ba3b39441d9cc719b2bf06604`. Scope: the owner's first-customer comment on issue #565, dated 2026-11-06. The implementation brief holds the frozen task limits.

The Workbooks page keeps its current book, tracking, next-book estimate and delivered answer keys. One white bordered Page history card sits before Answer keys. It uses the existing `pw-card`, semantic text and border tokens, and scan history controls. No new visual system or D-number is needed.

History comes from `ScanHistory`, `readScanHistory` and the existing history endpoint. The selected parent and child define the request context. Only that child's shipped books are accepted. Current and past books have separate workbook/day groups and page labels. Display order puts the newest workbook first. Counts come from the canonical history result. Missing legacy history or a receipt gives no claim that the page was never scanned.

A result link opens the existing `/account/scan/results/<photo>` item review. That review owns the saved reading, right/wrong/blank marks, Change this mark, mark versions and parent change history. Photo expiry keeps those marks and changes. No second correction or explanation implementation is added. #675 explanations remain limited to completed pages under their own rules.

The whole frozen answer key opens after confirmed delivery, with its effective corrected receipt. It requires no marked page. Shipping and estimated arrival cannot open it. The answer-only view stays separate from page history. No workbook PDF, worksheet text, page download, signer or new reader is added.

The Workbooks route checks the existing dashboard, child, scan and marking access rules. Closed scan or marking access produces a plain unavailable state without mounting the history loader. Client history uses the existing five-second visible-page poller. It starts no overlapping request. An authorization refusal ends requests. Account changes and page exit clear private results. A changed child, account, route, filter or cursor cannot receive a late reply from the old context.

The Admin explorer renders `ScanHistoryView` with static data. The existing HTML sanitizer, disabled controls, sandbox and analytics exclusions remain. It mounts no history effects. Its populated, empty, parent-check, pending, failed, expired-photo, missing-photo, loading, error and closed-access states use the actual presentation. Both child selections work on phone and desktop.

Actions have a minimum height of 44 pixels. Repeated result links have workbook/day/page accessible labels. Statuses use text, not color alone. Loading and permission states use status announcements. A failed read uses an alert. Text and controls can wrap within the card. Keyboard focus uses the existing ink token. No animation is added.

References inspected: current `DESIGN.md`; `.design/experiments/r558/workbooks-desktop.png` and `workbooks-phone.png` for card layout only; `.design/experiments/r-parent-workbook-access/answers-phone.png` and `answer-order-repair.md`; `.design/experiments/r675/ready-desktop.png`, `ready-phone.png`, `pending-phone.png` and its contract. The r558 PDF control is obsolete and is not part of this contract.

`state-matrix.md` lists coverage. Fake HTTP and static rendering provide local evidence. Root retains new browser screenshots, device checks, the full gate and independent review. The implementation alone does not prove visual acceptance, hosted ownership or release readiness. All family switches remain off. D-236 and D-249 approval remains pending.

Deferred: the skills line, Since the child started, More/New/Less/Review, skill mistake summaries and monthly summaries. Overview, Maya, SQL, generated database types, AI, print, billing, email and Pause behavior are outside this change.
