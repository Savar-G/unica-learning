# Workbook comment routing: database review

SQL_REVIEW_READY

Base: `7fe49140c807e29f774b84d941c7621d37043a7a`.

This is a local implementation checkpoint. It is not ready to ship. Neither migration has been applied. Official generated types, API and mounted component checks, the hosted rollback probe, browser checks, and the final full gate remain incomplete.

## Required behavior

- Every cover, instruction, spacing or layout request must have an explicit path. These requests must not enter the question writer.
- Question edits must change their target before the comment can be marked complete. A failed or unchanged target stays open, including mixed-success pages.
- A human reviews a template correction before a layout batch can be queued. The batch renders saved questions with no writer, solver, planner or package construction.
- A layout batch preserves stored question and answer data, page order, schedule data and QR identity. It can change only the selected page images and their measured marking regions.
- Applied results can close their own comments. Partial and unsupported results stay open. Unsupported-only reviews save reasons without a batch or a new revision.
- Stale revisions, stale builds, replaced or expired leases, printed books, duplicate completion, concurrent admission, and changed unselected pages must refuse unsafe writes.
- Preserve the existing service-only admission and family write fences. Do not grant parents or anonymous callers access to the new functions.

## Scope of this review

Review both new migrations and their local PostgreSQL fixture and tests. Read the TypeScript route, layout core, store and comment target normalization as caller context. Check SQL and TypeScript classification and target comparison for agreement. Check the original function replacements against the committed definitions from which they were copied.

The existing finish guard now excludes derived `quality`, as it already excludes page and count data, from whole-book identity comparison. A local failing control showed that recomputed quality otherwise refused a legitimate checked edit. This does not permit changes to the plan or other book identity fields.

Do not apply a migration, change a customer row, run a model, render a book, run the full suite, build, push, or write a PR comment. Use the installed local PostgreSQL fixture. The fixture uses `/opt/homebrew/opt/postgresql@18/bin` on Savars-MacBook-Pro-5.local. It creates and removes its own isolated cluster.

## Checks completed by the controller

- Current five focused suites: 123 tests passed, exit 0. They cover comment classification, truthful target changes, layout core, progress, and dispatch before AI construction.
- Local PostgreSQL fixture: 23 groups and one two-session concurrent admission group passed, exit 0.
- Earlier six-suite run: 131 tests passed, exit 0. It is supplied earlier evidence, not an additional current aggregate.

These are local and synthetic checks. They do not establish hosted schema, permissions, provider operation, a saved customer revision, or print approval.

## Customer hold

No customer write is authorized by this checkpoint. The current customer revision and all comments must remain unchanged. A separate roadmap approval relay is required before saving the corrected customer revision. Do not revive the old failed customer batch.

## Review result

Return separate SPEC and STANDARDS results. Report only a concrete failure with evidence, severity, file and line, and the smallest correction. State proof limits. Write a report in this review checkout with `HANDOFF_DONE`. Do not change product source.

## First review corrections

The first independent review rejected checkpoint `8e3cf5c7` with four findings. The controller corrected them locally:

- F1: The layout finish now updates the selected stored page images, dimensions and question boxes in the finish transaction. Packages and QR identities stay unchanged. The existing approval path still applies the full print contract and marking regions.
- F2: A reviewed partial outcome cannot become applied at finish. A new review is required to authorize completion.
- F3: The lease check uses `clock_timestamp()` after the draft, workbook and edit locks.
- F4: `commentFromRow` preserves the explicit route and previous result note.

The new PostgreSQL controls failed against the prior source for F1, F2 and F3. The route-conversion test failed for F4. The corrected runs passed 41 focused tests, the existing 23 PostgreSQL groups, the concurrent queue group and three added database regressions. The stored-row regression loads the real committed approval and print-contract functions. It checks finish followed by approval. The lease regression uses two concurrent local sessions and a real lock wait.

The new local fixture adds only the columns needed for the approval proof. It still does not establish hosted schema, permissions or storage behavior. Migrations, official types, the complete API/UI checks and release checks remain pending.
