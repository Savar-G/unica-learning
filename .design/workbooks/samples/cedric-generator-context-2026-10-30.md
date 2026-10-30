# Unica workbooks: how the samples were made (context for the generator and tutor)

For Savar, Oct 30, 2026. Written from the Figma build sessions (Oct 27–30). The generator should produce what these samples show; the tutor needs to understand what is on each page.

**Read this first: none of the four samples was generated.** Claude agents built each page by hand in Figma, using scripts against the Figma Plugin API. A person chose the content for a made-up child profile, and the agents checked the maths by hand. No code pulls from the question bank, and no structured data for these pages exists outside Figma (no JSON of items, no answer keys). So the samples are the **spec for the output**. The generator itself is new work.

---

## 1. Where everything lives

| What | Where |
|---|---|
| Figma board | [Personalized Learning, Delivered](https://www.figma.com/board/fLyAJsC68ezugsmkH3oRGh/) (FigJam), page **Workbook design** |
| Full two-week workbook (82 pages) | Section **V7 · Leah, Days 1–10** (`196:104`). Note: V7 still has the older day-to-day Fix it and the "Stuck?" cue, so use the samples for current rules. |
| Sample workbooks (Days 1–3 each) | Leah `228:128` · Mateo `267:131` · Ava `365:182` · Ethan `368:648` |
| Print-order copies | Figma pages "Print · <Name> sample" |
| Print PDFs | `Print files/Unica sample - <Name>.pdf` (letter size, padded with blank pages to a multiple of 4 for saddle stitch) |
| Curriculum | `Unica Learning - Curriculum Skeleton.xlsx`: tabs Levels, Units & skills (541 BC skills with requires, importance, difficulty, response type), Grade 3 steps (worked step breakdown with expected mistakes), Workbook format, Mastery & tests, Open questions |
| Design decisions log | `Unica Learning - Workbook Design Context.md` |
| Question bank (assessment) | site repo `src/lib/assessment/bank/` (grades 1–7, plus K/8/9 from PR #288), `skill-tags/` |

## 2. The four samples

| Child | Level | Grade (internal only) | Pages a day | Unit A (main) | Unit B (parallel gap) |
|---|---|---|---|---|---|
| Ava | U5 | 1 | 8 | Early addition and subtraction, picture stories | earlier counting/number gap |
| Leah | U10 | 3 | 8 | Subtraction with trades (borrowing) | Patterns |
| Mateo | U19 | 5–6 mix | 8 | Multiples, common multiples, prime and composite | Decimals: compare, order, add and subtract to thousandths |
| Ethan | U23 | 7 | 6 | Circles: circumference and area | (see Figma) |

Each sample = Cover + How + Plan page + Days 1–3 (full workbooks have 10 days).

## 3. Workbook structure (rules the generator must follow)

**Cycle:** one workbook = 10 practice days over a two-week family cycle (5 days a week). The next workbook is built from a snapshot on calendar day 7.

**Pages a day by level band:** U1–U3 4–6 (parent-led) · U4–U9 10–12 · U10–U18 8–10 · U19–U30 6. (Ava and Mateo used 8 as samples.) Pages per skill = Importance (3/2/1) × Difficulty (×1/×1.5/×2). Review share ramps from 10% (U1–U3) to 35% (U22–U30).

**Two units in parallel:** a main unit (A) and an independent second unit (B), usually an earlier gap from the assessment. About 8 new steps a workbook.

**Page order:** Cover, then How + Plan, then Day 1 … Day 10.
- **Cover:** "Made for <Name>", "Level U<n>" and the level title. Never a school grade, anywhere.
- **How + Plan:** a 10-day schedule (day, both topics, page numbers) plus four short How points: scanning, the Teaching Assistant, and Fix it explained once.
- **Day page template (8-page day, Mateo/Leah):**

| Page | Type | Content |
|---|---|---|
| 1 | Warm-up | Fact practice (no timer below U13; from U16 "beat your own count"), one mental-math item, and the **Fix it** box from workbook 2 |
| 2 | New idea | A worked example in a light-blue panel, solved **two ways**. From U19 a short "Try this first" comes before it. |
| 3 | Practice | Faded: watch one, finish two, then on your own |
| 4 | Practice 2 | More practice, one "Solve it two ways" item and one **Spot the error** item |
| 5 | Word problems | About 3 stories, each with work space, an answer box and one "How do you know?" |
| 6 | Unit B | A reminder panel, then practice on the second unit |
| 7 | Remember these + Mixed set | Spaced review of older skills, then stories where the child picks the operation |
| 8 | Challenge | 4 cards in a 2×2 grid |

Six-page days (U19+, Ethan) compress these steps. From U19, Days 4 and 9 swap a practice page for a **"Math in the world"** page: one multi-step real task with room to plan. Ethan's Day 3 shows one. Day 5 and Day 10 have a Friday 5; Day 10 is "Show what you know".

**Context grows with level:** U1–U9 use one-step picture stories. U10–U18 use two-step stories where the child chooses the operation. U19+ adds Math in the world. Every level test has a context item.

**Fix it** carries over between workbooks, not between days. Workbook 1 has none. From workbook 2, Fix it holds **new questions with fresh numbers** on skills the child got wrong in the previous workbook, up to the day-7 snapshot. Errors the child already fixed in the app don't carry over. The questions are spread over page 1 of Days 1–5, and any spare room becomes spaced review. The box shows only a "FIX IT" chip.

## 4. Item and answer formats (what the scanner/tutor will see)

- **Every answer goes in a box** (≥ 40 px tall; ≥ 56 px at Kindergarten). Work space is a plain empty box ("SHOW YOUR WORK"). There is no answer key in the book.
- **Choices are tick boxes**, never pills. The boxes are 20 px squares in a light grey strip, with a printed "Tick one ☑" example. The instruction always names the choices: "Tick yes or no.", "Tick prime, composite or neither."
- **Mixed set item:** the story, then ① "Tick the operation:" (+ or −, or +, −, × or ÷ by level), then ② "Write the answer:" with an answer box and "Show your work".
- Young levels: "Circle the group with more" picture choices.
- **Response types to model:** number in a box, tick-one choice, tick + number (mixed set), short written reason ("How do you know?"), worked steps in a work box, spot-the-error (find and fix a wrong worked solution), solve it two ways.
- **Page ID** in each footer, e.g. `UL·MATEO·SAMPLE·D02·P4`, next to a QR code (a placeholder for now). The real format should encode child · workbook · day · page (V7 used `UL·LEAH·W03·D04·P1`). Corner marks on every page help the app straighten photos.
- Nothing on a day page tells the child to scan or call the Teaching Assistant. The parent scans after the day's pages are done. The app shows only which answers are wrong, the child tries to fix them first, and then the Teaching Assistant explains. **The first try is the score.**

## 5. Visual rules (so generated pages match)

- Letter 8.5×11 in (Figma frame 816×1056, 64 px margin). Fonts are Geist and Geist Mono.
- Page types have colours: New idea #2453D4 on #EAF0FF, Practice #0B7A4F, Word problems #C2410C, Review #8A6500, Challenge chip #FFF0B8 with a dark border. The header is plain text in the type colour.
- Child-facing text is ≥ 13 px (Grade 1 ≥ 18 px, K body ≥ 20 px), writing lines are ≥ 34 px apart, and line-height is 1.4. Every page fills to the same bottom edge, with nothing overflowing.
- Clarity comes from instructions and structure, not bigger elements.

## 6. How the samples were actually built (process)

1. Pick a child profile: level, main unit, a gap for unit B, and pages a day.
2. Clone the closest template frame from Mateo's sample, which is the style reference. Keep the header and footer, clear the body, and fill a vertical auto-layout content area (688×718 px) with blocks.
3. Hand-write each item for that day's step, using the step order from the skeleton (the "Grade 3 steps" tab shows the breakdown, with number ranges and expected mistakes).
4. Screenshot every page and check fit, overflow and maths.

Build notes for each sample are in Claude's scratchpad specs; ask Cedric if you want them.

## 7. What the generator needs that doesn't exist yet

1. **A page and item schema.** Machine-readable items with skill id, step, item type, the correct answer, accepted variants, the expected wrong answers with their misconception ids, and the box position on the page. The scanner, the marker and the tutor all depend on it.
2. **Item templates** in the question bank, with number ranges per step, plus **strategy tags** (making 10, place-value split, compensation, doubles, factor pairs) and **context templates**, so strategies and contexts recur. Mrs. Pedersen (Holy Cross math head) offered to review the context and strategy pages.
3. **Selection logic** that turns the learner profile into a workbook: which steps, how many pages each (importance × difficulty), the review share, unit B choice, Fix it items from the last workbook's day-7 snapshot, and the Day 4/9 and Day 5/10 special pages.
4. **A layout renderer** (HTML/PDF) that reproduces the templates above. Figma was only the design tool.
5. Real QR codes that encode the page ID.
6. **Open decisions:** pages vs minutes (wait for real timing), one scan or two for checking self-fixes, binding, and how to handle a step the child fails early in a workbook.

## 8. What the tutor needs from each page

For any scanned page, the tutor should be able to look up:
- the child, the workbook, the day and page,
- each item's skill and step, the correct answer, and the child's answer,
- whether the child has already tried to fix it,
- the worked example and representation used on that day's New idea page, so it explains the **same way the page did** (blocks, number line, two ways).

The tutor should not reveal answers before the child's own fix attempt.
