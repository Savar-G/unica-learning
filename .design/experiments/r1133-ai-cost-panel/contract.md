# AI usage: tabbed reports

Savar selected option B on 2026-11-16. He rejected the prototype styling and required the real admin design.

Build the existing /admin/ai route. Keep AdminFrame, Geist and Geist Mono, the warm look, the shared tiles and tables, the spacing scale and 8 px card corners. Follow DESIGN.md, Admin area. Do not reproduce the prototype sidebar or introduce a second token system.

Show a single period control and three main numbers first: Unica workspace charge, workspace requests and partial recorded app cost. Open on Features. Provide Models, API keys, Families and Records as separate report links. Preserve the report on date changes and the period on report changes.

Feature cards open retained family and child detail. Daily charts, source explanations, context, cost basis and raw provider records start closed. Keep family comparison tables and every available model/key group accessible.

Keep the admin gate, fixed Unica workspace, date calculation, all-family scope, independent readers, unknown states, estimates, subscription meaning and exact generation attribution. Do not add provider and app subtotals. Do not infer old feature costs from a shared key name. This UI work imports no history and makes no paid call.

Acceptance: report and date navigation work together; feature detail opens by pointer and keyboard; all three reader failures stay independent; 390 px and desktop layouts have no page overflow; text and component styles match the live admin frame. Required tests, lint, type/build checks, browser verification and independent Standards/Spec review must pass.
