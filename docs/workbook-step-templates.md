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

## Report

The sample index's quality row adds step progression (each day's average
rank) and template coverage (templates, hand-built and existing writer). The
builder coverage table shows each level's skills by source.
