# Workbook generator fixes from the U4 review

From Cedric, Nov 2, 2026. Based on the first generated workbook (Noah, Level U4, 84 pages). Page numbers below are pages of that PDF.

The short version: the pages read like builder notes, they don't fill the page, and the book doesn't get harder from Day 1 to Day 10. The step progressions file (coming as final JSON) fixes the difficulty part once the generator uses it. The rest is wording and layout.

---

## 1. Difficulty and what each day covers

**Problem.** The plan gave Days 1-5 one skill ("Count forward and back to 20") and Days 6-10 another ("Read and write the numerals to 20"), with likelihood as the second unit on every single day. Questions drift off the page's topic (a "Count to 20" page asks "Find 13 - 2" and "8 + 10"). Page 10 and page 80 are the same difficulty (page 80 is still "7 + 5").

**Fix.**
- Build each workbook as a natural progression through the level's skills and their **steps**, in the skeleton's order. Don't force one topic per block of days or one fixed second unit on every day.
- Each day moves on: new pages start at the next step (or the next skill once a skill's steps are done). Day 10 must be clearly harder than Day 1.
- Pick numbers in code from each step's `numbers` ranges (`min`/`max`, `regrouping`, `values`). Every question on a page must belong to that page's skill and step.
- Use the step's `practice` questions as the model for difficulty and wording, not as fixed copies.
- Review pages ("Remember these?", "Mixed review") draw from skills and steps already done, not new ones.
- Challenge pages use the highest step reached so far, so they also get harder through the book.

## 2. Wording on the page

Use plain, simple English a child and parent understand at a glance. No builder language on any page.

| Where | Now | Change to |
|---|---|---|
| Cover (p1) | "This fortnight, ask Noah to show you one worked example..." and "How this works and your plan are next. 10 days, 8 pages a day..." | Remove both lines. |
| Cover title (p1) | "Numbers to 20 and making 10" | Say what the child will learn, plainly. Pattern: **title** = the topic in plain words, **line under it** = "<Name> will ..." in one sentence. U4: **Numbers to 20**, "Noah will count, read and write numbers up to 20, and learn how numbers split into smaller parts." |
| How page (p2), Stuck | "Call the Teaching Assistant." | "Ask for help using Maya, the AI Teaching Assistant." |
| How page (p2), Fix it | current text | "Anything your child got wrong in the previous workbook comes back as new questions." |
| New idea pages (p4) | "Watch how it works. Then try it." | "Read how it works, then try it." |
| Practice pages | "Watch one. Finish two. Then do the rest on your own." / "Watch one worked out. Then finish two." | One simple instruction, e.g. "Look at the example. Then answer the questions." |
| Challenge pages (p10, p74) | "Two to stretch you." | Title "Challenge", line under it "Test yourself." |
| Second-unit pages | "Unit B: use never." / "Unit A · new step" | Remove. Never show unit letters or skill notes. |
| Spot the error (p20 etc.) | "Sam's work ... Start at 11. Count on 1 ..." with text sounds | Heading **Spot the error**, then the worked line, then "Is it right? ☐ Yes ☐ No", then "If not, fix it: ___". No extra narration. |
| Question numbers | "1 Draw 8 dots." | Number every question as "1.", "2.", "3." so the number can't be read as part of the question. |

- **Every page needs a one-line instruction** under its title.
- **Maya** is the Teaching Assistant's name everywhere (workbook, app, website).

## 3. No "For the grown-up" after Kindergarten

From U4 up there is no parent-facing text on any page (p4, p68). In the curriculum, U4-U6 change from parent-supported to **child-led**; only U1-U3 (Kindergarten) stay parent-led. Please update the `lead` value for U4-U6 when you import.

## 4. Question types

- **No drawing tasks from U4 up.** Remove "Draw likely wind/fog/hail/sun", "Draw a sure thing", "Draw a likely day", "Draw an always / a sometimes" (p49, p64), "Draw 5 eggs", "Draw 4 rocks", "Trace and write 2" (p49, p50). Use writing a number, ticking a box or circling an answer instead.
- **Likelihood** questions: show a picture or a short sentence and have the child tick never / sometimes / always (or more likely / less likely). Use "never" where it fits (p72).
- Use a different format where a page repeats one layout all day (p59).

## 5. Layout

- **Name and Date only on the first page of each day** (U4 book: pages 3, 11, 19, 27, 35, 43, 51, 59, 67, 75). Not on every page.
- **Fill every page.** Pages 3, 11, 43, 47, 50, 54, 55, 56, 57, 62, 63 and 71 leave large empty areas. Order of fixes: first make writing space bigger (answer boxes and "Show your work" boxes about 1.5 times their current height, since young kids write big), then spread items evenly, then add questions until the page is full.
- **Align everything.** Answer boxes in one column at the same x position; question numbers aligned; boxes for stories at the same place in each story card (p49 stories 9 and 10, p65 question 2, p65 questions 9 and 10, p67).
- Even spacing between questions on the whole page (p3 is the worst case).

## 6. Back of the book

- Remove the "My levels" page (p83); that progress view belongs in the app.
- Books are padded to a multiple of 4 pages for stapling. Use every spare page for **extra practice** from the book's steps, never a blank page (p84).

## 7. Second U4 sample (44 pages): what is still wrong

Fixed in the second sample: Name/Date only on day starts, "Read how it works, then try it.", "Test yourself.", Maya on the How page, the Fix it line, the Yes/No + fix-it layout for spot the error, no drawing tasks. Still wrong:

- **Only 5 days** (Days 1, 3, 5, 8, 10; 44 pages). A workbook is 10 days in a row (Day 1 to Day 10), 8 pages a day at U4.
- **Blank pages 43 and 44.** Fill spare pages with extra practice (section 6).
- **Still no step up.** Counting back goes from "3, 2, 1" (Day 1) to "17, 16, ?" (Day 10) and nothing else changes. Challenge pages are the easiest pages in the book (yes/no likelihood). Fix with section 1 and the step files.
- **Likelihood on every day** with the same sentence repeated ("Will a cup hold water when ___ fills it?", "Will ___ see a dog today?"). No fixed second topic (section 1) and the variety rule below.
- **Cover unchanged:** still "Numbers to 20 and making 10" and "Use likelihood words". See section 2.
- **"Is it right? Is it right?"** printed twice in every spot-the-error box.
- **"What's going on" box** squeezed into a one-word-wide column on the likelihood pages; give it the full width or drop it.
- **Page 41 failed to render** (question 8 repeated question 4). The generator should never place the same item twice on a page.
- **Half-empty pages** on most days. The layout spec below replaces "fill the page" with numbers.

## 8. Page layout spec (numbers, so "fill the page" is testable)

Letter page 816 x 1056 px, 64 px margins: content area 688 x 928 px. Header band (Name/Date when shown, day line, title, one-line instruction) at most 150 px; footer band (page id, QR) 48 px; the rest (about 730 px) is the question area and must be used.

**Items per page (U4 to U18, 8 pages a day):**

| Page type | Items | Layout |
|---|---|---|
| Remember these? / Mixed review | 8-10 | two columns |
| New idea | 1 worked example panel (max 260 px) + spot the error + 3-5 practice items | one column, practice in two columns |
| Practice | 8-10 | two columns; "Getting started" 2-4, "On your own" 4-6 |
| Number stories | 3-4 stories | one column, each with a work box |
| Second unit / remember | 1 short reminder panel (max 160 px) + 6-8 items | two columns |
| Challenge | 3-4 | one column, each with a work box |
| Review and Friday 5 | 4-6 review + 5 Friday items | two columns |

For U19 to U30 (6 pages a day) use the same table with about 25% fewer items and bigger work boxes.

**Box sizes (minimums):** answer box 48 x 48 px (56 x 56 at U1-U3); one-line written answer 36 px line height; "Show your work" box 120 px tall at U4-U9, 140 px at U10-U18, 160 px at U19+; ten-frames and number lines at least 40 px per cell.

**Filling rule (run after layout):**
1. Lay out the page's items.
2. If more than 15% of the question area is empty, add one more item from the same step and lay out again (up to the page's max).
3. If still more than 15% empty, spread the remaining space evenly between items (never all at the bottom), up to 48 px extra per gap.
4. If items overflow, move the last item to the next page of the same type, or drop it if it is a duplicate.

**Alignment:** question numbers in a fixed column at the left of each column ("1.", "2.", "3."); answer boxes right-aligned to the column's right edge; in story cards the work box and answer box sit in the same place in every card; two-column pages use equal column widths with a 32 px gutter.

## 9. Variety rule

- No sentence frame used twice on one page, and no more than twice on a day (change the context, not only the name).
- At least 3 different contexts or formats per page (bare numbers, a short story, a ten-frame or number line, a missing number, true or false).
- Never the same item twice in a workbook (this caused the page 41 render failure).
- Challenge pages take items from the hardest step reached so far that day, never from an easier step than the practice pages.

## 10. The step files (what's in the JSON)

File: "Unica Learning - Step Progressions K-9 (generator format).json". 1,622 steps for every skill K to Grade 9, in the CurriculumStep shape from workbook-curriculum/types.ts, plus these optional fields:

- `numbers`: number ranges per slot (`{ "operand1": { "min": 1, "max": 10 }, ... }`), plus `regrouping` and `values` where they matter. 36 steps without numbers (shapes, position words) have none.
- `practice`: 6 questions per step (2 easy, 2 medium, 2 hard), each `{ problem, answer, difficulty }`. 9,732 in all. Use them as models, not as fixed questions.
- `templates`: 4 to 6 per step, 7,321 in all, for making new questions. Each is `{ format, difficulty, text, answer, slots, check?, derived? }`.
- `calibration`: the source each step was checked against and its BC scope.
- Top level `contexts`: the shared word lists (names with pronouns, things, animals, foods, places, containers, money).

**How to fill a template:**
1. For each entry in `slots`, pick a number from that key in the step's `numbers` (a random whole number between min and max, or a random item from `values`).
2. Evaluate each `derived` expression in order and add it to the values.
3. If there is a `check`, keep the values only if it is true; otherwise pick again. Every template passes on at least 1 in 3 tries.
4. Fill the `text` with Python `str.format_map` style: `{name}`, `{they}`/`{They}`, `{them}`, `{their}`/`{Their}` from one random person; `{things}`, `{animals}`, `{foods}`, `{places}`, `{container}` from the lists; numbers from the values. `{price:.2f}` style formats are used.
5. Evaluate `answer` (a math expression over the values, or a quoted word) to get the answer key.

**Expressions** in `answer`, `check` and `derived` use only: + - * / // % **, comparisons, and/or/not, `x if c else y`, and these functions: gcd, lcm, floor, ceil, round, abs, min, max, sqrt, isqrt, int, str, Fraction, pi, sum, len, sorted. Every template was filled 30 to 60 times with only these and passed (answers work out, numbers stay in range, true/false templates come out both ways).

**Mistake codes:** each expected mistake uses an id from assessment/misconceptions.ts where one fits; 88 new ids are in "Unica Learning - New Mistake Codes (for misconceptions.ts).json", each with a description and an example. Generic slips carry no id.

**Pages:** activity skills put their one page on the last step; every other step has at least 1 page, with extra pages on the later steps.

## 11. Checks worth adding to the generator

- Banned-phrase check: fail a book that contains "Watch one", "Finish two", "stretch you", "Unit A", "Unit B", "For the grown-up" (from U4), "Draw" (from U4).
- Page fill check: flag any page with more than about 20% empty space at the bottom.
- Alignment check: answer boxes on a page share the same right edge.
- Range check: every number on a page is inside its step's `numbers` ranges.
- Progression check: the average step number on Day 10 is higher than on Day 1.
