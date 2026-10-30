# Workbooks: context for the generator

What a Unica workbook is, what the generator reads, when it runs, and the rules it follows. The look of every page is in
[`DESIGN.md`](DESIGN.md) beside this file. Product spec: #296 (generator), #297 (Maya), #295 (platform). Decisions:
D-186 to D-192 in `.design/decisions.md`.

## Sources, in the order they win (D-192)

1. **Savar's decisions** (D-186 to D-192).
2. **The curriculum skeleton**, the source of truth for every rule (levels, skills, pages, the day, mastery, tests,
   placement): [`samples/curriculum-skeleton.xlsx`](samples/curriculum-skeleton.xlsx), round 2, updated by Cedric on
   2026-10-30. When this file and the skeleton disagree, the skeleton wins and this file is out of date.
3. **Cedric's generator context**, 2026-10-30:
   [`samples/cedric-generator-context-2026-10-30.md`](samples/cedric-generator-context-2026-10-30.md).
4. **The four sample workbooks**, built by hand in Figma (Oct 27 to 30), for the **look** only, never for counts or
   rules: [`samples/`](samples/) and the FigJam board "Personalized Learning, Delivered", page **Workbook design** (Leah
   `228:128`, Mateo `267:131`, Ava `365:182`, Ethan `368:648`; the full 10-day Leah book V7 `196:104` is older). **Mateo
   is the style reference.** The PDFs stop after Day 3 on purpose; a real book has 10 days.
5. **Cedric's design log**, gathered Oct 27 to 29: [`samples/workbook-design-log-2026-10-29.md`](samples/workbook-design-log-2026-10-29.md).
   The oldest; it loses to everything above.

Also: the BC skill map in code, `src/lib/assessment/skill-map.ts` (K to 9; admin view `/admin/skill-map`), and the
public curriculum page `/curriculum`.

## 1. What a workbook is

- **One workbook = 10 practice days**, five days a week over a two-week family cycle; one workbook is mailed every two
  weeks. The program runs all year, summer included, and never pauses on its own (section 4.10).
- **Book order:** cover, How + Plan page, Day 1 to Day 10, back cover (the level map), then blank pages to a multiple
  of 4.
- **Pages a day (D-186), capped at 8 for now:**

| Levels | Band | Pages a day | Who leads | Daily time target | Level test |
|---|---|---|---|---|---|
| U1 to U3 | Early | 4 to 6 short pages | Parent-led: the parent reads every instruction aloud | 15 to 20 min | 15 to 20 min, two parts if needed |
| U4 to U6 | Early | 8 | Parent-supported: icon instructions, the parent reads on request | 20 to 25 min | 20 to 25 min |
| U7 to U9 | Early | 8 | Child-led | 20 to 25 min | 20 to 25 min |
| U10 to U15 | Middle | 8 | Child-led | 25 to 30 min | 30 to 35 min |
| U16 to U18 | Middle | 8 | Child-led | 25 to 30 min | 35 to 40 min |
| U19 to U24 | Upper | 6 | Child-led | 30 to 35 min | 40 to 45 min |
| U25 to U30 | Upper | 6 | Child-led | 30 to 40 min | 45 to 50 min |

  Time targets are typical, not limits; pages times minutes does not match them in most bands, and that stays until
  real children are timed (skeleton open question 1).
- **Size of a book:** at 8 a day, cover + plan + 80 day pages + back cover = 83, padded to **84 (the maximum)**; at 6 a
  day, 63 padded to 64.
- **Print and binding (D-191):** US Letter, colour, **saddle stitch**; blank pages go **at the end**.
- **Workbooks per grade:** Kindergarten 8, Grades 1 and 2: 10, Grades 3 to 5: 12, Grades 6 to 9: 14 (120 in all),
  split across each grade's three levels by page share (2 to 6 per level, usually 3 to 5). Planning averages, not
  limits: mastery adds practice where a child needs it.

## 2. Levels, curriculum and placement

- **30 levels, U1 to U30**, from the BC Mathematics curriculum, Kindergarten to Grade 9: K = U1 to U3, Grade 1 = U4 to
  U6, ... Grade 9 = U28 to U30. Written "Level U12", "Levels U1-U9", or "U12" where space is tight.
- **Never show a school grade** to a child or on any page. Parents may be told once that U1 to U30 cover K to Grade 9,
  and a rough grade range per group of levels on the website.
- **Layers:** level, unit (one BC standard, e.g. `3.3`), skill (skill-map id, e.g. `3.3-add-within-1000`), step (3 to 5
  small increases in difficulty inside a skill). The BC skill id is the stable key. Position codes (U12.3.2.4 = level
  U12, unit 3, skill 2, step 4) are for the builder, page data and reviewers, never for a child or parent, and change
  when a unit moves.
- **541 skills** (K 59, Grade 1 55, Grade 2 55, Grade 3 44, Grade 4 43, Grade 5 48, Grade 6 56, Grade 7 61, Grade 8
  71, Grade 9 49). Each skill has: importance (Core, Standard, Minor), difficulty (1 to 3), **delivery** (new-step,
  warm-up, activity, parent-checked), **response type** (write-number, circle, match, colour-or-shade, draw,
  number-line, fill-table, show-work, write-words, hands-on), and **scorable** (whether the app can mark it from a
  scan). These decide the page layout and what marking must handle. Steps are drafted only for Grade 3 (U10 to U12),
  each with a representation, expected mistakes and a spot-the-error item.
- **The child's curriculum decides the content.** Every level, unit and skill belongs to a curriculum. Today only BC
  exists and only BC families can buy. The generator takes the curriculum as an input and refuses one it has no map
  for; other provinces come later as their own maps, never mixed into BC's.
- **Placement from the free assessment:** the start level is the lowest level that holds a BC standard the assessment
  did not find secure, at or below the child's working grade. Units in that level already secure go straight to the
  Review slot; the first workbook starts at the first non-secure unit. Where the assessment has no questions for a unit
  (about half the skills in K to Grade 2 and Grades 7 to 8), the first workbook's Review slot carries a 4-item check for
  that unit before it counts as secure.
- **Kindergarten:** the assessment does not serve K yet. A K child starts at U1; the first workbook carries a 2-page
  parent-led "Already know it?" check per unit, and units it passes move to review.
- **Ceiling:** never above U27 (D-153); U28 to U30 only by passing the U27 level test. Grade 8 placement needs the
  assessment widened to Grade 8 (not built).

## 3. When the generator runs (D-188, D-189)

Every run makes a **draft**. A team member reviews it in admin, fixes or redoes pages, and approves it before print
(#296). Nothing prints without approval.

1. **First workbook:** drafted automatically when the parent saves a card after the free assessment report; an admin
   button "Prepare first workbook" also works for any child with a finished test. Built from the assessment, the
   placement rule above and the child profile.
2. **Every next workbook:** drafted automatically from a **snapshot on calendar day 7** of the current cycle (about 70
   to 75% through), so it ships before the current one runs out. It reads:
   - **Markings:** scanned and marked pages so far (the first try is the score; errors the child already fixed in the
     app don't carry over to Fix it). Unfinished pages are scanned whenever they are done; unfinished steps carry over.
   - **The assessment and the child profile:** the original free assessment plus the per-child profile (#303, #304),
     kept current by markings and calls. **The child takes no new test between workbooks** (D-189); the only test is
     the level test in a level's test workbook.
   - **Maya usage:** calls and the practice problems Maya set after them count as evidence for step mastery alongside
     the scans (help level, answer given; right only with help is not yet secure).
3. The admin button can prepare any next workbook by hand (for example after a missed scan).

## 4. What goes into one workbook

### 4.1 Units and steps
- **Two units in parallel:** a main unit (A) and a second unit (B) from the same level, about 2 pages of A to 1 of B
  each day. A step in B never depends on a step of A in the same workbook, so a step failed early in A does not block
  the fortnight. The builder pairs the next A unit with the next independent B unit (the Levels tab lists each level's
  units in dependency order).
- **At most 8 new steps a workbook** (A and B together). The rest of the pages consolidate.

### 4.2 Pages per skill
- Weight = importance (Core 3, Standard 2, Minor 1) times difficulty (1: x1, 2: x1.5, 3: x2); a grade's skill pages are
  split by weight (largest remainder, at least 2). Warm-up skills (fact fluency) get no step pages and live in the daily
  warm-up; activity skills (hands-on, unscored) get 1 page.

### 4.3 Review share
| Levels | Share held for review, Fix it, warm-up, Friday 5 and tests |
|---|---|
| U1 to U3 | 10% |
| U4 to U6 | 15% |
| U7 to U9 | 20% |
| U10 to U18 | 25% |
| U19 to U21 | 30% |
| U22 to U30 | 35% |

### 4.4 Spaced review ("Remember these?")
- A step passed at 90% comes back after about 2 days, 1 week, 3 weeks and 2 months, 2 to 4 items each time.
- On a miss, the skill goes back to the 2-day interval and the missed item comes back in the next workbook's Fix it.

### 4.5 Step mastery (when the next workbook is built, from scans, calls and set problems)
| Result on a step | Next workbook |
|---|---|
| 90% or more | Next step. Accuracy only: time never gates mastery |
| 75 to 89% | Repeat the step with new numbers |
| Below 75%, 2 or more conceptual errors | Go back a step and re-teach with a different representation |
| Below 75%, careless errors only | Repeat the step and add a "check your work" routine; no re-teach |
| Repeat cap | After 2 repeats of a step, change the approach (another representation, a Maya call set by the app) and tell the parent; never a third identical repeat |
| Same conceptual mistake 3 or more times | A focused page on that mistake (the step's Expected mistakes name it) |
| Spaced review below 80% | The skill comes back on the 2-day interval |

- **Conceptual** = a wrong answer that matches one of the step's expected mistakes (misconception ids from the
  assessment's `misconceptions.ts` where one exists), or the same wrong method on 2 or more items. **Careless** = any
  other single wrong answer. Both count in the step's percentage; only conceptual errors trigger "go back a step" and
  the focused page; careless errors trigger Fix it only.
- **Time:** U1 to U12 no timed pages and no time anywhere; U13 to U15 time recorded and shown to the parent as a band;
  U16 and up the fact warm-up asks the child to beat their own last count, and a time band (Fluent, Getting there, Needs
  more practice: up to and beyond 1.5 times the target) is reported next to the score. Never a gate.

### 4.6 Fix it
- Carries over between workbooks only. Workbook 1 has none. From workbook 2: new questions with fresh numbers on the
  skills the child got wrong in the previous workbook, up to the day-7 snapshot; errors fixed in the app don't carry
  over. Spread over page 1 of Days 1 to 5; spare room becomes spaced review. The box shows only a "FIX IT" chip.

### 4.7 Thinking, explaining and context
- **Each workbook:** at least 2 "How do you know?" or "Which answer is wrong, and why?" items; at least 1 estimate-before-
  you-solve item; 1 spot-the-error item on every New idea day. Explanations are parent-checked or unscored; they never
  count against mastery.
- **Each level:** at least one context from local or First Peoples sources (for example FNESC, Teaching Mathematics in a
  First Nations Context), written or checked by an appropriate reviewer, **never by AI alone**.
- **Context grows with the level:** U1 to U9 one-step picture stories; U10 to U18 two-step stories where the child picks
  the operation (the Mixed set); U19 and up a weekly **Math in the world** page on Days 4 and 9 that replaces one
  practice page (pages a day unchanged): one longer multi-step real task with room to plan (budgets, phone plans,
  recipe scaling, map scales, sports stats, BC contexts such as ferry fares or ski passes). Every level test has at least
  one context question.
- **Flexible strategies:** worked examples solved two ways ("Method 1", "Method 2"); one "Solve it two ways" item a day;
  one mental-math warm-up item with "How did you work it out?". Question templates get **strategy tags** (making 10,
  place-value split, compensation, doubles, factor pairs) so every strategy recurs (not built yet).

### 4.8 Special days
- **Friday 5 (D-190):** on Days 5 and 10, five retrieval questions from the last 3 weeks of work, no hints. It replaces
  that day's Mixed set.
- **Show what you know (D-190):** Day 10 of every workbook: one of each, and the hardest ones again, framed as a
  celebration, not a test.
- **After a pause of 2 weeks or more:** the next workbook opens with 2 "Remember these?" days before any new step.

### 4.9 The test workbook (the last of a level)
- **When:** built when every unit in the level has reached its last step at 90% or more in the scans, or after the
  level's workbook budget plus 2 workbooks, whichever comes first (the test runs anyway and decides).
- **Days:** 1 to 6 normal with extra mixed review of every unit in the level; Day 7 the **level test** in one sitting
  (U1 to U3: two parts on the same day if needed), every unit, no hints, at least one context question; Day 8 light (no
  new ideas); Days 9 and 10 mixed practice; Day 10 still ends with Show what you know (D-190).
- **Unit judgement:** a unit's result = its test items together with the last two workbooks' accuracy on it; one slip on
  4 to 6 items never makes a weak unit alone. The plan page says the test is done alone; the app asks "Did anyone
  help?" at scan time, and a yes marks the result unsure (the unit stays in review).
- **Results:** Pass (90% or more, no unit below 80%) moves to the next level, with a certificate in the next workbook.
  Pass with support (80 to 89%, or exactly one unit below 80%) moves on, and the weak unit takes the daily Review slot
  for the first 2 workbooks (1 page a day), with a 5-item mini-test in workbook 2 (below 80% adds a focused review set to
  workbook 3; a level is never repeated for one unit). Not yet (below 80%, or two or more units below 80%) gets a review
  workbook on the missed units, then a half-length retest on its Day 7.

### 4.10 Breaks
- No automatic pause, not even in summer or the winter break. A parent can ask in the app for a pause in whole weeks, at
  least 5 days before the next workbook prints, up to 8 weeks a year; the mailing date and the next charge shift by the
  same weeks. Illness or a busy week: no pause unless asked; the next workbook is built from what was scanned.

### 4.11 Keeping children going
- **Back cover:** the level map, 30 squares (no grades); the child colours the current one. The same map is in the app.
- **Certificate:** mailed with the first workbook of a new level, with the level's title.
- **Cover parent line:** one sentence for the parent: what to ask the child to show them this fortnight.
- **Plan page:** a tick box per day.

## 5. The day

The parts of a day, in order (skeleton, "A normal day"), and the levels they appear at:

| Part | What it is | When |
|---|---|---|
| Warm-up | 2 to 3 minutes of fact practice from the grade's fluency unit; never timed below U16, from U16 "beat your own count"; one mental-math item with "How did you work it out?" | Every day from **U8** |
| Fix it | Section 4.6 | Page 1 of Days 1 to 5, from workbook 2 |
| Try first | One problem of the new idea before it is taught; not marked for mastery | U19 and up, on a day that starts a new step |
| New idea | The worked example in the step's representation, solved two ways ("Method 1", "Method 2"), then one spot-the-error item | Only on a day a new step starts |
| Practice that builds | Faded: a full example, 2 half-finished problems, then problems on their own, getting harder | Every day |
| Word and picture problems | The same idea in stories and pictures; at least one "How do you know?" | Every day (U19 and up: Math in the world on Days 4 and 9) |
| Review | Unit B, or an earlier skill on its spaced schedule ("Remember these?") | Every day |
| Mixed set | 3 to 4 problems where the child chooses the operation: "1 Tick the operation", "2 Write the answer" | Every day from **U10**; Days 5 and 10: Friday 5 instead |
| Friday 5 | Section 4.8 | Days 5 and 10 |
| Challenge | 1 to 2 challenge problems | Every day |

How these parts sit on 8 and 6 pages is in `DESIGN.md` section 7 (from the samples: warm-up, new idea, practice,
practice 2, word problems, unit B, remember these + mixed set, challenge).

## 6. Items and answers (what marking and Maya read)

- **Every answer goes in a box** (at least 40 px tall; larger at U1 to U3). Work space is a plain empty box ("SHOW YOUR
  WORK"), never dots. No answer key in the book (the app shows solutions after marking).
- **Choices are tick boxes**, never pills: 20 px squares in a light grey strip with a printed "Tick one ☑" example. The
  instruction always names the choices ("Tick yes or no.", "Tick prime, composite or neither.").
- **Mixed set item:** the story, then "1 Tick the operation:" (+ or −; or +, −, × or ÷ by level), then "2 Write the
  answer:" with an answer box and a "Show your work" box.
- **Solve it two ways:** one item a day on a practice page; heading "Solve it two ways"; two boxes labelled "Method 1"
  and "Method 2", then the answer box.
- **Response types the item schema must cover:** the skeleton's list (write-number, circle, match, colour-or-shade,
  draw, number-line, fill-table, show-work, write-words, hands-on) plus: several boxes for one item (tens and ones,
  ordering, missing numbers, two ways to make 12); tick one; tick plus number (Mixed set); written reasons (unscored);
  spot the error; solve it two ways. Each item records whether it is **scorable** from a scan; hands-on and drawing
  items are parent-checked or unscored.
- **Every answer item has a number (D-187)**, so a child can tell Maya "page 23, number 4".
- **Nothing on a day page tells the child to scan or call the Teaching Assistant** (removed Oct 29). Families learn
  both at onboarding and on the How + Plan page.
- **Corrections:** the parent scans after the day's pages; the app marks them the same day and shows only which answers
  are wrong; the child tries to fix them first; then Maya explains. **The first try is the score.** When a step is below
  75% that day, the app offers a Maya call that evening, and Maya sets 3 practice problems after it.
- **What Maya needs from each page:** the child, workbook, day and page; each item's skill, step, correct answer and the
  child's answer; whether the child already tried to fix it; and the step's representation and expected mistakes, so
  page, call and parent explain the same way.

## 7. Page identity (D-187)

- Each page's footer: the **QR code** (left), the **page ID** with the **book page number** under it, and the wordmark
  (right). Four corner scan marks on every page help the app straighten photos.
- **Page ID text:** `UL·<CHILD>·W<nn>·D<nn>·P<n>` (child's first name in capitals, workbook, day, page of the day), for
  example `UL·LEAH·W03·D04·P1`; cover and plan `UL·LEAH·W03·COVER`, `UL·LEAH·W03·HOW+PLAN`. The samples print `SAMPLE`
  in place of `W<nn>`.
- **The QR code** encodes the page's private token URL `https://unicalearning.com/tutor/p/<token>` (#301, #309). The
  printed ID is for people; the token is for machines.
- **Book page number** counts from the cover (page 1) through the book, the same numbers the plan page lists. Question
  numbers restart on each page.

## 8. Copy rules for workbook pages

- Short, plain sentences a child can read. Child-facing text at least 13 px (larger at early levels; DESIGN.md section 2).
- The child's first name on the cover ("Made for Ava"), the plan heading and in some stories. No last names.
- Canadian English: "Mom" (the samples say "Mum"), metre, litre, colour, centre.
- Never a school grade. Never a competitor's name. No scan or Teaching Assistant prompts on day pages.
- Money in Canadian dollars and cents; cash rounds to 5 cents (no pennies).

## 9. Where the sources disagreed, and what won

| Topic | Disagreement | Decision |
|---|---|---|
| Pages a day | Notes: U4 to U9 10 to 12, U10 to U18 8 to 10; samples: 8 or 6 | Skeleton, capped at 8: U1 to U3 4 to 6, U4 to U18 8, U19 to U30 6 (D-186) |
| Page number on pages | Samples print only "Day 1 · Page 2 of 8" | The book page number under the page ID (D-187) |
| Numbered items | Samples number most items, not all | Every answer item numbered (D-187) |
| Level test day | Notes: Day 10 "Show what you know" in every book; skeleton: Day 7 of the test workbook | Both (D-190) |
| Binding | Open in the log | Saddle stitch, blank pages at the end (D-191) |
| Two-ways labels | Samples: "WAY 1", "WAY 2" | "Method 1", "Method 2" (skeleton) |
| Back cover | Log (Oct 28): level map online only | Skeleton: printed level map on the back cover |
| Cover parent line | Log (Oct 28): dropped | Skeleton: one sentence for the parent |
| Plan page tick boxes | Samples: none | Skeleton: a tick box per day |
| Writing line spacing | Notes and log: 34 px apart | Skeleton: at least 36 px below the prompt |
| Mixed set wording | Log: "Operation:" left, "Answer" right | Skeleton and samples: "1 Tick the operation", "2 Write the answer" |
| "Mum" | Samples | "Mom" |

## 10. Open questions

1. **Early days (Cedric):** the skeleton starts the warm-up at U8 and the Mixed set at U10, but Ava's U5 sample has
   both. What fills page 1 at U4 to U7 and page 7 at U4 to U9 (more picture stories, a second Remember these)?
2. **Challenge (Cedric):** the skeleton says 1 to 2 challenge problems a day; the samples give page 8 four Challenge
   cards. Which one?
3. **Parent-led days (U1 to U3, Cedric):** no sample shows one. The skeleton's rules: icon instructions plus a short
   line, answers by circling, matching, colouring, drawing a line or writing one numeral, 6 to 10 items a page, large
   boxes.
4. **Friday 5, Show what you know, the level test, the back cover and the certificate (Cedric):** no sample page yet
   (V7 `196:104` has an older Friday 5 and back cover).
5. **Markings before the app exists (Savar):** until scanning is built, how do markings reach the day-7 snapshot? A team
   member enters right or wrong per item in admin, or the first workbooks use only the assessment and Maya.
6. **Pages vs minutes:** decide from real children's timing (skeleton open question 1).
7. **First Peoples context:** who writes or checks the one-per-level context, never AI alone.
8. **Mrs. Pedersen** (Holy Cross math head) offered to review the context and strategy pages: when?

## 11. What exists in code, and what changes

| Piece | State | Change needed |
|---|---|---|
| Workbook store (#299) | merged | none (pages, questions, boxes, tokens) |
| Answer checker (#306, #307) | merged | multi-box items, tick-one and tick-plus-number items, written reasons marked "not checked by code", the skeleton's response types |
| Child profile (#303) and AI findings (#304) | merged / in review | read calls and Maya's set problems as mastery evidence; careless versus conceptual errors |
| Two-week planner G4 (#308, PR #356) | in review, **to rework** | the day parts and level gates in section 5; at most 8 new steps; units A and B at 2:1; Fix it on page 1 of Days 1 to 5; Friday 5 on Days 5 and 10 replacing the Mixed set; Show what you know on Day 10; the test workbook rules (4.9); review share by level (4.3); spaced intervals (4.4); pages a day 4 to 6, 8 or 6 |
| Renderer G5 (#309, PR #352) | in review | real templates in #310 from `DESIGN.md`; footer with page ID, page number and QR; back cover; padding at the end to a multiple of 4 |
| Level, unit, skill and step data | not in code | the skeleton's Levels and Units & skills tabs become code (with importance, difficulty, delivery, response type, scorable, pages); steps for every grade (only Grade 3 drafted) |
| Item templates and tags | not in code | number ranges per step, strategy tags, context templates |
| Placement | partly | the start-level rule (section 2); the Kindergarten "Already know it?" check; the 4-item checks for thin evidence |
