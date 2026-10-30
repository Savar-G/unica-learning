# Workbooks: context for the generator

What a Unica workbook is, what the generator reads, when it runs, and the rules it follows. The look of every page is in
[`DESIGN.md`](DESIGN.md) beside this file. Product spec: #296 (generator), #297 (Maya), #295 (platform). Decisions:
D-186 to D-189 in `.design/decisions.md`.

Sources, newest first:
- Savar, 2026-10-30 (this file's decisions, D-186 to D-189).
- Cedric's generator context, 2026-10-30: [`samples/cedric-generator-context-2026-10-30.md`](samples/cedric-generator-context-2026-10-30.md).
- The four sample workbooks, built by hand in Figma (Oct 27 to 30): [`samples/`](samples/) and the FigJam board
  "Personalized Learning, Delivered", page **Workbook design** (Leah `228:128`, Mateo `267:131`, Ava `365:182`,
  Ethan `368:648`; the full 10-day Leah book `196:104` is older). **Mateo is the style reference.**
- The curriculum skeleton (AI draft, not reviewed): [`samples/curriculum-skeleton.xlsx`](samples/curriculum-skeleton.xlsx).
- The BC skill map in code: `src/lib/assessment/skill-map.ts` (K to 9, 533 skills; admin view `/admin/skill-map`) and the
  public curriculum page `/curriculum`.

When these disagree, this file says which one wins and why (section 9).

## 1. What a workbook is

- **One workbook = 10 practice days**, five days a week over a two-week family cycle. One workbook is mailed every two
  weeks.
- **Page order:** Cover, then How + Plan, then Day 1 to Day 10. The PDFs in `samples/` stop after Day 3 (they are short on
  purpose); a real workbook always has all 10 days.
- **Pages a day by level (D-186, from Cedric's notes):**

| Levels | Band | Pages a day | Daily time target |
|---|---|---|---|
| U1 to U3 (Kindergarten) | Early | 4 to 6, parent-led | 15 to 20 min |
| U4 to U9 | Early | 10 to 12 | 20 to 25 min |
| U10 to U18 | Middle | 8 to 10 | 25 to 30 min |
| U19 to U30 | Upper | 6 | 30 to 35 min (U25 and up: 30 to 40 min) |

  So a full workbook is about 62 pages (6 a day) to 122 pages (12 a day), plus the cover and the plan page. The samples
  used 8 a day for Ava (U5) and Mateo (U19) only because they are samples.
- **Print:** US Letter, colour. The PDFs are padded with blank pages to a multiple of 4 for saddle stitch. Binding is not
  decided (section 10).

## 2. Levels and curriculum

- **30 levels, U1 to U30**, built from the BC Mathematics curriculum, Kindergarten to Grade 9. About three levels per
  grade: K = U1 to U3, Grade 1 = U4 to U6, ... Grade 9 = U28 to U30 (the skeleton's Levels tab has every level's title,
  units and skills).
- **Never show a school grade** on a workbook, to the child or anywhere on the page. The cover shows "Level U<n>" and the
  level's title. Parents may be told once, overall, that U1 to U30 cover K to Grade 9.
- **Layers:** level, then unit (one BC standard, code like `3.3`), then skill (skill-map id like `3.3-add-within-1000`),
  then step (3 to 5 small increases in difficulty inside a skill). The skeleton's "Grade 3 steps" tab is the only step
  breakdown so far (Levels 10 to 12), with number ranges and expected mistakes.
- **The child's curriculum decides the content.** Every skill, unit and level is tied to a curriculum. Today only BC
  exists (the skill map, the bank and the skeleton are all BC), and only BC families can buy. The generator takes the
  curriculum as an input and refuses a curriculum it has no map for; other provinces are added as their own maps later,
  never mixed into BC's.
- **Grade 9 rule (D-153):** Levels U28 to U30 are reached only by passing the U27 level test. Placement never starts a
  child above U27.

## 3. When the generator runs (D-188, D-189)

Every run makes a **draft**. A team member reviews it in admin, fixes or redoes pages, and approves it before print
(#296). Nothing prints without approval.

1. **First workbook.** Drafted automatically when the parent saves a card after the free assessment report. An admin
   button "Prepare first workbook" also works for any child with a finished test. (No AI cost for families who never
   sign up, and the first book is ready to print within days of signup.)
2. **Every next workbook.** Drafted automatically from a **snapshot on calendar day 7** of the current cycle, about 70
   to 75% through the book, so the next one ships before the current one runs out. It reads three things:
   - **Markings:** the scanned and marked pages so far (the first try is the score; errors the child already fixed in
     the app don't carry over to Fix it).
   - **The assessment and the child profile:** the original free assessment plus the per-child profile (#303, #304),
     which markings and Maya calls keep updating. **The child takes no new test between workbooks** (D-189); the only
     test is the level test at the end of each level, printed inside the workbook.
   - **Maya usage:** which questions the child called about, how much help they needed (hint level, answer given), and
     what they got right after help (learning events from calls, #302, #321). Right only with help counts as not yet
     secure.
3. The admin button can also prepare any next workbook by hand (for example after a missed scan).

## 4. What goes into one workbook (selection)

- **Two units in parallel:** a main unit (A) from the child's level, and an independent second unit (B), usually an
  earlier gap from the assessment. About 8 new steps a workbook.
- **Pages per skill** = importance (Core 3, Standard 2, Minor 1) times difficulty (x1, x1.5, x2), from the skeleton.
- **Review share** ramps with the level: 10% at U1 to U3 up to 35% at U22 to U30 ("Remember these?" spaced review of
  older skills, mixed sets, Fix it spare room).
- **Step mastery** (when building the next workbook, from the snapshot):

| Result on a step | Next workbook |
|---|---|
| 90% or more, within the time target | Next step |
| 75 to 89%, or accurate but slow | Repeat the step with new numbers |
| Below 75% | Go back a step and re-teach |
| Same mistake 3 or more times | A focused page on that mistake |
| Spaced review below 80% | The skill comes back |

- **Fix it** carries over between workbooks, not between days. Workbook 1 has none. From workbook 2, Fix it holds **new
  questions with fresh numbers** on skills the child got wrong in the previous workbook, up to the day-7 snapshot. They
  sit on page 1 of Days 1 to 5; spare room becomes spaced review. The box shows only a "FIX IT" chip.
- **Context grows with level:** U1 to U9 one-step picture stories; U10 to U18 two-step stories where the child picks the
  operation; U19 and up add a "Math in the world" page on Days 4 and 9 (one multi-step real task). Every level test has
  a context item.
- **New idea order:** up to U18 the worked example comes first, then the child tries. From U19 a short "Try this first"
  comes before the worked example.
- **Special days:** Day 5 and Day 10 each have a Friday 5. Day 10 is "Show what you know" (a review of all ten days).
- **Level test:** only in the last workbook of a level (skeleton): Days 1 to 6 normal with extra mixed review of every
  unit, Day 7 the level test in one sitting with no hints, Day 8 light, Days 9 and 10 mixed practice. Pass: 90% or more
  with no unit below 80% within time; pass with support: 80 to 89% or one weak unit; not yet: below 80% (a review
  workbook, then retest the missed units).

## 5. The day: page by page

The 8-page day (Leah, Mateo) is the reference. Day templates for other page counts are in `DESIGN.md`.

| Page | Type | Content |
|---|---|---|
| 1 | Warm-up | Fact practice (no timer below U13; from U16 "beat your own count"), one mental-math item ("In your head"), and the Fix it box from workbook 2 |
| 2 | New idea | A worked example solved **two ways** in a light-blue panel; from U19 "Try this first" before it; then "Now you" |
| 3 | Practice | Faded: watch one, finish two, then on your own |
| 4 | Practice 2 | More practice, one "Solve it two ways" item and one Spot the error item |
| 5 | Word problems | About 3 stories, each with work space, an answer box and one "How do you know?" |
| 6 | Unit B | A reminder panel, then practice on the second unit |
| 7 | Remember these + Mixed set | Spaced review of older skills, then stories where the child ticks the operation |
| 8 | Challenge | 4 cards in a 2 by 2 grid |

Six-page days (U19 and up, Ethan) compress these: Warm-up, New idea, Practice, Word problems (or Math in the world),
Unit B, Remember these + Mixed set + 2 Challenge cards.

## 6. Items and answers (what marking and Maya read)

- **Every answer goes in a box** (at least 40 px tall; 56 px at Kindergarten). Work space is a plain empty box ("SHOW
  YOUR WORK"). There is no answer key in the book.
- **Choices are tick boxes**, never pills: 20 px squares in a light grey strip, with a printed "Tick one ☑" example. The
  instruction always names the choices: "Tick yes or no.", "Tick prime, composite or neither."
- **Mixed set item:** the story, then ① "Tick the operation:" (+ or −; +, −, × or ÷ once the child's levels have taught × and ÷, from U11), then ② "Write the
  answer:" with an answer box and "Show your work".
- **Response types the item schema must cover:** number in a box; several boxes for one item (tens and ones, ordering,
  missing numbers, two ways to make 12); tick one; tick plus number (mixed set); a short written reason ("How do you
  know?", not scored by code); worked steps in a work box; spot the error (find and fix a wrong worked solution); solve
  it two ways; young levels: "Circle the group with more" picture choices.
- **Every answer item has a number (D-187).** Most items already do; the generator also numbers grids that the samples
  left bare (for example Ava's warm-up). With the printed page number (below), a child can tell Maya "page 23, number 4".
- **Nothing on a day page tells the child to scan or call the Teaching Assistant** (Cedric's review note on Mateo). The
  How + Plan page explains scanning, the Teaching Assistant and Fix it once.
- **The first try is the score.** The parent scans after the day's pages; the app shows only which answers are wrong;
  the child tries to fix them first, then Maya explains. Maya never reveals an answer before the child's own fix attempt.
- **What Maya needs from each page:** the child, workbook, day and page; each item's skill, step, correct answer and the
  child's answer; whether the child already tried to fix it; and the worked example and representation used on that
  day's New idea page, so she explains the same way the page did (blocks, number line, two ways).

## 7. Page identity (D-187)

- Each page prints, in the footer: the **QR code** (left), the **page ID** text beside it, the **book page number**, and
  the "Unica Learning" wordmark (right).
- **Page ID text:** `UL·<CHILD>·W<nn>·D<nn>·P<n>` (child's first name in capitals, workbook number, day, page of the day),
  for example `UL·LEAH·W03·D04·P1`. Cover and plan pages: `UL·LEAH·W03·COVER`, `UL·LEAH·W03·HOW+PLAN`. The samples print
  `SAMPLE` in place of `W<nn>`.
- **The QR code** encodes the page's private token URL `https://unicalearning.com/tutor/p/<token>` (#301, #309), which
  the desk and the app open. The printed ID is for people; the token is for machines.
- **Book page number:** counts from the cover (page 1) through the whole book, the same numbers the plan page lists
  ("Day 1, pages 3 to 10"). Question numbers restart on each page.
- **Corner scan marks** on every page help the app straighten photos.

## 8. Copy rules for workbook pages

- Plain, short sentences a child can read. Child-facing text at least 13 px (Grade 1 levels at least 18 px; Kindergarten
  body at least 20 px).
- The child's first name appears on the cover ("Made for Ava"), the plan heading, and in a few stories. No last names.
- Canadian English: "Mom" (not "Mum"), metre, litre, colour, centre. The samples say "Mum" in places; generated books
  say "Mom".
- Never a school grade. Never a competitor's name. No scan or Teaching Assistant prompts on day pages.
- Money in Canadian dollars and cents (no pennies: cash rounds to 5 cents).

## 9. Where the sources disagree, and what wins

| Topic | Cedric's notes | Skeleton | Samples | Decision |
|---|---|---|---|---|
| Pages a day, U1 to U3 | 4 to 6, parent-led | 10 to 12 | none | Cedric's notes (D-186) |
| Pages a day, U4 to U9 | 10 to 12 | 10 to 12 | Ava U5: 8 | 10 to 12 (D-186); 8 was sample-only |
| Pages a day, U19 | 6 | 6 | Mateo U19: 8 | 6 (D-186) |
| Review share | 10% ramping to 35% | 25% flat | n/a | Cedric's ramp (newer); check after the first full book |
| Page number on pages | not mentioned | n/a | only "Day 1 · Page 2 of 8" | Add the book page number in the footer (D-187) |
| Numbered items | n/a | n/a | most, not all | Number every answer item (D-187) |
| New ideas a workbook | about 8 new steps | n/a | n/a | About 8 steps (the G4 planner, PR #356, uses 5 and must change) |
| Level test day | Day 10 "Show what you know" in every book | Day 7 of the level's last book | n/a | Both: every book ends with "Show what you know"; the level's last book also has the level test on Day 7 (confirm with Cedric) |
| "Mum" | n/a | n/a | "Mum" | "Mom" |

## 10. Open questions (for Cedric unless marked)

1. **10 to 12-page days (U4 to U9) and 4 to 6-page days (U1 to U3):** no sample shows them. Which pages repeat or are
   added for 10 to 12 (a second practice page, a second word-problem page?), and what does a parent-led K page look like?
2. **Friday 5:** what is it exactly (5 quick review questions on Days 5 and 10?), and where does it sit on the day?
3. **"Show what you know" and the level test:** confirm the rule in section 9.
4. **The design decisions log** ("Unica Learning - Workbook Design Context.md") is mentioned in Cedric's notes but was not
   shared. Please add it to `samples/`.
5. **Markings before the app exists** (Savar): until scanning is built, how do markings reach the day-7 snapshot? Options:
   a team member enters right or wrong per item in admin, or the first workbooks are built from the assessment and Maya
   only.
6. **Pages vs minutes:** wait for real timing (skeleton open question 1).
7. **Binding:** saddle stitch (multiple of 4, as the PDFs) or glued? 82 pages is a thick saddle-stitched book.
8. **One scan or two** for checking self-fixes; and what happens when a child fails a step early in a workbook.
9. **Unit B for Ethan:** Cedric's table says "see Figma"; the sample shows integers as Unit B.
10. **Mrs. Pedersen** (Holy Cross math head) offered to review the context and strategy pages: when?

## 11. What exists in code, and what changes

| Piece | State | Change needed after this file |
|---|---|---|
| Workbook store (#299) | merged | none (pages, questions, boxes, tokens) |
| Answer checker (#306, #307) | merged | multi-box items, tick-one and tick-plus-number items, written reasons marked "not checked by code" |
| Child profile (#303) and AI findings (#304) | merged / in review | none |
| Two-week planner G4 (#308, PR #356) | in review | page types and the day template in `DESIGN.md`; about 8 steps; Fix it on page 1 of Days 1 to 5; Friday 5 on Days 5 and 10; level test on Day 7 of the level's last book; pages a day by band |
| Renderer G5 (#309, PR #352) | in review | real templates come in #310 from `DESIGN.md`; footer with page ID, page number and QR; corner marks |
| Level and step data | not in code | the skeleton's Levels and Units tabs become code (levels, units, skills, importance, pages); steps for every grade (only Grade 3 is drafted) |
| Item templates and strategy/context tags | not in code | number ranges per step; strategy tags (making 10, place-value split, compensation, doubles, factor pairs); context templates |
