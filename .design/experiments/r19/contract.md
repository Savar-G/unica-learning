# Parent email design A

Route: focused. Phase: build and review. Surface: marketing. Constraint: existing brand.

Savar selected A on 2026-10-17 and authorized implementation, tests, and a PR.

- Use the existing text wordmark and orange square. The logo must remain visible with remote images blocked.
- Use one white column, at most 600 px wide. Keep system fonts and email table layout.
- Put the team signature before the footer rule. Put the address, site link, email reason, and required unsubscribe link below the rule.
- Keep the report content, code placeholders, reset URL fields, sign-in link, reminder deadlines, and unsubscribe policy.
- Cover the four reminder types, report offer and quiet variants for BC and Ontario, sign-in link, and the three hosted Auth templates.
- Check all generated samples at 375 and 1440 px. Check keyboard focus and long names. Fail on overflow, missing actions, changed URLs, or wrong unsubscribe state.
- Keep internal alert messages unchanged.

Source tests and browser renders prove local output. They do not prove Gmail, Apple Mail, or Outlook rendering. The three hosted Auth templates require separate installation and QA inbox checks after approval.
