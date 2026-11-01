# Remaining purchase-information correction

The current report and checkout use `OPEN_CURRICULA = ["BC"]`. Other curricula get a workbook waitlist. The published terms describe that same restriction. The free assessment is open across Canada.

PR #411 states this restriction on the new pricing and assessment pages. This small follow-up applies the same correction to older text in the home page, signup explanation, FAQ and plain-text summaries. It does not change plan eligibility or the planned Canada-wide launch. `DESIGN.md` now distinguishes the current flow from the future launch condition.

Four public-copy assertions failed against the old text. All 12 copy tests passed after the correction. The full suite passed 177 files and 9,096 tests. Source lint passed. Aside rendered the home page at 375, 768 and 1440 px without horizontal overflow. The curriculum FAQ opened with the corrected text. Anonymous GET requests for `/start`, `/llms.txt` and `/pricing.md` returned 200 and included both the BC plan condition and the waitlist option.

The correction uses the S1 evidence from `review.md`. The parent checked these small edits directly. No additional delegate was started. It changes copy and the existing copy contract tests only.

## What remains in S tier

- Review the next complete 28-day Search Console window. Compare equivalent page/query groups before changing more titles or consolidating pages. Current history cannot prove seasonal decline.
- Add first-hand examples when real families supply suitable evidence and permission. Do not invent results or publish child information.
- Keep offer terms, provider prices and page answers current. These are ongoing maintenance, not a reason to postpone useful A-tier work.

## Next A-tier work

The free assessment, sample report and new tutoring calculator are resources an editor can assess. Three specific candidate pages and proposed additions are in `plan.md`. Publisher approval and explicit authorization to send messages are still required before outreach. No paid link network is needed.
