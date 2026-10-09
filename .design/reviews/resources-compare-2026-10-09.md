# Review: 5 competitor guides on /resources (2026-10-09)

Scope: `tutor-cost-bc`, `kumon-cost-bc`, `is-kumon-worth-it`, `kumon-alternatives`, `kumon-vs-mathnasium`, plus a visual pass on the hub and the article template. Reviewer: independent adversarial review (Claude), branch `site/resources-review-compare`.

Method:
- Kumon prices and Kumon method claims: checked against `.design/research/kumon-bc-prices-2026-10-09.md` and `.design/research/kumon-method-pages-2026-10-09.md` (kumon.com returns 403 to scripts).
- Every other source: fetched again on 2026-10-09 with curl (or WebFetch for Khan Academy Kids, which serves a script challenge to curl). The text was compared with each claim.
- mathnasium.com returns 403 to curl and WebFetch on every page tried (`/ca/math-centres/northvancouver`, `/ca`, `/ca/about-mathnasium`, `/`). The Mathnasium North Vancouver facts rely on the orchestrator's browser read in the prices file. "Math only" is now cited to `https://franchise.mathnasium.com/` (HTTP 200), which says "The #1 Math-Only Education Franchise in North America". The pages quote only "math-only", not the "#1" claim.

Verdicts: **correct** = the claim matches the source, no change. **fixed** = the wording, number or citation was changed to match the source. **removed** = the claim was deleted.

## Findings

| # | Page | Claim | Verdict | Source |
|---|---|---|---|---|
| 1 | tutor-cost-bc | Math Tutor Network: K-7 math from $38 online, $40 in person | correct | mathtutornetwork.com/rates.html |
| 2 | tutor-cost-bc | Math Tutor Network: K-7 group from $28 online, $30 in person, per student | correct | same |
| 3 | tutor-cost-bc | Math 12 from $44 online, $46 in person | correct | same |
| 4 | tutor-cost-bc | +$5 for lessons shorter than 1.5 hours; rates vary by location and tutor experience | correct | same |
| 5 | tutor-cost-bc | TutorLyft: Vancouver math tutors $30-$100, agencies often from $45; updated June 28, 2026 | correct | tutorlyft.com blog |
| 6 | tutor-cost-bc | Genie Teacher: Toronto and Vancouver tutors commonly $60-$100; updated July 24, 2026 | correct | genieteacher.com blog |
| 7 | tutor-cost-bc | Genie bands: student $15-$35, independent $25-$60, certified $30-$100+, agency/centre $40-$75 online and $50-$90 in person | correct | same |
| 8 | tutor-cost-bc | Online usually $15-$30 an hour less | correct | same |
| 9 | tutor-cost-bc | Monthly table: $152/$304, $160/$320, $240/$480, $400/$800 | correct (recomputed) | arithmetic |
| 10 | tutor-cost-bc | Intro and meta: "published rates start at about $38-$40 ... many [elementary math] tutors charge $60-$100" | fixed: $38-$40 is one company's K-7 starting rate, and TutorLyft gives $30 as the low end; $60-$100 is all subjects | sources 5-7 |
| 11 | tutor-cost-bc | "Mathnasium does not print a price on its BC centre pages" | fixed: only the North Vancouver page was read | prices file |
| 12 | tutor-cost-bc | Mathnasium NV: flat monthly membership + one-time enrolment fee; most students 2-3 times a week | correct | prices file |
| 13 | tutor-cost-bc | Kumon $180-$260 per subject, $80 enrolment, Canada Virtual $150 | correct | prices file |
| 14 | kumon-cost-bc | 14 table rows (13 BC centres + Canada Virtual): tuition and materials per centre | correct (each row checked) | prices file |
| 15 | kumon-cost-bc | Range $180-$260; "most" $190-$220 | correct: 8 of 13 centres fall fully inside $190-$220 | prices file |
| 16 | kumon-cost-bc | $80 enrolment at every centre; materials $20 or $30 at most (12 of 13 list one) | correct | prices file |
| 17 | kumon-cost-bc | Two subjects $360-$520; at most centres $380-$440 | correct (recomputed) | arithmetic |
| 18 | kumon-cost-bc | Worked example: $190+$80+$30 = $300; $380+$80+$30 = $490 | correct (recomputed) | arithmetic |
| 19 | kumon-cost-bc | Canada Virtual $150, no materials fee listed; $300 for two subjects | correct | prices file |
| 20 | kumon-cost-bc | Method: "twice a week ... about 30 minutes per subject a day" cited to What is Kumon | fixed: that page says "typically ... twice a week" and "15 to 30 minutes of work a day"; the 30-minutes-per-subject figure is now cited to the in-person/virtual page | method file |
| 21 | kumon-cost-bc | Kumon Connect and myKumon "show worksheets, times and scores" | fixed: Kumon Connect is "for families using digital worksheets" | method file |
| 22 | kumon-cost-bc | "Mathnasium ... teaches math only" (no citation) | fixed: citation added | franchise.mathnasium.com |
| 23 | kumon-cost-bc | FAQ: "Mathnasium centres in BC do not print a price" | fixed: North Vancouver page only | prices file |
| 24 | kumon-cost-bc | FAQ: tutor $38-$100/hour = $152-$400 for 4 weeks | correct (recomputed) | sources 19-20 |
| 25 | kumon-cost-bc | Centre pages show time-limited promotions | correct | prices file (Amazon eGift offer) |
| 26 | kumon-cost-bc | Price table with Unica rows beside Kumon, labelled "prices only" | correct; kept (see human decisions) | Unica facts |
| 27 | is-kumon-worth-it | Intro: "practises about 30 minutes per subject each day, and visits a centre twice a week" | fixed: "typically twice a week"; "up to about 30 minutes per subject" (Kumon FAQ: "under 30 minutes per subject") | method file |
| 28 | is-kumon-worth-it | Key facts: routine and "charged per subject" | fixed: wording as above; per-subject now cited to Kumon FAQ | method file |
| 29 | is-kumon-worth-it | "Each subject takes about 30 minutes a day" | fixed: added Kumon's own note that new students and early learners may need less time | method file (FAQ) |
| 30 | is-kumon-worth-it | "Students go to the centre twice a week and do the other worksheets at home" | fixed: "typically"; "most of the work at home" | method file |
| 31 | is-kumon-worth-it | Instructor review and app/portal | fixed: every worksheet graded, mistakes corrected, instructor plans lessons; Kumon Connect for digital worksheets | method file |
| 32 | is-kumon-worth-it | "needs steady practice to make basic skills fast and sure" | fixed: implied an outcome; now "wants steady daily practice on core skills" | rule: no outcome claims |
| 33 | is-kumon-worth-it | "A repetition-based format ... Others want more variety or explanation" | fixed: now states Kumon's own reason for repetition (mastery, speed, accuracy, assigned as needed) and that worksheets include worked examples; "or explanation" removed because a franchisee could call it misleading | method file (FAQ, how-kumon-works) |
| 34 | is-kumon-worth-it | "a parent often keeps the routine going" (uncited) | fixed: now Kumon's own words, "requires a special commitment on your part" | how-kumon-works |
| 35 | is-kumon-worth-it | FAQ "Is Kumon bad for mental health?" and callout | fixed: reframed as "How do I know if daily practice is too much for my child?", for any daily program including ours. The FAQ goes into FAQPage JSON-LD, so the old question could show "Kumon" + "bad for mental health" in Google results | fairness, D-006 |
| 36 | is-kumon-worth-it | CRA deduction is for paying someone to look after a child "so you can work, go to school or do research" | fixed: the cited page does not hold this text; quoted CRA's wording ("earn income, go to school, or carry on research under a grant") and added the main line 21400 page as a source | canada.ca line 21400 |
| 37 | is-kumon-worth-it | CRA cannot-claim list: education fees at an educational institution, leisure or recreational activity fees; page does not name tutoring or learning centres | correct | canada.ca expenses-claim page |
| 38 | is-kumon-worth-it | BC prices, enrolment, materials, Virtual | correct | prices file |
| 39 | kumon-alternatives | Oxford Learning: 20 BC locations, Abbotsford to Victoria | correct (20 counted) | oxfordlearning.com BC region |
| 40 | kumon-alternatives | Oxford Beyond Tutoring: grades 1-8, assessment then customized program; reading, writing, math | correct | Beyond Tutoring page |
| 41 | kumon-alternatives | Oxford FAQ: 3 students to 1 teacher; price depends on program, attendance, city | correct | Tutoring FAQs |
| 42 | kumon-alternatives | Sylvan Kerrisdale: $60-$75 per session, one-time $199 registration, rates set by that centre, free Insight assessment for one subject | correct | Sylvan Kerrisdale pricing |
| 43 | kumon-alternatives | Sylvan subjects "math, reading and writing" | fixed: "and more" (page also lists science and languages) | same |
| 44 | kumon-alternatives | Eye Level Vancouver-East on Kingsway; math and English ages 4-15; diagnostic test; self-directed step-by-step | correct | myeyelevel.com pages |
| 45 | kumon-alternatives | IXL Canada: CAD 12.95 one subject, CAD 19.95 math + language arts | correct (`productPackagePricingSheet`, `currency: CAD`) | ca.ixl.com |
| 46 | kumon-alternatives | IXL diagnostics give a personalized plan of skill recommendations | correct | IXL blog |
| 47 | kumon-alternatives | Khan Academy Kids free, ages 2-8, early reading, writing, language, math | correct | khanacademy.org/kids (WebFetch) |
| 48 | kumon-alternatives | Prodigy memberships $14.95-$19.95 a month | fixed: the page lists Core $9.95, Plus $14.95, Ultra $19.95; now "$9.95-$19.95, less when billed yearly; currency not shown" | prodigygame.com |
| 49 | kumon-alternatives | Prodigy math and English free; membership adds science and game extras; math aligned to province curriculum grades 1-8; adaptive algorithm | correct | same |
| 50 | kumon-alternatives | BC Summer Reading Club: free, ages 5-14, public libraries, summer | correct | bcsrc.ca |
| 51 | kumon-alternatives | Surrey Reading Buddies: young readers matched with teen volunteers | correct | surreylibraries.ca/kids |
| 52 | kumon-alternatives | Surrey "free digital homework resources" | fixed: the page does not say "free"; now "digital resources to help with homework" | same |
| 53 | kumon-alternatives | "Vancouver private math tutors often start near $38-$40" (key facts, table) | fixed: one company's rate, attributed | sources 5-6 |
| 54 | kumon-alternatives | "one Vancouver agency" | fixed: "tutoring company" | source 5 |
| 55 | kumon-alternatives | "One hour a week at $40 is about $160-$200 a month" | fixed: stated as 4-week vs 5-week month | arithmetic |
| 56 | kumon-alternatives | Intro reasons include "a child who needs more explanation" | removed: implied Kumon gives no explanation | fairness |
| 57 | kumon-alternatives | "Apps ... adapt on screen" | fixed: "some adjust" (adaptivity confirmed for IXL and Prodigy only) | sources 16, 18 |
| 58 | kumon-alternatives | "Free options build habits" | removed: outcome claim | rule: no outcome claims |
| 59 | kumon-alternatives | Mathnasium "math only" (cited to NV page, which is not readable) | fixed: cited to franchise site | franchise.mathnasium.com |
| 60 | kumon-alternatives | Unica: "Each month we mail ..." | fixed: approved wording "mailed home" | Unica facts |
| 61 | kumon-alternatives | What is Kumon accessed 2026-10-08 | fixed: 2026-10-09 (date of the browser read) | method file |
| 62 | kumon-alternatives | Mathnasium NV: diagnostic, customized plan, 2-3 times a week, same price online or in person | correct | prices file |
| 63 | kumon-vs-mathnasium | "Mathnasium: math only" cited to NV page | fixed: cited to franchise site | franchise.mathnasium.com |
| 64 | kumon-vs-mathnasium | Kumon "about 30 minutes per subject" cited to What is Kumon | fixed: 15-30 minutes cited there; 30 per subject cited to How Kumon works | method file |
| 65 | kumon-vs-mathnasium | "Centre about twice a week" | fixed: "typically twice a week" | method file |
| 66 | kumon-vs-mathnasium | Progress row: Kumon app/portal; Mathnasium "Not described on the centre page" | fixed (Kumon Connect for digital worksheets); Mathnasium text removed because the page cannot be read to confirm it | method file |
| 67 | kumon-vs-mathnasium | "The centre page does not describe daily homework" | removed: cannot be confirmed; now a question to ask | - |
| 68 | kumon-vs-mathnasium | "Mathnasium puts more of the work in sessions" | fixed: unsourced comparison; now each centre's own description side by side | prices file, method file |
| 69 | kumon-vs-mathnasium | "Two subjects means about an hour ... a parent may need to keep the home routine going" | fixed: "up to about an hour"; parent role in Kumon's words | how-kumon-works |
| 70 | kumon-vs-mathnasium | Fit: "prefers that most of the work happens in sessions, not at home" | fixed: "prefers scheduled sessions two to three times a week" | prices file |
| 71 | kumon-vs-mathnasium | Tutors "often start near $38-$40" | fixed: attributed to one company | source 8 |
| 72 | kumon-vs-mathnasium | Capilano Mall $200-$220; BC range, $80, materials, Virtual $150 | correct | prices file |
| 73 | kumon-vs-mathnasium | Two Kumon sources accessed 2026-10-08 | fixed: 2026-10-09 | method file |

Tally (counted by script from the table above): 73 claims checked; 35 correct; 35 fixed; 3 removed.

Checks on every page:
- Meta descriptions: 155, 153, 152, 149, 151 characters, each with the main phrase.
- FAQs: 5 on each page. Related slugs: all exist (the build checks this).
- Every `<Cite n>` is in range of its page's sources list (script check). No em-dash in `src/content` or `article.css`.
- Unica mentions use only the approved facts. No "best", no result claims, no logos, no testimonial quotes.

## Visual findings

Screenshots: `.design/evidence/resources-review/`.

1. **Defect, fixed.** The 5-column table on `kumon-alternatives` hid "Typical cost" and "Source" off-screen at 375 px. Nothing showed that it scrolls: the cut fell on a cell edge. All tables had `min-width: 520px`, so 3-column tables also scrolled on phones (scrollWidth 520 vs 341). Fix in `src/components/article.css`:
   - Tables with up to 3 columns now fit the phone width (smaller cell padding under 700 px).
   - Tables with 4 or more columns keep `min-width: 600px`, pin the row-header column (`position: sticky`, with a divider), and show edge shadows while more content is off-screen (scroll-shadow gradients, `background-attachment: local`).
   - `border-collapse: separate` (spacing 0) so the row lines move with the pinned column.
   - Measured after the fix at 375 px: kumon-cost-bc 341/341, kumon-vs-mathnasium 341/341, tutor-cost-bc monthly 341/341, bc-proficiency-scale 341/341, kumon-alternatives 600 scrolling. Pinned column stays at the box edge after a 259 px scroll.
   - Evidence: `table-kumon-alternatives-0-375.png`, `table-kumon-alternatives-scrolled-375.png`, `table-kumon-vs-mathnasium-0-375.png`, `table-kumon-cost-bc-0-375.png`, `table-tutor-cost-bc-1-375.png`, `table-bc-proficiency-scale-0-375.png`, `table-kumon-alternatives-0-1440.png`.
2. **Pass.** No horizontal page overflow: `scrollWidth == clientWidth` on /resources and all 5 guides at 375 and 1440. Full-page shots: `hub-375.png`, `hub-1440.png`, `<slug>-375.png`, `<slug>-1440.png`.
3. **Pass.** Keyboard focus: Tab reaches the Grade 1 tile in 3 presses and the first guide card in 7 more. Both show the global 2 px sky `:focus-visible` outline with a 3 px offset. Evidence: `focus-res-grades-375.png`, `focus-res-card-375.png`.
4. **Pass (by CSS inspection; browse cannot emulate the media query).** Reduced motion: `base.css` turns off all transitions and animations and forces `.rise` visible. `article.css` turns off the card and tile hover lifts.
5. **Note, no defect.** The cookie banner shows half-faded in the first full-page captures, because it is fixed and fading in. The captures were taken again after "Reject optional cookies". The "N" badge at bottom left is the Next.js dev indicator, dev only.
6. **Note.** At 1440 the "BC school guides" group has 2 cards in a 3-column grid, so one slot is empty. Left as is.

## Decisions for Savar

1. **Mental-health FAQ.** It now asks "How do I know if daily practice is too much for my child?" and no longer targets the exact search "is kumon bad for mental health". Restore the brand wording only if the search value is worth the brand-harm risk (D-006).
2. **Unica rows in the Kumon price table** (`kumon-cost-bc`). They are labelled "prices only", but a franchisee could read a CAD 59 vs $180-$260 table as a "cheaper" framing of different services. Keep or remove.
3. **Mathnasium sources.** "Math only" now rests on Mathnasium's franchise site. The North Vancouver facts rest only on the orchestrator's browser read, because mathnasium.com blocks scripts. Confirm both in a browser before launch.
4. **Kumon centre prices** could not be fetched again (403). They rest on the 2026-10-09 browser read.
5. **Shared CSS change.** The table change in `article.css` affects all 14 guides. Tables with 3 or fewer columns no longer scroll on phones.
