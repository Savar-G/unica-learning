# Workbook marking: gap audit

Date: 2026-11-04. Code at `origin/main` `5584bf9b`. Read-only: no commits, no PR, no database writes, no paid AI calls. Fake books cost USD 0.00 and stored nothing. Live database checks were SELECT only.

## The answer

Build a small print-contract slice first, before the first customer's book is approved. Then fix the ticket set, because the 23 slices do not cover the pages the generator makes today.

Four findings change the plan:

1. **Book 2 repeats book 1 today.** `planNextWorkbook` passes `passed: {}` and empty `reviews`, `missedReviews` and `misses` (`src/lib/workbook-placement.ts:99,102`). A scratch run with the first-customer profile gave the same new steps for book 1 and book 2: 9 of 9 step-day pairs. Only S10a and S12 fix this, and they come late.
2. **The filed tickets cover few real pages.** No S3 to S12 ticket body contains "circle", "show-work", "spot-the-error" or "two-ways". After every filed family slice, a page can finish on only 12 of 82 U16 pages and 1 of 82 U4 pages. S10a treats an incomplete sample as insufficient evidence, so the plan would keep the same step.
3. **A book approved before S2 can never be marked.** S2's legacy rule keeps the photo and refuses automatic marking. All 3 printed or shipped books and the 1 draft in `public.workbooks` belong to test families, so this is still avoidable for the first customer.
4. **Most of S2's measurement already works.** A real Chromium render of U16 Days 1 and 7 measured 148 of 148 answer regions. The code throws them away. Only the scan marks need an ID.

## 1. S1 (#454): what stays open

All boxes in the ticket are still unticked. PR #477 evidence covers most of them.

| Item | State | Who finishes it |
|---|---|---|
| Decisions D-207 to D-213, notice, privacy text | Done | Agent ticks the boxes |
| Refusals, admission limits, normalization, Storage denial, image route, family deletion, analytics, zero AI | Done with hosted evidence in `.design/experiments/r454/` | Agent ticks the boxes |
| Crop parts of the Storage and deletion checks | Not applicable: S1 makes no crops | Moves to S2 |
| Queued-job boundary on the hosted database | Local only. Default upload limit (2) binds first. Low value | Agent, optional |
| **Deployed cleanup route and scheduled physical removal** | Half proved, see below | **Agent** |
| **Real camera photo with a readable QR on iPhone Safari** | Not done | **Physical phone** |
| **Real camera photo with a readable QR on Android Chrome** | Not done | **Physical phone** |

Deployed cleanup, read from the live database now: cron `scan-photo-cleanup` is active, 229 runs succeeded, the last at 2026-11-05 05:30 UTC. `net._http_response` holds 24 HTTP 200 answers with `{"removed":0}` in the last 6 hours. So the route is deployed and its secret works. `public.scan_photos` has 0 rows in production, so the deployed job has never removed a file.

Agent steps, about 20 minutes: as a child in a test family (shipped U1 book), save one synthetic photo on production with Aside, delete it, confirm the object exists after the terminal state, wait for the next quarter hour, read `{"removed":1}` and confirm the object is gone. That is a production write in a test family, so it was out of scope for this audit.

Physical test needs one real printed page. Simulators through the T3 device tools can prove the iOS and Android file picker and HEIC handling with a photo added to the library. They do not prove the camera or QR reading from paper.

## 2. S2 (#455): design notes

### What the code has today

| Part | Today | Evidence |
|---|---|---|
| Scan marks | Drawn, with no measure ID. On every page type in the real template | `workbook-template.ts:1338`, CSS at `:242-246` |
| Mark position | Fixed by CSS: 22 px in from each corner of the 816 x 1056 sheet, 18 px long, 3 px stroke. `.pg` is `inset:0` | `:237,:242-246`. Content cannot move them |
| Fixed test template | No scan marks | `workbook-template-fixed.ts`, used by `load-workbook-sample` and render check |
| Answer regions | Measured by the print engine as `question-N-answer` and `region-N-<id>`. `regionNames` is exported | `:788`. Proof: 148 of 148 in Chromium |
| What is stored | Whole-question box only | `workbook-render.ts:306`, columns `box_x` to `box_height` |
| Image size | 1275 x 1650 PNG, scale 1.5625 | Measured |
| Teaching context | `slot`, `part`, `place`, `itemPlan`, `day`, `pageOfDay`, `expected` exist on the generated draft. `approvedWorkbook` drops them all | `workbook-generator.ts:563-630`, `workbook-ship.ts:107` |
| `printed_revision` | A timestamp, `coalesce(printed_at, approved_at)::text`, not a content identity | `20261102_scan_page_photos.sql:107` |

The ticket's line references are stale: template `228-232,955` is now `242-246,1338`, and render `291-294` is now `294-306`.

### How much it depends on layout: not at all on positions

Each render measures its own geometry and stores it with that revision. A later layout change gives later books a new contract and leaves printed books alone. S2 depends only on the measure names and `regionNames`, not on where anything sits. If the Layout lane moves the marks, the measurement moves too.

### What D-207's sample approval really protects

It does not protect geometry. It protects work that depends on which pages and formats exist:

- S3's template coverage table ("from the approved U4/U14/U26 samples").
- The order and content of the format slices.
- The paid evaluation pages, so money is not spent on page shapes that change.
- The required page sets per printed day.

If S2 starts before approval:

- **Nothing breaks in capture.** Old contracts stay valid for old revisions.
- **Crop checks may need new fixtures.** Use a test fixture, not a named production page.
- **Merge conflicts are the real cost.** `workbook-template.ts` has had 15 commits in about two days.
- **S2 ticket text needs a change.** It says "one approved page".

Waiting has the larger risk: if the first customer's book is approved first, S2's legacy rule blocks automatic marking on that book.

Also: D-207 names U4, U14, U26, while the rounds and the personalization spec work on U4 and U16 (`docs/workbook-rounds.md`, `docs/workbook-personalization.md`). #363 is closed with no comments, and `.design/decisions.md` holds no approval row. The blocker has no clear way to clear.

### Smallest correct slice: split S2 in two

**S2a, print contract capture.** No UI, no crops, no AI. Merge before the first customer's book is approved.

| File | Change | Owner |
|---|---|---|
| `workbook-template.ts` | `data-measure="scan-tl"` and so on, at `:1338` | **Layout** |
| `workbook-render.ts` | Validate the 4 marks (missing, duplicate, off page, not a rectangle). Build the contract. Keep every region box | **Layout** |
| `workbook-template-fixed.ts` | No change: no marks means no contract, so no automatic marking | Layout |
| `workbook-job.ts:127,444` | Keep the contract and regions in the draft rendering | **Profile and placement** |
| `workbook-content.ts`, `workbook-store.ts`, `workbook-store-memory.ts` | New fields, same tests on both stores | No lane: assign one |
| `workbook-ship.ts:107`, `workbook-edit-deps.ts:54` | Keep contract and teaching context through approval and edit | No lane: assign one |
| Migration | `workbook_pages.print_contract`, `workbook_questions.regions` and teaching context, `workbooks` manifest and fingerprints. New versions of `write_workbook` and `save_workbook_rendering`. `identify_scan_photo` uses the new revision | S2a |
| `workbook-generator.ts` | No edit: the fields already exist | None |

Also check: other paths that call the renderer (`load-workbook-sample.ts`, `workbook-sample-render.ts`, `render-workbook-templates.ts`, render check) must not crash on a missing contract. `workbook-layout-check.ts` must ignore `scan-*` names. Ask the round's owner before editing Layout files (`docs/workbook-rounds.md` line 16). The Layout edits are about 30 lines.

**S2b, the rest of #455.** New `src/lib/scan-calibration.ts` (find the 4 marks in a photo, perspective map, crops), crop storage under `scan-photos`, the observation and page-completion API, the preview screen. This touches no generator file. `fence_scan_object` allows only `photo.jpg` today, so crops need a migration.

Two S1 contracts S2 or S4 must change:

- `identify_scan_photo` refuses a second photo of a page as `duplicate` (`:104`), and `scan_one_active_page` allows one active photo per page. S4 requires two devices to submit different photos, and retakes.
- S1 accepts only `shipped` books (`:102`), while S2 says an admin opens a photo against an approved revision. Use a shipped test book, or widen it for test families.

Risk the ticket misses: books are saddle stitched (D-191), so two marks sit about 0.23 inch from the corners on the spine side, on a curved page. S2 tests scale, rotation and perspective, not curl. Crops only serve review, since the AI gets the whole page, but S3's refusal rate depends on this. Test one printed booklet before S3 sets thresholds.

## 3. Build order

### Hard order, from Blocked by sections and file overlap

- S2 before S3 and S4. S4 before S5. S5 before S6, S7a, S7c, S7d, S7h, S7i, S7j, S8, S9, S10a (S6 and the S7 family also need S3).
- S7a before S7b. S7d before S7e. S7h and S7i before S7f and S7g.
- S10a before S10b. S3, S8 and S11a (done) before S11b. S10b and S11b before S12.
- **S9 before S12 is a soft edge.** S10a already handles fixed states from saved data, and an empty set of fixed items is valid. Removing it unblocks the next-book path from voice.

### Wave plan, at most 2 implementers

| Wave | Slot A | Slot B | Note |
|---|---|---|---|
| 0 | **S2a** (new) | S1 cleanup proof | Merge before the first customer's book is approved |
| 1 | S2b (#455) | **Photo set generator** (new, no AI) | Separate files |
| 2 | S4 (#457): marking, cap ledger, paid comparison | S3 (#456) | Both touch `scan-pages.tsx` and the scans route. Keep S3 before the save, S4 after it |
| 3 | S5 (#458) | **Interim book 2** (new, if Savar picks it) | Interim is in the Profile lane |
| 4 | **Circle family** (new) | S6 (#459), plus **spot-the-error** | Circle is on 49 of 82 U16 pages. S4 should build a checker registry, so each family adds one file |
| 5 | S10a (#472) | **Show-work family** (new): read the box, ignore the work area | S10a edits `workbook-placement.ts` and `workbook-plan.ts`: Profile and Content lanes, and open PR #523 edits both. Merge #523 first |
| 6 | S10b (#473) | S8 (#470) | |
| 7 | S11b (#475) | S7a (#460), for 38 U4 pages | |
| 8 | S12 (#476), S9 edge removed | S9 (#471) on chat, if Savar agrees | First real book 2 from marks |
| Later | S7h, S7i, S7b, S7c, **write-words** (new), S7f, S7g, S7d, S7e, S7j | | By level need, see below |

Limits on this plan:

- Every slice with a screen needs Savar's look approval, so he is a bottleneck beside the 2 implementers.
- All slices regenerate `database.types.ts`. Migrations must merge in order.
- Push once per review round (Vercel build limit).
- Ticket counts by level (from fake books):

| Family | U4 | U14 | U16 | U26 | Ticket |
|---|---|---|---|---|---|
| write-number, questions | 185 | 236 | 440 | 248 | S4 |
| circle, scored | 228 | 226 | 103 | 51 | **None** |
| circle, parent-checked | 17 | 0 | 0 | 0 | S7h likely |
| show-work | 51 | 49 | 60 | 34 | **None** |
| spot-the-error | 17 | 19 | 19 | 17 | **None** |
| two-ways | 6 | 3 | 7 | 5 | S7b may not fit: regions are box + work + work |
| tick-and-number | 0 | 32 | 32 | 14 | S6 |
| boxes | 51 | 0 | 1 | 0 | S7a |
| write-words | 6 | 99 | 0 | 24 | **None**; S7a forbids silent enabling |
| colour-or-shade | 6 | 0 | 0 | 0 | S7f |
| Fraction answer boxes | 0 | 14 | 0 | 10 | S7c |
| Decimal answer boxes | 0 | 0 | 0 | 17 | S7d |
| Answers with a unit | 0 | 0 | 0 | 0 | S7e: can wait |

Pages a child can finish, cumulative:

| After | U4 (82) | U14 (82) | U16 (82) | U26 (57) |
|---|---|---|---|---|
| S4 | 0 | 10 | 10 | 11 |
| All filed tickets | 1 | 10 | 12 | 11 |
| + circle | 42 | 17 | 43 | 15 |
| + show-work | 55 | 37 | 63 | 31 |
| + spot-the-error | 70 | 43 | 75 | 40 |

U14 and U26 rows count fraction boxes under write-number, so S7c is also needed there. Only 1 of 8 U16 Day 7 pages can finish with filed tickets. S4's only full U16 pages are the warm-ups, which do not test the planned steps. So S4 alone gives no plan decisions. U16 practice pages need circle.

Limit of this data: fake AI, 4 levels. Formats come mostly from code templates, so I expect real books to be close. Real samples were not counted. Open PRs #523 and #524 may change them.

## 4. Paid evaluation

| Question | Answer |
|---|---|
| Does a fixed photo set exist? | No. No handwriting fixture in git. `r454` has one synthetic PNG with no handwriting. Cedric's PDFs are generated samples and I did not inspect them for handwriting. |
| Does a ticket make it? | S4 acceptance item: "a bounded manually labelled synthetic whole-page photo set" through Sonnet 5.5 and Haiku, identical photos and rules, predeclared pass thresholds. S6 and the S7 family add their own. No ticket builds a tool for it, and it waits behind S2. |
| Can it be made without a human writing? | Yes, for workflow and comparison. It cannot prove child handwriting, and the ticket already forbids that claim. |
| USD 50 cap | D-208, #368 comment, S4's "Global monthly marking cap" section and acceptance item (atomic reservations, UTC month), S8 shows it. No ledger table exists live. |
| No-training check | D-211 and paragraphs in ticket bodies. **No acceptance checkbox in any ticket, and no owner.** PR #477 calls it a marking-launch gate. |

Generator design: take page PNGs and measured regions from a fake book. Write digits into the answer regions from a public handwriting set such as EMNIST or from handwriting fonts. Warp, shade, blur and compress like a phone photo. Labels come from the generator, so they are exact, which is stronger than manual labels. Include blank, wrong, crossed-out, digit outside the box, numbers in the work area, and printed worked examples as decoys. About 40 pages on 2 models is 80 calls, about USD 1.60 at the USD 0.02 target. The real price is not measured.

Add a small human set later: Savar and Cedric fill about 10 printed pages, messy on purpose. Do not use real children's `shown-work` drawings or photos without a stated data-use basis.

Pass thresholds are undefined. False-right matters most, because it advances a child wrongly.

Provider check: `ai-openrouter.ts:5` says training is an account setting and "not a request field". OpenRouter's current docs list `provider.data_collection: "deny"` and `provider.zdr: true` per request, and a ZDR endpoint list at `/api/v1/endpoints/zdr`. So the marking client can enforce this in code. `ai-openrouter.ts:29` sends only `require_parameters`. #182 was closed on the owner's word and its comment says hosted operation was not independently verified. Savar must confirm the account setting. An agent can check the endpoint list for the chosen models.

## 5. Does S9 need voice?

No. D-193 and #368 say wrong items "open on the desk for a second try", with Maya. Neither says voice. D-183 made chat a full desk tab.

| Fact | Evidence |
|---|---|
| Chat is merged | #358, PR #451 |
| Chat takes a stored workbook question | `maya-chat-server.ts:61,105`; `maya-call.ts:746` |
| Same plan gate as #337 | `chatAccess`: Stripe `trialing` or `active` |
| Chat writes a learning event and parent notes | `docs/maya-chat.md`, `maya-call.ts` |
| Chat is off for real families | `MAYA_CHAT_ENABLED` is not in Production. Test families can use it |
| Voice is far off | LiveKit variables not in Production. #327, #335, #336 open. #337 needs a physical Safari iPad. Only admin calls exist in `maya_calls` |

What changes if S9 runs on chat:

1. Replace the #337 blocker in #471 with the chat release, and edit #470 ("activates only with S9 and #337") and #476. #337 stays for voice.
2. Build the second try outside Maya's controller: the desk shows the item with no solution, code checks the typed answer with S4's checker, and chat opens only after a wrong answer. Then no `maya:practice` run (about USD 17) is needed for that part. Any controller change still needs it.
3. Change "minutes" in the acceptance item to the 60-message daily cap. Several wrong items share one cap.
4. Hide "Call Maya" until calls exist.
5. Decide young children: typing is hard at U1 to U9. Offer chat from a set grade, or show results only below it.
6. Paper evidence: chat's note says to write on paper, so the "fixed" rule still applies.

Savar decides: this changes a Maya release condition and turns on chat for children.

S12 does not need S9 at all, as section 3 says.

## 6. Gaps no open ticket covers

**[Savar]** marks a decision that is his.

| # | Gap | Evidence | Action |
|---|---|---|---|
| G1 | **[Savar]** Book 2 before S12 repeats book 1's new steps | `workbook-placement.ts:99`; scratch run 9 of 9 | New ticket. Options below |
| G2 | **[Savar]** Book 1 can ship with no print contract, so it is never marked | S2 legacy rule; first customer has no run yet | New ticket S2a, and amend D-207 to exempt it |
| G3 | **[Savar]** Approval levels do not match the work: U4/U14/U26 against U4/U16 | D-207; `docs/workbook-rounds.md`; no approval recorded | Restate the blocker |
| G4 | Circle, show-work, spot-the-error, two-ways have no family ticket | Table in section 3. S7a says to file separate issues | 3 or 4 new tickets |
| G5 | Write-words is 15% of U14 with no ticket | Table; S7a says UI must say it cannot check | New ticket, or route to parent check **[Savar]** |
| G6 | **[Savar]** First book's printed text points at features that are off | How-plan page prints "Open unicalearning.com ... to scan" and "Ask for help using Maya" (`workbook-template.ts:1397-1398`). `SCAN_PAGES_ENABLED` and `MAYA_CHAT_ENABLED` are not in Production | Open save-only scanning for customers, or change the text |
| G7 | **[Savar]** Backstop with no scans plans the same steps again | S10a: insufficient evidence "retains the step"; S12: backstop uses the assessment. A family that never scans gets a repeated book | Choose: advance by plan, or repeat |
| G8 | No ticket marks photos saved before S4 ships | S4 has no back-marking path. S4 only limits a "save-only" queue | Add to S4, needed if G6 opens saving early |
| G9 | No family launch gate. No ticket holds the release list | `docs/scan-pages.md`: the switch "does not enable AI marking". No marking switch ticket | New ticket: evaluation pass, provider check, physical tests, cap, privacy text, switches |
| G10 | Provider no-training check has no checkbox and no code | Section 4 | Put in G9; add request fields to the marking client |
| G11 | **[Savar]** Pass thresholds for Sonnet against Haiku are not set | S4: "predeclared" | Set before the paid run |
| G12 | No synthetic photo tool | Section 4 | New ticket, wave 1 |
| G13 | Page curl on a saddle-stitched book is untested | D-191; S2 acceptance list | Add to S3, needs a printed booklet |
| G14 | **[Savar]** Scan load: 80 or more photos a book, one at a time | U16: 8 pages a day. S8: "one at a time". Day 7 needs all 8 pages. Vault note lists "Will parents photograph and return pages?" as open | Batch capture ticket, or a smaller required set |
| G15 | Cap has no outside backstop: one OpenRouter key is shared by all AI features | `ai-client.ts`; the cap is app code only | Separate key with a credit limit for marking |
| G16 | Book 2 cover line stays "last workbook" when marks exist | `docs/workbook-personalization.md:263`; `workbook-book.ts:1227` | Add to S12 |
| G17 | S1 contracts conflict with S4 and S2 | Section 2 | Add to S2b and S4 |

Covered, no new ticket: admin view of scans (S4 detail, S8 list, none exists in `/admin` today); next book reading marks in the profile (`child-profile.ts` already counts source `marking`, and `workbook-signals.ts` reads it as S8); delivery records (S11a merged, PR #478).

### G1 options

| Option | Result | Cost |
|---|---|---|
| **A. Advance by plan (recommended)** | Book 2 starts after the steps book 1 planned through Day 7, and carries `reviewsAfter`. It uses no marks and says so to admin | Small ticket, Profile lane. A child who struggled moves on until marks exist |
| B. Admin marks by hand from saved photos | Real evidence, one customer | Needs S10a and an admin entry screen. Slow |
| C. Hold book 2 until S12 | Correct plan | Breaks "next book before the current one runs out", likely by weeks |

With A, also open save-only scanning (G6) with S2a in place, so the first customer's photos can be marked later, within 90 days.

## First customer's path

1. S2a merges. 2. Personalization work (I1) and Savar's approval. 3. Book 1 renders with a contract, is approved, printed, shipped. 4. Admin confirms delivery (S11a exists). 5. Parent saves page photos, if save-only scanning is open. 6. Day 7: no automatic trigger exists until S11b and S12, so admin presses Prepare next workbook, using option A. 7. Marks reach book 3 or later.

## Decisions for Savar

1. Amend D-207: exempt S2a, and replace U4/U14/U26 with the levels really reviewed (G2, G3).
2. Book 2 rule before marks (G1) and the no-scan backstop (G7).
3. Open save-only scanning for the first customer, or change the printed text (G6).
4. S9 on chat, and from which grade (section 5).
5. Evaluation thresholds, and whether a human-written set is required before launch (G11).
6. Write-words: automatic or parent-checked (G5). Batch capture or a smaller required set (G14).
7. Physical test: print one booklet, take photos on an iPhone and an Android phone (S1, G13).

## New tickets to file

S2a print contract capture; S7k circle; spot-the-error (or extend S6); S7l show-work; write-words; two-ways mapping (check S7b first); synthetic photo set generator; interim book 2 rule; family launch gate. Edits: split #455, remove #471 from #476's blockers, change #471 and #470 if chat is chosen, add G8 and G17 to #457, add G13 to #456, add G16 to #476, tick the done items in #454.

## What this audit did not prove

- Fake books, not real AI text. U16 render check covered Days 1 and 7 only.
- Book 2 proof is a planner run with the first-customer fixture, not a full job. I did not compare question text.
- Absence of Production variables comes from `vercel env ls production`, filtered by name. Preview was not checked.
- OpenRouter facts come from its docs (search dated 2026-10), not from a live request.
- Whether S6 can take spot-the-error, and S7b can take two-ways, needs a check of their rules against the package checks. The current books use check kinds `template`, `template-choice` and `template-shown`, which the tickets do not name.

Scratch evidence: `/private/tmp/claude-501/-Volumes-Lexar-Dev-noindex-t3-worktrees-pagewise-landing-page-t3-dc78fd0d/9d5dc7e0-bc66-4890-86cd-3ac4390d9aca/scratchpad/` (`fake`, `fake2`, `proof/plan2.ts`, `proof/measure.ts`, `proof/u16-measure.json`).
