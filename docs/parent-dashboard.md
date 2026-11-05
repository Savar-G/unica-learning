# Parent dashboard release

`PARENT_DASHBOARD_ENABLED` is a server release switch (spec #544, #551). Leave it unset. While it is unset, only families marked in `public.test_accounts` and users listed in `public.admin_users` get the dashboard, and every other family gets today's Parent home. The server reads those marks on each request. A browser cannot supply its own mark.

Only the exact value `on` opens the dashboard to every family. Set it in the server environment and redeploy, and do this only after Savar approves on the one review page (D-249). Remove the value and redeploy to close it again.

## What the switch controls

- `src/lib/parent-dashboard-access.ts` is the check. `parentDashboard()` in `src/lib/parent-dashboard-server.ts` calls it, once per request, for the layout and the home page.
- `src/app/(product)/account/(dashboard)/layout.tsx` adds the frame. For a family the switch does not open to, it returns the page alone. A failed read of the dashboard's facts also gives today's Parent home.
- `src/app/(product)/account/(dashboard)/parent-home.golden.html` is today's Parent home, written from the page before the dashboard existed. `page.test.ts` compares a normal family's page with it, byte for byte.
- `/account/settings` is the Account tab. Everyone else goes back to `/account`, which has the same links.

The pages in `(dashboard)` keep their addresses, because a route group is not in the URL. The test, its start screen and the first sign-in (`/account/test`, `/account/start`, `/account/finish`) stay outside the folder, so they never show the frame. The desk lock, the desk guard and the proxy's 423 apply as before: `src/proxy.ts` matches `/account/:path*`, and the guard is in the layout above.

## The Maya tab (#553)

The Maya tab is `/account/notes/<child>`, the notes page that already existed, so every note and transcript address keeps working. For a child with the tab, the page shows the child's minutes left this week (the minutes ledger, `parentMinutes`) and the chat messages (`parentChatUsage`) above the notes, and each note links to its transcript (`/account/notes/<child>/<call>`). The home page then leaves out the minutes and the latest note. For a family without the dashboard, or a child without the tab, both notes pages stay as they were: `notes.test.ts` compares them with `notes-list.golden.html` and `notes-session.golden.html`.

The tab shows for test families only, until a child can call Maya (#337); the `maya` switch in `src/lib/parent-view-server.ts` holds that. Admin test calls never appear: the database writes no note for them, `parent_maya_note_sessions` returns only family calls and chats, `withSessions` drops any other row, and they take no child minutes. There is no pattern line: no code counts a pattern across calls yet, and the tab shows only what code counted.

## Child details on the Account tab (#555)

`src/components/account-child-details.tsx` shows one section per child: the first name, the school grade and the learning card. The learning card's questions stay at `/account/learning/<child>` with their route, `/api/account/learning`, which rebuilds the profiles after a save. A grade change goes through the support email.

`PATCH /api/account/children/<id>` changes the first name. It answers only to a family the switch opens to, and answers not found to every other family and for another family's child. Parents have no update right on `first_name`, so the server's key writes it through the service-only function `rename_child` (migration `child_rename`), which keeps it to the parent's own child, and the family write fence still applies. It takes the name by the signup rule (`cleanFirstName`).

The rename refuses while the child has an active workbook run. A kept page prints the name in its id, and a resume with another name fails the run. `rename_child` checks the runs and writes the name in one transaction under the child's row lock, and `start_workbook_run` takes that same lock first, so no run starts between the check and the write. A run is active by the app's rule for a stopped run (`runState`, `STALE_SECONDS` in `src/lib/workbook-job.ts`): a queued run for the Mac waits however long it takes, and any other queued or running run is active until it has had no heartbeat for 6 minutes. `rename_child` locks the child's queued and running runs while it decides, so it waits for a resume being made and then sees its fresh heartbeat. A stopped run whose status still says running never blocks a rename: the rename ends it in the same transaction, as `fail_workbook_run` does (failed, the reason "The child's name changed while this workbook was stopped. Prepare it again.", no lease, a `run-failed` audit row), so its old lease writes nothing more and it cannot be taken up again (migration `child_rename_stops_runs`). The admin run page shows that reason, and the next "Prepare next workbook" starts a new run with the new name.

Each rename keeps the name before it in `children.former_names` (oldest first, each once, at most 20; only `rename_child` writes it, and it goes with the child row). After 20, the route answers `too_many_names` and the parent emails support. The call note writer (`src/lib/maya-call-note.ts`) hides the former names in every form it hides the name now, so a note written after a rename keeps none of them and sends none to the AI. `supabase/tests/child_rename.sql` checks the function in a rolled-back transaction, and `supabase/tests/child_rename_locks.sh` checks the shared lock with two connections.

What a name change updates, because these read `children.first_name` when they show or send: the dashboard, the report and report email (the stored report holds a token), Maya's notes and transcripts (stored with `{child}`), the desk and Maya's next request, reminders and workbook emails, the next workbook, and the file name of a workbook PDF.

What it does not update: a workbook draft or shipped workbook already made (its pages, page ids, images and PDF print the old name, so an unshipped draft ships with the old name unless an admin makes a new one), and an email already sent, with its copy in `email_copies`. A call's stored trace (admins only) hides only the exact name the child had during the call, as before; the note hides every name.

## The family delete (#556)

The Account tab's delete and its route follow the same switch: the route answers 404 for a family the switch does not open to. The confirmation is `/family-deleted`, outside the account pages, because the session has ended. The privacy and terms pages are worded to stay true while the switch is off: they say "if your account page offers it". See `docs/assessment-deletion.md`.

## Adding a tab's page

A tab with no page does not appear. When a ticket builds a tab's page, change that tab's line in `TAB_PAGE` in `src/lib/parent-shell.ts`. The stage rule (`src/lib/child-stage.ts`) still decides which tabs a child may have.

The phone layout is set 2, option A of round r544. Savar has not chosen yet. To change it, change `phoneNav` in `src/lib/parent-shell.ts` and the phone parts of `src/components/parent-shell.tsx`.

## The Overview (#560)

The Overview is the home page (`/account`) for a child whose stage has the Overview tab. `readOverview` in `src/lib/parent-view.ts` returns only code-written fields; `dashboardOverview` in `src/lib/parent-dashboard-server.ts` reads it for the child in view, and a failed read leaves the rest of the page as it was. A tile or a section with no data does not appear.

- Level: the working level stored in the newest finished test's report (`reports.model`), as the report reads it: an estimated level is an Early sign. While that report is not ready, the Level tile and the bars come from no test, and the page says "{name}'s new result is being prepared."
- Level by area: the area rule (`areaLevels`, D-243) on that test's answers, replayed with the secret key from the stored test (`restoreSession`, `testAreaAnswers`), as `npm run area-levels:check` does. When the replay does not add up to the stored score (`answersAddUp`), for example a test stored before the rushing rule (#189), the test shows the Level tile and no bars. A bar with too few answers is lighter and says "Early sign". Marked pages do not count yet: no marking is live. A test the report calls unreliable (its reliability note, `pace.unreliable`) shows no bars: one sentence says the last test may not show the child's level reliably and points to the new test the report offers, with a link to the report (D-258). The monthly summary PDF does the same.
- This workbook: the newest shipped workbook, only when a day of it is scanned: every page with that day label has a saved photo that has not expired. #475 will count days from the print manifest.
- Maya this week: the minutes used of 30, only for a child with the Maya tab.
- The action card: one item, the first that applies, only in `first_book_coming`, `active` and `ended`: the test (no finished test, not after the plan ended: Continue test when a test is open, else Start the test), payment failed, no PIN (a shipped workbook and no PIN), learning card empty (all six answers empty). Pages to scan waits for marking (#457, #475).
- Not built yet: Skills mastered (waits for #194 and #578) and Since the first test (waits for the skill states, #550).

## The monthly summary email (#563)

One email per family per month, with a link to each child's Overview and no attachment. `src/lib/monthly-summary-email.ts` holds the rules, `src/lib/monthly-summary-email-store.ts` the reads and the claims, and the `/api/reminders` run sends it after the other emails, on the same spaced transport (one send every 600 ms). `?dry=1` counts it as `monthly` and sends nothing.

- Who: only a family the switch opens to, through `parentDashboardAccess`, as the rest of the dashboard reads it. While the switch is off, that is test families and admins, with their real addresses. A failed read of a mark counts as not marked. An address on a domain that cannot get email (`canGetEmail`) is left out. A family with no confirmed delivery has no summary, so it gets no email.
- Which children: each child whose summary the Overview offers. `src/lib/monthly-summary-offer.ts` is the one rule; `readOverview` and the email both call it, in family time (`src/lib/family-time.ts`). A child with an ended plan still counts, because the Overview still offers the summary.
- When: from the 1st of the month at 7 a.m. family time to the end of the 7th. It names the month that just ended. After the 7th, a family with no email that month waits for the next month. The store reads nothing on UTC days that no window touches (the 9th to the 27th).
- Once: the send key is (parent, month), in `email_log.summary_month` (the first day of that month), with a unique index. A refused send retries up to `MAX_SEND_ATTEMPTS` times. An unknown outcome stays claimed, and nothing sends it again. A claim that fails stops that family only. A run sends at most 20.
- Time: the monthly work ends 50 seconds after the run began, inside the 60-second limit. One email needs 24 seconds: 5 for the claim, which aborts then, and 19 for the send and its writes. With less time left, the run starts no read and no claim, and an aborted read stops the monthly step (`outOfTime`); the next run does the rest. A claim that ends with under 19 seconds left is given back without counting an attempt (`released`): a first claim's row is deleted, and a retry's row is failed again at its old count. If the release fails (`stuck`), or an aborted claim's write lands after its release looked, the row stays claimed and nothing sends that email: one lost email, never two. The writes after a send have no abort, so a database that hangs there can still reach the limit; the row then stays claimed and the email is not sent twice.
- Its own unsubscribe: kind `monthly_summary_unsubscribe`, one row per parent. It stops only this email, and no other unsubscribe stops it. The page is `/unsubscribe`, with its own words for this email.
- `public.email_copies` keeps what was sent, with the link tokens hidden. The admin dashboard lists both kinds. Clicks are not counted, so the admin shows no click rate for this email.

A signed-out parent who opens the link goes to sign-in and then back to the same child (`signInPath`). The email says nothing about results: no level, no percent right and no comparison. It names the child, never she or her.
