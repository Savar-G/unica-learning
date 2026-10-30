# Workbook DESIGN.md

The look of every Unica workbook page. The renderer (#309, #310) builds pages from these tokens and templates, and the
generator (#311) only fills named slots: it never chooses a layout, font, size or colour. What goes into a workbook and
why is in [`CONTEXT.md`](CONTEXT.md).

**Source of truth:** Cedric's four sample workbooks (FigJam "Personalized Learning, Delivered", page **Workbook design**;
PDFs in [`samples/`](samples/)). **Mateo (`267:131`) is the style reference.** Every value below was read from those
Figma frames on 2026-10-30, not estimated from the PDFs. Where the samples disagree with each other, this file picks one
value and says so in section 9.

## 1. Page

| Token | Value |
|---|---|
| Size | US Letter, 8.5 by 11 in. Design units are Figma px at 96 per inch: 816 by 1056 |
| Print | Colour, 612 by 792 pt PDF. No bleed: nothing runs to the edge |
| Margin | 64 px on all four sides |
| Column | 688 px wide, one column; blocks inside it split into 2 or 3 columns |
| Header + content | 866 px tall (header 126, gap 20, content area 720) |
| Content area | 688 by 720 px. **Every page fills to this same bottom edge; nothing overflows** (the fit check fails a page that does) |
| Footer | 688 by 42 px, top at y 950 (20 below the content area) |
| Scan marks | An L-shaped corner mark, 18 by 18 px, 3 px stroke `#111111`, 22 px in from each corner, on every page |
| Background | `#FFFFFF` |

## 2. Type

Fonts: **Geist** (words) and **Geist Mono** (numbers, maths, labels, IDs). Line height 140% unless listed.

| Role | Font | Size / line height | Colour | Notes |
|---|---|---|---|---|
| Cover title | Geist Light | 66 / 118%, letter-spacing −3% | `#0C0C0E` | Two lines; the second sits on a `#FFD23F` highlight block |
| Page title | Geist Light | 30 / 118% | `#0C0C0E` | "Warm-up", "Factor pairs" |
| Page subtitle | Geist Regular | 15 | `#44444C` | One line under the title ("Watch one. Finish two. Then do the rest on your own.") |
| Day label | Geist Mono Medium | 13 / 120%, upper case, letter-spacing 4% | page-type colour (section 3) | "DAY 1 · PAGE 2 OF 8 · FACTOR PAIRS" |
| Name and Date | Geist Regular | 13 | `#0C0C0E` | With 1 px `#0C0C0E` writing rules |
| Chip label | Geist Mono Medium | 13 / 120%, upper case, letter-spacing 4% | chip text colour | |
| Chip side note | Geist Regular | 13 | `#44444C` | "Do as many as you can." beside a chip |
| Panel label | Geist Mono Medium | 13 / 120%, upper case, letter-spacing 4% | `#44444C`, or `#1B3FA6` on blue cards | "WORKED EXAMPLE · FACTOR PAIRS OF 24", "TRY THIS FIRST" |
| Body and instructions | Geist Regular | 15 | `#0C0C0E` | Stories, explanations |
| Story text in lists | Geist Regular | 14 to 16 | `#0C0C0E` | Mixed set stories 14; word problems 16 |
| Fact or equation | Geist Mono Regular | 17 | `#0C0C0E` | "3 × 4 =" in warm-up grids |
| Inline maths in text | Geist Mono Regular | 15 | `#0C0C0E` | "0.5 + 0.03 + 0.007 =" |
| Column arithmetic | Geist Mono Regular | 22 to 24 / 118% | `#0C0C0E` | Vertical sums; carries and trades in `#2453D4` at 13 |
| Big numbers in models | Geist Mono Regular or Medium | 26 / 118% | `#0C0C0E` | Place-value charts |
| Given and worked numbers | Geist Mono Regular | same size as the maths | `#2453D4` | "Watch one" answers, highlighted points on a number line |
| Item number | Geist Mono Medium | 14 / 120% | `#0C0C0E` | "9", "10" before a list item |
| Grid item number | Geist Mono Regular | 13 / 120% | `#44444C` | Small numbers in fact grids |
| Box label | Geist Mono Regular | 13 / 120%, letter-spacing 4% | `#44444C` | "SHOW YOUR WORK", "ANSWER", "WAY 1" |
| Choice word | Geist Regular | 16 | `#0C0C0E` | "yes", "no" beside tick boxes |
| "Tick one" | Geist Mono Regular | 13 | `#44444C` | With a 16 px example box holding a tick |
| Page ID | Geist Mono Regular | 11 / 120% | `#0C0C0E` | Footer |
| Wordmark | Geist Medium | 14 | `#0C0C0E` | "Unica Learning" plus a 4 by 4 px `#FF6A3D` square at its baseline |

**Minimum sizes by level** (child-facing text): 13 px from U10; 18 px at U4 to U9; 20 px body at U1 to U3. The renderer
scales the whole type ramp up by level band; it never scales a single element.

## 3. Page types and colours

Each page type has one colour. The day label in the header is plain text in the type colour; the chip under the title
uses the type's chip colours.

| Page type | Day label | Chip fill | Chip text | Panels |
|---|---|---|---|---|
| Warm-up | `#064E32` | `#E3F5EC` | `#064E32` | Fix it box, In your head box |
| Practice (incl. Practice 2) | `#0B7A4F` | `#E3F5EC` | `#064E32` | Watch one `#E3F5EC` |
| New idea (and Unit B new step) | `#2453D4` | `#EAF0FF` | `#1B3FA6` | Worked example `#EAF0FF`; Try this first and Now you cards |
| Word problems, Math in the world | `#C2410C` | `#FFEDE5` | `#7C2D12` | Info cards `#FFEDE5` |
| Remember these + Mixed set | `#8A6500` | Mixed set `#FFD23F`; Remember these `#FFF6D6` | `#0C0C0E`; `#5A4300` | Remember these panel `#FFF6D6` |
| Challenge | `#2B2622` | `#FFF0B8` with a 1.5 px `#2B2622` border | `#0C0C0E` | Challenge cards |
| Fix it (chip only) | n/a | `#FDECEC` | `#B42318` | Fix it box `#FDECEC` |
| Spot the error (chip only) | n/a | `#EAF0FF` | `#1B3FA6` | Blue-outlined card |

Other colours:

| Use | Value |
|---|---|
| Ink | `#0C0C0E` |
| Secondary text | `#44444C` |
| Hairline and card borders | `#D4D4DA` (1 px) |
| Work box border | `#CCCCD1` (1 px) |
| Table row rules | `#E0E0E5` (1 px) |
| Writing lines | `#9A9AA2` (1 px); lighter `#B8B8C0` |
| Choice strip | `#F4F4F5` |
| Brand blue (counters, outlines) | `#3366F0` |
| Brand orange (wordmark dot, cover card, counters) | `#FF6A3D` |
| Brand green (counters) | `#16A06A` |
| Brand yellow (highlight, Mixed set) | `#FFD23F` |
| Taken-away or unused counters | `#D4D4DA` |
| Mental maths box | `#F1F1F4` |

## 4. Components

All radii in px. Strokes are inside the shape.

**Header** (every day page; 688 by 126, vertical, gap 8): a Name and Date row (18 tall: "Name" with a 483 px rule, "Date"
with a short rule at the right); the day label (28 tall); the page title; the subtitle.

**Footer** (688 by 42, horizontal, gap 12; D-187): QR code 42 by 42 at the left; then a stack of two lines, gap 3: the
page ID (`UL·LEAH·W03·D01·P2`) and the book page number ("Page 4", Geist Mono Regular 11, `#44444C`); the wordmark at
the right edge.

**Chip** (height 28, radius 999, padding 6 by 10, gap 8): an optional 16 px icon and the label. Mateo icons: book for
New idea, target for Practice, lightning for Warm-up, shuffle for Mixed set, magnifier for Spot the error, light bulb for
Challenge, wrench for Fix it. The Challenge chip is 31 tall with its 1.5 px border. A side note may follow the chip
(gap 10).

**Answer box** (white, 1.2 px `#0C0C0E`, radius 6): height 40 (44 beside 17 px maths, 46 for large inline answers; 56 at
U1 to U3); width by expected answer: 40 to 48 for one or two digits, 64 standard, 80 to 96 for decimals or units, up to
204 for words. Every answer box is an item answer region with a stored position (#309).

**Tick box** (20 by 20, radius 3, 2 px `#0C0C0E`, white) inside a **choice strip** (`#F4F4F5`, radius 8, height 42,
padding 8 by 14, gap 28 between choices; tighter strips 36 to 37 tall with gap 20). After the strip: "Tick one" with a
16 by 16 example box (radius 2, 1.5 px `#0C0C0E`) holding a tick. The instruction before the strip always names the
choices.

**Work box** ("SHOW YOUR WORK", "WORK IT HERE", "WAY 1"): white, 1 px `#D4D4DA` (or `#CCCCD1`), radius 8, padding 10 by 12,
the label at the top left. Inline height 44 (Mixed set); in cards it fills the card's free space.

**Writing lines** ("How do you know?", "First I ...", "Then I ..."): 1 px `#9A9AA2`, at least 34 px apart, full column
or card width.

**Item card** (Now finish two, On your own, word problems): white, 1 px `#D4D4DA`, radius 10, padding 16. A card holds one
item; two cards side by side are 336 wide with a 16 gap.

**Number badge** for numbered cards: a 24 px grey circle with the number in Geist Mono 13. **Step badge** in a Mixed
set: a 20 px black circle with a white Geist Mono 13 digit (① ②).

**Worked example panel**: `#EAF0FF`, radius 12, padding 18 by 22. Label "WORKED EXAMPLE · <what>"; either two white
inner cards ("WAY 1 · ...", "WAY 2 · ...", radius 12) side by side, or the worked figure at the left and "WHAT'S GOING ON"
text at the right (gap 26).

**Try this first card** and **Now you card**: white, 1.5 px `#3366F0`, radius 12, padding 16 20 18 20, gap 12 to 14.
Labels in `#1B3FA6`.

**Watch one panel**: `#E3F5EC`, radius 12 (10 in Leah), the worked answer in `#2453D4`.

**Remember panel** (Unit B reminder): `#EAF0FF`, radius 12 to 16, label `#2453D4`.

**Remember these panel** (review recap): `#FFF6D6`, radius 16, label `#5A4300`.

**Spot the error card**: white, 1.5 px `#3366F0`, radius 12, after a blue "SPOT THE ERROR" chip with the side note "One
move is wrong. Find it, then write the fix." Holds the wrong work ("SAM'S WORK"), "THE FIX" with answer boxes, and
"What did Sam do wrong?" with writing lines.

**Fix it box**: `#FDECEC`, radius 12, after a "FIX IT" chip; the questions sit in white inner cards (radius 12) or in
answer boxes with "WORK IT HERE" boxes below.

**In your head box** (mental maths): `#F1F1F4`, radius 10; label "IN YOUR HEAD" or "MENTAL MATH"; one item, its answer
box, then "How did you work it out?" with writing lines (from U19: "First I ..." and "Then I ..." lines and one worked
example sentence).

**Mixed set item**: the story (Geist 14), then ① "Tick the operation:" with a choice strip of +, − (or +, −, ×, ÷) and
"Tick one"; then ② "Write the answer:" with an answer box (64 by 40) and an inline work box (44 tall). Items are numbered
and separated by 1 px `#D4D4DA` rules.

**Challenge card**: `#F4F2F0`, 1.5 px `#2B2622`, radius 12, padding 16; the question at the top left, an answer box
(88 by 40) at the top right, then a white work box filling the rest. Four cards in a 2 by 2 grid (each 336 by
327, gap 16).

**Math in the world**: an info row of cards (`#FFEDE5`, radius 8, label `#7A2E0E`: for example EDGING $4 per metre, SOIL,
BUDGET), a "PLAN: WHAT WILL YOU FIND, AND IN WHAT ORDER?" work box, lettered parts a to d with answer boxes, a large
work box, and a "Final answer:" writing line.

**Visual models** (drawn by code from item data, never images): number lines (2 px ink line, ticks, labels Geist Mono
16; hops as 2 px `#2453D4` arcs; start and end points as filled `#3366F0` dots with blue labels); ten-frames (2 by 5
cells, 1.2 px ink, counters as filled circles); counters and dot groups (orange `#FF6A3D`, blue `#3366F0`, green
`#16A06A`, taken away `#D4D4DA`); base-ten blocks (rods and unit squares, white with 1 px ink outline, traded units
grey); arrays of squares (`#3366F0`); place-value charts (column headings Geist Mono 13, letter-spacing 2%); circles
with labelled radius and diameter (2 px `#2453D4`); column arithmetic with crossed-out digits and small blue trades.

## 5. Cover

Top row: the wordmark at the left (Geist Medium 22 with its orange square); "Workbook <n> · 10 days" at the right (Geist Mono 13, `#44444C`, letter-spacing 4%;
the samples say "Sample workbook · 3 days").

The Unica mark: a 3 by 3 grid of 36 px squares with 1.2 px ink borders; filled cells top-left `#FFD23F`, top-right
`#3366F0`, centre `#FF6A3D`, bottom-left `#16A06A`.

"Made for <Name> · Level U<n> · <Level title>" (Geist Medium 22, `#44444C`). The cover title in two lines, the second on the
yellow highlight. Then the **Made from** card: `#FFF1EA`, 1.5 px `#FF6A3D`, radius 10, padding 22 by 24, gap 14; label
"MADE FROM <NAME>'S ASSESSMENT" (Geist Mono Medium 12); one sentence of what the assessment showed (Geist 17); four
bullets (8 px `#FF6A3D` squares) of what this workbook does. From workbook 2 the label reads "MADE FROM <NAME>'S LAST
WORKBOOK" and the sentence uses the snapshot.

Bottom: "How this works and your plan are next. 10 days, <n> pages a day, about <x> minutes a day." (Geist 15,
`#44444C`), then the footer with the cover's page ID.

## 6. How + Plan page

Header line "How it works · <Name>'s plan" (Geist Mono Medium 12) and "Workbook <n>" at the right.

**Plan table**: columns DAY, TOPIC, PAGES (Geist Mono Medium 11, `#44444C`, under a 1 px ink rule); one row a day (56
tall, 1 px `#E0E0E5` rules; a 1 px ink rule under the column heads): "Day 1" (Geist Mono Medium 16), the Unit A topic (Geist Medium 18) over the Unit B topic
(Geist 14, `#44444C`), and the book page range (Geist Mono 16). Day 5 and Day 10 rows name the Friday 5; Day 10 is
"Show what you know".

**How it works**: four chips with two lines each (Geist 14): EVERY DAY (green: "<n> pages a day, 15 to 30 minutes."),
SCAN (yellow: "Scan each finished page in the Unica app."), STUCK? (blue: "Call the Teaching Assistant."), FIX IT (red:
"Anything your child got wrong last time comes back as new questions."). This is the only page that mentions scanning or
the Teaching Assistant.

## 7. Day templates

Each page is the header, a stack of blocks in the content area (gap 12 to 20), and the footer. Slot limits are maximums
for 688 by 720; the fit check measures the real height.

### 7.1 The 8-page day (U10 to U18; the reference)

| Page | Title, subtitle | Blocks (slots) |
|---|---|---|
| 1 Warm-up | "Warm-up"; "Facts to 20. Take your time: there is no timer." (from U16 "Beat your own count") | WARM-UP chip + "Do as many as you can."; fact grid, 3 columns of 213 (gap 24), up to 30 facts (10 rows) or 15 facts plus Fix it; Fix it box (workbook 2 on, Days 1 to 5, up to 3 items); spare room: In your head box |
| 2 New idea | the step's name; "Before you ..." or "Try it first. Then see how it works." (U19 on) | NEW IDEA chip (+ "Unit A · new step"); Try this first card (U19 on); worked example panel, two ways or figure + "What's going on"; Spot the error card or Now you card (2 to 4 items) |
| 3 Practice | "Practice: <step>"; "Watch one. Finish two. Then do the rest on your own." | PRACTICE chip + one-line rule; Watch one panel (1 worked item, answer in blue); "FINISH THESE" (2 items, partly filled in blue); "ON YOUR OWN" (3 to 8 items) |
| 4 Practice 2 | "More practice: <step>" or "On your own"; "Each row is a little harder than the one before." | PRACTICE chip; rows of items getting harder (up to 12 column problems in a 4-column grid, labelled rows such as "TWO DIGITS", "HARDER: THREE DIGITS", "LOOK FIRST: SOME DON'T NEED A TRADE"); one Solve it two ways item (WAY 1, WAY 2 work boxes + Answer box); one Spot the error card |
| 5 Word problems | "<Step> in stories"; "Read it. Work it out in the box. Write the answer." | 3 stories, each: number, story (up to 3 lines), optional picture (dots, blocks), work box, ANSWER box with unit word; one "How do you know?" or "Did you need to ...? How do you know?" with 2 writing lines. Story number in Geist Light 26; stories separated by full-width 1.5 px `#FF6A3D` rules; answer boxes 80 to 96 by 40 |
| 6 Unit B | the Unit B topic; "Unit B: <topic>. <one-line rule>." | NEW IDEA or REMEMBER chip + "Unit B · new step" or "From yesterday"; reminder panel (figure + "What's going on"); PRACTICE chip; up to 8 items, "HARDER: TWO MORE EACH" rows last |
| 7 Remember these + Mixed set | "Remember these?"; "Things you learned before, so they stay fresh." | 8 review items in 2 columns (answer boxes at the right of each column); MIXED SET chip + "Tick + or −, then write the answer."; 3 to 4 Mixed set items |
| 8 Challenge | "Challenge"; "Four to stretch you." | CHALLENGE chip; 4 Challenge cards, 2 by 2 |

### 7.2 Other page counts

- **6-page day (U19 to U30, Ethan):** 1 Warm-up (fact grid up to 27 items, In your head box, Fix it box); 2 New idea (Try
  this first first); 3 Practice (Watch one, Finish these, On your own, Solve it two ways, Spot the error); 4 Word problems,
  or **Math in the world** on Days 4 and 9; 5 Unit B (reminder + practice); 6 Remember these? (6 items) + Mixed set (2
  items) + 2 Challenge cards side by side.
- **10 to 12-page day (U4 to U9) and 4 to 6-page parent-led day (U1 to U3):** not in the samples yet (CONTEXT.md, open
  question 1). Until Cedric confirms, the generator does not build these levels.
- **Friday 5 (Days 5 and 10)** and **Show what you know (Day 10):** not in the samples yet (open question 2). Their page
  type uses the Review colours.
- **Level test (Day 7 of a level's last workbook):** its own page type, to design with Cedric (CONTEXT.md section 4).

### 7.3 Early levels (U1 to U9, from Ava)

- Bigger maths (Geist Mono 30 to 34 in facts) and fewer items: warm-up 8 facts in 2 columns plus one In your head item.
- A "For the grown-up:" line under the New idea title ("Read the blue box aloud. Show both ways with a finger ...").
- Pictures carry the stories: dot groups beside every word problem; ten-frames and number lines in practice.
- No Mixed set operations beyond + and −; "Tick + or −, then write the answer."

## 8. Rules the renderer and generator keep

1. The generator fills slots with content data; the renderer owns every position, size, colour and font.
2. Every answer item has a number, an answer region, and a stored box on the page image (D-187).
3. Every page shows the header, the footer (QR, page ID, page number, wordmark) and the four scan marks.
4. Nothing overflows the content area; a page that does not fit is regenerated, never shrunk.
5. Clarity comes from instructions and structure, not bigger elements: every choice names its options; every box says
   what goes in it when it is not obvious.
6. No school grade, no scan or Teaching Assistant prompt on a day page, no answer key in the book.
7. One page type per page; its colour shows only in the day label, chips and panels.

## 9. Where the samples differ, and the value this file uses

| Thing | Samples | This file |
|---|---|---|
| Answer box radius | 4 and 6 | 6 |
| Challenge card | Mateo days 1 to 3: radius 12 / `#2B2622` 1.5 / `#F4F2F0`, radius 16 / ink 1.5 / `#F1F0EE`, radius 18 / ink 1.2 / `#F4F3F1` | radius 12, `#2B2622` 1.5, `#F4F2F0` (Mateo day 1) |
| Challenge chip border | `#2B2622` (Mateo, Leah, Ava), ink (Ethan) | `#2B2622` |
| Spot the error card | blue outline (Mateo, Leah, Ethan), orange `#FFF6F0` with `#C2410C` (Ava) | blue outline |
| Fix it box border | none (Mateo, Leah, Ethan), 1.5 px `#E5484D` (Ava) | none |
| Chip icons | Mateo and Leah have icons, Ava and Ethan mostly not | icons as in Mateo |
| Chip label case | upper-case text (Mateo) or text-case UPPER (Leah) | upper case |
| New idea chip fill | `#EAF0FF`; Ethan `#E6ECFC` | `#EAF0FF` |
| Watch one radius | 12 (Mateo, Ethan), 10 (Leah), 16 (Ava) | 12 |
| Story wording | "Mum" | "Mom" (CONTEXT.md section 8) |
| Footer | page ID only | page ID + page number (D-187) |

## 10. Cedric's review notes on the Mateo sample (to fix in templates)

From the FigJam stickies beside the Mateo sample:

- Remove notes that say to call the Teaching Assistant or scan the page (done: rule 6).
- Numbers are not centred in the circles of the white spaces (centre digits in number badges and dots).
- Not enough space on the "How do you know?" line in one place (keep lines at least 34 px apart, 2 lines minimum).
- Boxes that look like they are meant to be filled in when they are not (only answer regions get ink borders; given
  values sit in plain text or tinted panels).
- "Tick one what?": every choice strip's instruction names the choices, and Mixed set items show both steps clearly.
- In a Remember these list, the big box for items 9 to 12 was unclear (each item keeps its own answer box beside it).
- Spacing issue around one diagram label.
