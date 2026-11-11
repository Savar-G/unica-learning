# First pages of Workbook 1

After a BC parent without a saved card finishes the report, the site can make four real pages of the child's Workbook 1 and show them on the report: the cover with the child's name, the first lesson page with its worked example, and the two practice pages that follow it on the same topic. When all four pages pass every check, one sample email can go to the parent with the four-page PDF and the action "Start your plan today". Both switches are off until Savar approves a complete test example.

## Promises

- The four pages are exact pages of the child's Workbook 1. The later Workbook 1 run reuses them (questions, answer keys, page content and QR codes) and writes only the missing pages.
- Only these pages are written. The plan and its capacity check cover the whole book (code only, no AI), so the pages are the ones the whole book would have. The AI and the solve check run for three day pages only. The cover has no AI content.
- The report and its email never wait for the pages. A failure, a refusal or a page that does not pass leaves the report as it was. The report shows the pages only when all four are ready.
- No page shows unless every question is checked by code, every day page fits, and the strict render passes.
- Nothing here approves, ships or delivers a workbook, or starts a plan. The free month still starts only when an admin presses "Workbook delivered: start plan".

## Switches

| Variable | Off (default) | On (`on`) |
|---|---|---|
| `FIRST_PAGES_ENABLED` | The report job queues nothing. An admin can still queue one test from the admin test page. | The report job queues the first pages of each new eligible test. |
| `FIRST_PAGES_EMAIL_ENABLED` | No sample email goes. | The `/api/reminders` run sends the sample email for each ready set that passes the checks before the send. |

`WORKBOOK_RUNNER` decides where the pages are made, as for workbooks: `mac` (default) queues them for the workbook worker; `server` makes them on Vercel with the API.

## Eligibility

A test qualifies when all of these hold, read by the database when the job is queued:

- The test is finished, its report offers the plan (BC), and it finished in the last 48 hours. Older tests are never queued, so nothing is back-filled.
- The child has no stored workbook and no workbook run: this would be Workbook 1.
- No child of the family has a saved card (`card_setups.card_saved_at`). Before the email, the saved-card module also asks Stripe.
- The family is not being deleted.

## Flow

1. Queue: `queue_first_pages` adds one row per test (`public.workbook_first_pages`) with a reserved Workbook 1 id. Queuing twice changes nothing.
2. Plan: the job claims the row under a lease, reads the child as the workbook job does, plans Workbook 1 with the real placement and planner, runs the capacity check with the reserved id, and stores the plan (the frame) once.
3. Pick: `firstPagesOf` takes the book's first lesson page and the two pages after it on the same day and topic. Without such pages the set is "unavailable" and nothing is written.
4. Write: `generateWorkbookPages` writes only those three day pages, with the same AI, solve check, fit check and per-slot attempt limit as a whole book. Each AI call, solve check and finished page is stored under the lease, so a retry pays for nothing twice.
5. Check and render: every question must be checked and every page must fit. The strict renderer prints the cover and the three pages, with the whole book's How + Plan page as context for the cover. The PDF and page images go to the private bucket at `<parent>/<workbook id>/`.
6. Ready: the row stores the pages, the files and the counts (AI calls, solve checks, pages, measured cost when the provider gives one).
7. Report: the owned report shows a row "{child}'s first pages" before the next step, with the four page images (signed by the server after the ownership check) and "Start your plan today", which goes to the plan choice and the card step.
8. Email: the `/api/reminders` run sends one email per set (email log kind `first_pages`), with the PDF attached. Right before the claim it checks again: the switch, the set is still ready and not replaced, the parent has not unsubscribed, and no card is saved (stored copy and Stripe). Any "no" stops it.
9. Workbook 1: the run's first job call finds the ready set. When the new plan makes the same pages (the same page outline and cover), the run takes the reserved id, copies the pages in, keeps the cover's QR code, and the whole-book check never changes those pages. When it does not (the profile, the admin's instructions or the code changed), the run stops before any AI call and the admin chooses on the child page: "Use the sample's plan" or "Make it without the sample pages". The second hides the pages on the report.

## Limits

- The final book renders the pages again with the template of its own code. A template change between the sample and the print can move ink on the page; the questions, keys and content stay the same, and the fit check runs again.
- The first pages pay for three AI-written day pages and their solve checks. See the cost note in the pull request for the estimate.
