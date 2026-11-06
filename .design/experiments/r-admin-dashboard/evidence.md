# Admin Parent dashboard explorer

The entry is `/admin/parent-dashboard`. It has a distinct Admin tab. The existing Admin metrics page remains at `/admin`.

The catalog has 10 views and 93 scenarios. `scenarios.json` comes from the public catalog used by the controls and renderer. It records each scenario, derived child stage, tabs, and URL. The catalog uses exhaustive records for the seven child stages and eight plan states. The controls also select desktop, tablet, phone, no children, one child, two children, the second child, and a long first name.

The preview uses the actual `ParentShell`, Assessment/report, Overview, Workbooks, Progress and skill panel, Maya note and transcript, Account, Plan, scan stack, and marking-result components. Workbooks, Progress, Account, Plan, child details, report offers, and plan confirmations share presentation code with the normal parent routes. The normal controllers retain their original actions. Scan stack samples use an optional typed initial state. Its normal controller still reloads the signed-in family on mount.

## Safety

The page calls `requireAdmin` before rendering. It has no demo bypass, including in development. The only addressable entry is the Admin page. The frame has a `srcDoc` document and no source route.

The client renderer calls React's static renderer. It never mounts the parent tree. Effects, event handlers, time-zone saves, card checks, scan polling, and analytics do not run. The static Next router context rejects every method call. The shipping code does not replace `fetch` or a server route.

An HTML parser removes active attributes and elements. It removes account, desk, support, provider, receipt, and PDF URLs. It replaces forms with plain containers. It disables form controls. Links remain readable and focusable with `aria-disabled`. Content is not under `inert`.

The frame sandbox permits only same-origin access, which lets site fonts load. It does not permit scripts, forms, downloads, popups, or top navigation. Its content policy separately forbids scripts, network connections, forms, child frames, and base URLs. Styles and fonts may load only from the site's static Next assets. Images may use data URLs and the code-owned Maya avatar. Site analytics and visit/ad effects exclude the explorer itself.

Use the Admin selectors to change a view or open state. Native text disclosures still work inside the frame. Parent buttons and links perform no action. The frame shows the selected viewport width. It scales to fit the Admin page and retains its own vertical scroll.

## Falsifiers and checks

A preview entry that bypasses Admin authorization would fail the page-entry tests. A production demo bypass would fail the explicit production test. An account or write URL, enabled control, active script, form, provider construction, network call, or tracking call would fail the renderer tests. The tests render every catalog scenario and attempt clicks, keyboard input, and submission events. They also test hostile added HTML. No sample content is removed from assistive technology by an `inert` boundary.

A changed query that loses family, child, viewport, view, or scenario would fail the control tests. Invalid, duplicate, and cross-view values must return valid catalog selections. A missing product stage or plan fails compilation through the exhaustive records. The skill sample goes through the real skill map rule and includes every implemented skill state.

The focused checks passed 208 tests in 15 files. The final renderer check passed 98 tests after the last sample correction and the report-table preservation check. Source lint and the production build passed. The build type-checks the tests. See `verification.json` for the file counts and exits.

The parent route checks proved that the extracted pages retain sign-in and family gates, release-switch behavior, live parent download/tracking links, billing states, report offers, cancellation dates, Pause token recovery, paid Restart, and normal scan interactions. Their stores and providers were test seams. They did not test live services.

## Limits

This implementation has no browser evidence. The root agent owns rendered checks at the three viewport sizes, narrow Admin overflow checks, keyboard checks, live authorization checks, the full test gate, and independent review. Test DOM output does not prove browser layout, scrolling, fonts, or accessibility behavior.

The samples do not test delivery, payments, camera capture, downloads, emails, real family data, or hosted mutations. No release switch changed. Page history, answer correction, solutions, and future progress details from unimplemented parts of #458, #470, and #565 are omitted and identified in the Admin controls.
