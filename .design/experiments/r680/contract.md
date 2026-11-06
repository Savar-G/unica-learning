# Parent Feedback #680

Route: direct. Job: new. Surface: product. Constraint: existing system.

The parent can open `/account/feedback` at every stage. No child or workbook is required. The dashboard release switch does not limit this page. The existing account layout and Desk guard protect restored tabs. The proxy and POST route refuse an open Desk. Family deletion blocks new messages.

Use the account `.acct-form`, `.fld`, `.err` and `.btn` styles inside SupportPage. Keep two fields: Product and Your feedback. Keep one Send action. Use the existing sidebar on desktop. On phones, keep Feedback in the top bar and preserve the stage tabs below it or in the bottom bar. Preserve the selected child. Legacy parent SupportPage footers also link to Feedback. The Desk has no Feedback link.

The plain form starts with "Choose a product" and requires an explicit choice. Products: Workbook, Parent dashboard, Marking, Maya (AI Teaching Assistant), Something else. A known `product` query value can preselect the dropdown. A plain URL works. The form keeps text after failures. It reports empty text, more than 5,000 characters and a missing product without truncation. Each field refusal uses the existing red error token beside its field and retains an accessible alert. It disables controls during a request. It focuses the associated result. Success says: "Thank you. Your feedback is saved."

The admin list uses AdminFrame, the existing GET filter pattern, the shared table, newest-first pages and a family link. Render saved messages as text. A page holds up to 50 messages and shows paging controls when needed.

## Screens for root

Use the authenticated `/admin/dashboard` sandbox with `view=feedback`. Choose `size=desktop` or `size=phone`. Use `scenario=form`, `sent`, `empty`, `too_long`, `no_product`, `unavailable` or `admin_rows`. The real reusable FeedbackFormView and AdminFeedbackList render these states. Controls remain read-only in the sandbox. `family=none` shows the form without children. Stage scenarios are `stage_no_test`, `stage_test_running`, `stage_report_ready_bc`, `stage_report_ready_waitlist`, `stage_first_book_coming`, `stage_active`, `stage_ended`.

The sandbox's Admin list sample uses the actual AdminFrame and AdminFeedbackList. The actual `/admin/feedback` page adds requireAdmin and reads through the admin's session.

## Evidence limits

Implementation tests cover local state and service seams. Local PostgreSQL tests run the production migration and existing fence bodies on synthetic base tables. Root owns screenshots, hosted migration, official generated types, independent review and final acceptance. No rendered or hosted evidence is claimed here. D296 and the AGENTS table note remain root-owned.
