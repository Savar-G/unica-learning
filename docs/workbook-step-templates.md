# Workbook step templates (#489)

The generator now builds each workbook from Cedric's BC step progressions (#487):
1,622 steps, their number ranges, practice models and 7,321 templates. The
155 drafted steps it read before are gone. `curriculumFor("bc")` and
`bcStepProgressions()` give the same curriculum, contexts included.

## The plan: one progression through the steps

`planWorkbook` defaults to `progression: "steps"`.

- The book moves through the level's skills and steps in skeleton order.
  Every teaching day, Days 1 to 9, starts the next step or skill. Day 10 is
  Show what you know. There is no second unit, and the old unit-B page is more
  practice on the day's step.
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
- The template is one the page can print. A picture placeholder, a shading
  task, and drawing or tracing from U4 are excluded. The answer must be a
  number, a short word or list, or a choice the text names. The page's slots
  take different templates first. The difficulty follows the place: easy for
  worked examples and Getting started, the hardest first for a Challenge,
  stories first on a story page.
- The safe filler samples the numbers from the step's ranges with a seeded
  random source. The seed comes from the workbook, the page and the slot. A
  later attempt takes another template and other numbers.
- Formats: a story card (answer and work box), a circle (true or false, yes or
  no, never / sometimes / always, a choice the text names), Spot the error
  (Sam's answer, "Is it right?", fix it), Solve it two ways, else one box.
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
- **Challenge:** it comes from the hardest step reached that day.

The daily number check uses the step's ranges for template items, in place
of the day's cap. The day's progression now comes from the steps. Fluency
facts keep their skill's whole fixed range. The AI-text rules read only words
the writer changed.

#482's rules apply as before: no repeated task (by its template and numbers),
three contexts or formats a page, a sentence frame once a page and twice a
day, the page layout and fullness, and the time estimate. A distinct template
counts as its own format, as #482 counts counting on and back apart.
Capacity planning measures each page before any writing:

- it plans fewer practice items when template text is longer;
- it swaps the longest template question for a shorter one;
- it stops adding items at 27.5 estimated minutes a day, and trims above 29.3;
- it measures pages that mix existing-writer slots with template items, using
  a stand-in as long as the slot's room.

Two more rules apply when a step's ranges are small and its new tasks run out:

- Spot the error and Solve it two ways are planned first, so the page's other
  slots can still bring a third context or format.
- A slot with no new task, or no third form left, is planned away before
  writing. Another item of its block stays. An extra practice page holds up
  to 14 review items, in two columns of 7.

## Report

The sample index's quality row adds step progression (each day's average
rank) and template coverage (templates, hand-built and existing writer). The
builder coverage table shows each level's skills by source.
