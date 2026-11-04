# Workbook step templates (#489)

The generator now builds each workbook from Cedric's BC step progressions (#487):
1,622 steps, their number ranges, practice models and 7,321 templates. The
155 drafted steps it read before are gone. `curriculumFor("bc")` and
`bcStepProgressions()` give the same curriculum, contexts included.

## The plan: one progression through the steps

`planWorkbook` defaults to `progression: "steps"`.

- The book moves through the level's skills and steps in skeleton order.
  Every teaching day, Days 1 to 9, starts the next step of one of the first
  three skills whose earlier skills are taught, the one started least recently
  first, so the days spread the level's skills (U4: count, quick looks,
  parts of 10, then their second and third steps). Day 10 is Show what you
  know on the deepest step started. There is no second unit, and the old
  unit-B page is more practice on the day's step.
- Solve it two ways is planned only on a step with a sum template.
- A test workbook starts its last step on Day 6, as before. An activity
  skill's one page is its last step.
- Review, check and test parts carry `reviewSteps`. A review draws only from
  steps already done before its day: this book's earlier days (latest first),
  passed steps, the spaced reviews' steps, and every step of an earlier
  level's skill. A placement check asks step 1; the level test asks the last.
- The Challenge part is on the day's step, the hardest reached that day.
- `progression: "units"` keeps the unit A and B schedule for plans made
  before #489. The existing plan tests use it.

## The questions: templates, code-picked numbers

`src/lib/workbook-step-items.ts` fills a slot from its step's templates.

- The step is the part's own step, or one of its `reviewSteps` (each slot in
  turn; a step with no printable template is skipped).
- The template is one the page can print. A picture placeholder, a picture
  the words name but code does not print (dots, counters, a chart), a shading
  task, and drawing or tracing from U4 are excluded. Only the printed words
  count: a slot's name such as `{shown}` names no picture. The answer must be a
  number, a short word or list, or a choice the text names. The page's slots
  take different templates first. The difficulty follows the place: easy for
  worked examples and Getting started, harder practice from Day 8, stories
  first on a story page.
- **The Challenge's templates:** a step's hardest templates with a number to
  work out (else its hardest) are kept for its Challenge; teaching places use
  the others. A Challenge takes the largest numbers of several fills. Each
  day's Challenge page is planned before that day's practice. When the step's
  other templates print fewer than 3 formats, practice may use the
  Challenge's templates too, with smaller numbers than the Challenge's.
- **On the day's hardest step:** all three questions (#482 review at db3b1a0:
  no later or easier step). Templates harder than the step's hardest number
  work (a hard true or false) go to no practice place either, so no practice
  question asks more than the Challenge. A small pool of hard templates shows
  as repeated forms, which the report names.
- The safe filler samples the numbers from the step's ranges with a seeded
  random source. The seed comes from the workbook, the page and the slot. A
  later attempt takes another template and other numbers.
- Formats: a story card (answer and work box), a circle (true or false, yes or
  no, never / sometimes / always, a choice the text names; letters in
  capitals), Spot the error (the question, "Answer given: N", "Is it right?",
  fix it), Solve it two ways, a count with boxes (below), else one box.
- **Number stories** use stories that work out a sum (add, take away, share,
  equal groups; never "gets 1 more"): the page's own step, else this book's
  steps already taught by that day (latest first), else the day's reviewed
  steps, the most advanced first. Never a later step. A big count of small things ("10000 leaves") is filled again with
  other things.
- **Practice mixes in review:** On your own from its 6th question and a
  practice row from its 8th take an earlier step (this book's, then the
  day's reviewed steps, the most advanced first). A slot whose own tasks run
  out (late in a full book) does the same.
- **Teaching panels** on a template step show Cedric's worked example for the
  step and its answer, then the step's common mistake put right ("Remember:
  ..."), never one of the page's questions and its key.
- **Solve it two ways** names its two methods in the work areas (by what the
  question asks: count on and make a ten, split a number and use a fact, ...).
- **How do you know?** asks "How did you work out question 1?" (or "How can
  you check your answer to question 1?"). It never prints an answer. Code
  writes it.
- A story whose answer names a person ("'name' if a > b else 'friend'")
  prints as a circle of the name and "the friend"; the package keeps the
  labels, and the check works the answer out from the numbers.
- A blank prints as "?". A count with blanks ("Count on: 8, ?, ?") prints as
  a sequence: its numbers in order with a box in each blank, under the
  sentence when the sentence is long.
- The package keeps the template source. The question-package checks
  `template`, `template-choice` and `template-shown` recompute the answer
  from the sampled numbers, and fail any number outside its step's range.
- Template stories go to the writer with the step's `practice` questions as
  the example bank. The writer may change the words only: every code-picked
  number, exactly once, no drawing, no rejected wording.

#482's hand-built builders stay in three places, where they are better or the
templates cannot serve:

1. **Colour in N on a printed ten-frame**, every third slot of a ten-frame
   step (Savar's decision 1), with the step's own count range. The ten-frame
   templates need a picture code cannot draw.
2. **The warm-up fact grid and In your head.** Fluency facts are a fixed set
   in a fact grid. Templates fill the taught skills only.
3. **The Mixed set and Kindergarten picture steps.** The Mixed set needs an
   operation to tick. 46 steps (mostly K picture tasks) have no printable
   template. These keep #482's builders, or the existing writer.

On every step with printable templates, the templates replace #482's
sequence, likelihood and multi-step Challenge builders. Templates ask the
step's own questions, and Cedric's brief requires every question on a page to
belong to its step. Those builders remain only as the fallback above.

## Checks

The whole-book check adds, on every template question:

- **Step:** it comes from its page's step, or a step its review draws from.
- **Range:** every printed number is inside its step's ranges (section 11).
- **Progression:** the average step rank of the last day is above the first
  day's. The rank orders level, skill and step through the curriculum.
- **Challenge:** it comes from the hardest step reached that day, and asks
  more than every practice question of its step that day: first by what the
  child does (a story or a count to work out, then a checked answer, one box
  or two ways, then a choice, a comparison or a true or false), then the
  template's difficulty, then the largest number. A Challenge page needs only
  as many forms as its step keeps for it, and may repeat their sentence
  frames when the step keeps fewer than 3 templates for it.

The daily number check uses the step's ranges for template items, in place
of the day's cap. The day's progression now comes from the steps. Fluency
facts keep their skill's whole fixed range. The AI-text rules read only words
the writer changed.

#482's rules apply as before: no repeated task, three contexts or formats a
page, a sentence frame once a page and twice a day, the page layout and
fullness, and the time estimate. All are read from what is printed (#482
review at 3134252):

- **Task:** every question, whatever made it (a template, #482's builders, the
  writer), is its printed numbers and sequence terms in any order, its
  answers and its picture, with its format family (a story, a drill, Spot the
  error, two ways, a colouring, an explanation). A worked example's task
  counts too: no question asks it, before or after.
- **Frame:** a sentence's names, numbers and places are taken out ("saw the
  number # on a sign at _"); its people's things stay.
- **Form:** a context sentence is its frame; otherwise the format it prints
  (a count on or back, true or false, a choice, a missing number, a
  comparison, bare numbers). A template's id never makes a form.

Capacity planning measures each page before any writing:

- it plans fewer practice items when template text is longer, and swaps the
  longest template question for a shorter one that keeps the page's forms;
- it fills a day's review pages first, up to 28.8 minutes, then its other
  pages up to 28.3 (27.5 on a day with existing-writer slots);
- later attempts take longer templates in question rows, so a page of short
  templates can still print three forms;
- it trims above 29.3 estimated minutes a day;
- it measures a slot with no task yet, or an existing-writer slot, with a
  stand-in as long as the slot's room.

A step page's title names its step's numbers ("Place value to 100 000" on
Day 1 of U16, not "to millions"); a number in groups counts as one word.

No slot is planned away. A page keeps the adopted counts of practice
questions (Cedric's section 8: practice and review pages 8, a new idea 3
beside its Spot the error, a Challenge 3, Show what you know 4, Friday 5
nine; from U19 three quarters). Spot the error and Solve it two ways do not
count toward them. A review page that also carries a Mixed set and a
Challenge (6 pages a day) has no adopted count: 4, its Mixed set's. Time
trims, above those counts, are reported ("to keep the day under 30
minutes"), not losses. Above the floor, an item goes only
when the measured page overflows. Below it, a page that still overflows
loses an item and reports it, and a slot with no new task stays planned and
fails: both fail the book check. A review page holds up to 14 items in two
columns of 7. Spot the error and Solve it two ways are planned first, so the
page's other slots can still bring a third form. A page that still needs a
third form takes #482's builder for its skill, where there is one, before it
repeats a form. On overflow, a slot with no task goes first, then a question
of the kind the page has most of.

Planning order: every day's Challenge first, from the last day back (a later
day reaches larger numbers), then every Number stories page, then the other
pages in order; each page's worked examples choose their tasks before any
question, so no question asks them. Days keep their own frame, Challenge and
reserved-template limits. A review place on a step of an earlier level takes
all its templates (no Challenge of the book asks that step); on a step of
this level, the Challenge's templates only late. On overflow, a question
wider than its space takes the next task of its slot first; then one of the
four longest planned questions takes a shorter one that does not lengthen a
day near its limit. A template that needs a reversed numeral drawn ("5
backwards") does not print.

## Challenge cards, story numbers and stems (the U16 review, 2026-11-03)

- **Challenge:** a step that keeps fewer than 3 Challenge templates (its hardest
  with a number to work out) asks each once, with the largest numbers. The
  page's other cards take a hard template with a number to work out from a
  step taught or reviewed by that day (or reviewed on an earlier day), the
  largest numbers first. The book check accepts such a card beside a card of
  the day's hardest step, and compares it with that step's practice (not with
  a Spot the error or two ways), and fails a page that asks its step's only
  Challenge template twice.
- **Story numbers:** from U16, a story place's question from another step than
  its page's prints or answers a number of 100 or more; the page's own step
  keeps its ranges. A 4-digit count of small things takes tickets or points;
  one in a container (a box holding 9 000) is no story.
- **Stems:** a question with no person or thing in it has a stem (its words
  with numbers and places out, 4 words or more); a template is one stem too.
  Each prints twice a page at most, outside the warm-up and the Challenge. A
  sentence frame is once a page and twice a day, on the Challenge too. A
  stories page tells each story template once while it has others.
- A template's day cap is 6 on its page's own step, 4 otherwise. A day over
  its time takes warm-up facts too, down to 8. Planned minutes add 0.15 for
  each story the writer words. Expanded forms print no empty place; from U13
  no factor is 1; "They gets" is "They get".

## Likelihood words, Watch out, Show what you know, minutes (2026-11-03)

- **Likelihood:** a rating is never, sometimes or always
  (`src/lib/workbook-likelihood.ts`, an allow-list). A template that rates with
  likely, unlikely, certain, uncertain, impossible or possible does not print, at
  any level; an item (template or AI) that prints one fails `feedbackItemProblem`;
  the book check fails a page with one in its text or choices. Comparisons
  ("more likely", "least likely") stay. Titles say "Never, sometimes, always" or
  "More or less likely".
- **Watch out and examples:** a step's common mistake is printed once a day, on
  its first teaching page; later "Read the example" panels show code's own
  example with no Watch out line. The book check fails a panel that repeats a
  worked example or a Watch out line on the same day.
- **Show what you know:** each step's harder templates (medium and hard) with the
  largest numbers that fit a 3-line card; an easy one only when no harder one
  fits. The book check fails an easy card of a step with harder templates, or
  numbers in the lower half of the step's range.
- **Challenge:** three kinds of question while the steps have them (a story, a
  count, a missing number); the day's practice of an earlier step a Challenge
  card uses stays below that card's difficulty; no part of 0.
- **Stories:** a Number stories page prints stories on every pass while its steps
  have them, a story told again rather than a drill.
- **Minutes:** the plan page says "about N minutes", the mean of the book's own day
  estimates to the nearest five (D-225).

## Codex at 47c5fd78, U16 r8 and U4 r17 (2026-11-03)

- **Worked examples** print the page's own reserved example with a method line
  ("Work it out: 7 − 4 = 3. Answer: 3", "Read the thousands place: ...",
  "Add 1 each time."), from the template's expression and numbers
  (`templateMethod`). The book check fails a panel with no method line.
  U4 to U9 panels may take 320 px; a panel with no room drops its Watch out line.
- **Task identity** reads the printed task only: who wrote it never changes it.
- **Page floors:** every day page kind has its count (`pageMinimum`, in the book
  check for every page from U4, whatever wrote its questions). A new idea's floor
  follows Cedric's band table: 2 at U4-U9, 3 at U10-U18, 2 at U19-U30 (his
  layout spec: new_idea 2-4 items, 6 pages a day, one column). The confirmed
  "3 from U10" is the U10-U18 band; the U19-U30 floor of 2 is not a bug (Savar,
  2026-11-03; pinned in `workbook-quality.test.ts`). Practice rows share 8 across
  their rows (U16's Practice 2 had 14).
- **Own step:** from U10 a practice page asks at least half its practice
  questions, or 3, on its own step. A block's own-step questions come first, its
  earlier steps after them under "Remember these".
- **Fullness:** the time limit no longer excuses a half-empty page. At its
  maximum with its gaps at their widest, a page's rows grow to fill it (the
  rows, not the gaps), and the fullness check still runs. A page that overflows
  only because its gaps grew gets its gaps back, never loses a question.
- **Numbers:** from 10 000 up, printed in BC groups ("46 251", `bcNumbers`).
- **Wording:** "counting by 10, 3 marks above 40" is "start at 40 and count on
  by 10s 3 times"; more than 50 packs are a school's order of boxes.
- **Stories:** a Number stories page mixes kinds (join, take away, compare, part
  and whole, groups; `storyKind`), in the planner and the book check, and a
  shorter replacement never loses one. Two ways there is a story too.
- **Show what you know:** a half card alone in its row takes the row. A Challenge
  card with nothing to work in keeps its height.

## Confirmed decisions (Savar, 2026-11-03)

- **U4 to U9 (D-222),** each one function in `src/lib/workbook-early-levels.ts`:
  - **Solve it two ways** sits on the Number stories page, not Practice 2
    (`twoWaysOnStoriesPage`), and counts there as a story (`twoWaysCountsAsStory`).
    Practice 2 holds its 8 practice questions and Spot the error, in closer rows.
  - **New idea floor:** 2 practice questions beside the worked example and Spot the
    error (`newIdeaFloor`); U10 and up keep 3. The book check (`pageMinimum`) reads
    the same function. A page that cannot hold its floor fails and is reported.
  - **Repeats:** Days 1 to 10 never repeat a task. Only an extra practice page may
    ask a task of the book once more, and only 40 or more pages after it was first
    asked (`extraPracticeRepeats`). The sample index reports how many do. Fewer
    extra practice pages, then a labelled Notes page, are the next steps if a book
    runs out.
- **Spaced review (D-223):** a question type comes back with fresh numbers, never
  an exact task (D-222 is the one exception).
- **Challenge (D-224):** 3 questions a day, all harder than the day's practice.
- **Page counts and time (D-225):** practice and review pages hold 8 to 10
  questions; a day is about 30 minutes, and the How it works page says "about N
  minutes" from the book's own day estimates (their mean to the nearest five).

## Codex at 24751f16, U16 r13 and the full books (2026-11-03)

- **Take-away stories (B1):** a story whose answer is one printed number less
  another, and whose question asks what is had now or left, takes the things
  away with a verb from an allow-list (gives away, sells, eats, loses, uses,
  spends, takes out, ...) or asks for the rest ("How many are not in the
  jar?"). `takeAwayProblem` (workbook-wording.ts) refuses a template fill, an
  AI item and, in the book check, any printed question; the AI prompt says it.
  "Puts 17 in a jar. How many does he have now?" fails.
- **Task identity (B2):** a question's printed choices are not its task: "6 is 1
  and which number: 6 or 5?" is "6 is 1 and ?". A number answer is one answer,
  boxed or circled. A story is typed by its printed words, whoever wrote them.
- **Challenge (B3, D-224):** every card is on the day's hardest step and above
  every question of that step's practice that day: its difficulty, then its work
  (a circled choice, a number, a story), then the numbers its answer combines.
  A card of an earlier step fails, whatever its label.
- **Unica Challenge templates (U16):** Cedric's U16 day steps kept one medium
  Challenge template each, so 3 cards a day could not all be harder than
  practice. `src/lib/workbook-curriculum/house-templates.ts` adds 3 hard
  templates with a number answer and two steps to each U16 day step (4 to
  5.9-multiply-tens step 3, the day step two days running; 2 to
  5.9-distributive step 1, whose story is Cedric's v2 hard template). They are
  appended when the curriculum loads, checked against the step's name, and
  logged in `data/curriculum/author-changes.md`. Their numbers sit in the top
  half of the step's range.
- **Two-step cards (U4):** each U4 number step gets code's two-step cards from
  its own range ("What is 7 + 7 + 6?", "10 is 4 and 4 and ?", "has 20, gives 15
  away, then gets 5 more"); likelihood steps get cards that reason from a bag's
  cubes. They are the Challenge's last fill only, after the step's own
  templates.
- **Card frames:** a Challenge or Show what you know frame (its words without
  names, things, places and numbers) prints twice a book at most, never on two
  Challenge days in a row nor twice a day, and with fresh numbers (Savar).
- **Stories pages** print stories only, every pass, and the book check fails a
  drill there. "Missing number: 10 000 - ? = 4913" read "Missing" as a name.
- **Place words** after 1 are singular in every printed text: "1 ten", "1 one".
- **Room:** before a practice question is dropped, the tallest takes a shorter
  question of an earlier step the book taught. A likelihood panel prints its
  meanings once, with the answer on the question's line. A block of review only
  prints "Remember these" alone.
- **New-idea floors** follow Cedric's band table: 2 at U4-U9, 3 at U10-U18, 2 at
  U19-U30.
- **Minus signs** print as "−" between numbers in every text (templates, AI
  items, panels); the book check fails a hyphen there, and the solve check reads
  both.
- **Refill:** a page that lost a question for room takes one again (a short one,
  on its practice) once it has room, and the omission is made good; a review
  page's extra questions leave the day's later practice pages about 0.4 minutes
  each. The full U4 book still has three pages below 8 (Days 1 and 9): see the
  report.

## Report

The sample index's quality row adds step progression (each day's average
rank) and template coverage (templates, hand-built and existing writer). The
builder coverage table shows each level's skills by source.
