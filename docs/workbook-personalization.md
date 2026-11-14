# Workbook personalization

Status: spec, 2026-11-04. Savar's decision of 2026-11-04 is **"Everything first"**. Before the first customer's real book, the generator must use everything the assessment and the report know about the child.

This spec covers what the book reads, how the profile is kept fresh, where the book starts, what each signal changes, the safety rules, an admin view and the tests. The implementation tickets are in [Ticket split](#ticket-split). Follow [Workbook rounds](workbook-rounds.md) and the [shared agent brief](agents/delegate-brief.md).

## What happens today

The real job reads only a small part of the child profile:

1. `src/lib/workbook-job.ts`
2. `planNextWorkbook` in `src/lib/workbook-placement.ts`
3. `planWorkbook` in `src/lib/workbook-plan.ts`

From `public.child_profiles` (`ChildLearnerProfile`), it reads the grade, `standards` (code and status) and `notYetSecure`. Nothing else reaches the book.

These are the facts, checked on main at `02cfcab5` and against the live database (read-only) on 2026-11-04:

- **The first customer has no child profile.** This is child `71ce22a1…`, Grade 4 BC. The test finished on 2026-10-28, and `child_profiles` was added on 2026-10-29. Nothing has rebuilt the profile since. The live database has 6 learner profiles and only 3 child profiles, so 3 children with a test have no child profile.
- **With no profile, placement gives U13.** `placeChild` returns U13 both with no profile and with his real standards, because placement never goes above the school grade.
- **Even at U16, today's plan would teach only one unit.** A probe ran `planWorkbook` at U16 with his real standards. It taught only 5.9, for all ten days. The reason is a first-book rule: a unit the profile calls "secure" is reviewed, not taught. Units 5.1, 5.5, 5.10, 5.12 and 5.17 are "secure" on 1 or 2 answers each, so they were skipped. Unit 5.8 is warm-up only. This rule must change before his book (see [Placement](#3-placement), rule P5).
- **The cover line is generic.** It says "Made from <Name>'s assessment", then "<Name> will <skills of the plan>." The sentence never says what the assessment found.

## 1. Inputs

How reliable each signal is:

- **Clear** means one more answer, right or wrong, would not change the result (`strandCertainty`). On a standard, this takes 4 of 4 right to be clearly secure, or 0 of 2 to be clearly not secure.
- **Early sign** is any other result. The test asks 1 to 3 questions per standard, so almost every standard result is an early sign.
- **Parent** means the parent's answer on the learning card. It says what the parent thinks, not what the child did.
- **Soft** means AI-written text. It is a hypothesis, never a fact.

| # | Signal | Where it lives | Reliability | First customer (`71ce22a1…`) | Savar |
|---|---|---|---|---|---|
| S1 | School grade | `children.grade` → `ChildLearnerProfile.grade` | Fact | Grade 4 |
| S2 | Working level, its certainty and confidence | `learner_profiles.profile.level` (`working`, `certainty`, `confidence`) | Clear or early sign, from about 42 answers | Working level 5, certainty clear, confidence normal |
| S3 | At the test ceiling | `profile.level.atCeiling` | Fact: the test could not measure higher | `true` |
| S4 | Per-area status and level | `profile.strands[]` | Clear or early sign; about 6 questions per area | All 4 areas secure, 6 of 6 each, level 5 |
| S5 | Per-standard status | `profile.standards[]` → `ChildStandard` (`status`, `certainty`, `aboveGrade`) | **Early sign**, 1 to 3 questions | 16 Grade 4 standards secure, all early signs. Grade 5: 13 secure, all early signs; 5.13 is 0 of 1. |
| S6 | Struggles: not secure, at or below grade | `profile.struggles[]` and `ChildLearnerProfile.notYetSecure` | Early sign unless 0 of 2 or worse | None. 5.13 is above his grade, so it is not a struggle (D-084). |
| S7 | Wrong answers and misconceptions | `struggles[].wrong[]` (`response`, `misconception`), and `public.answers.misconception` | Fact for the answer. The misconception is a code match, and is often null. | One wrong answer, on 5.13 (`g35-5-same-area`): he answered "60", with no misconception matched and no drawing. |
| S8 | Learning events: right, with help, wrong, blank, hints, stuck steps, mistakes | `public.learning_events` → `ChildStandard.events` | Fact per event. Few events per standard at first. | 0 events |
| S9 | Fact fluency | `profile.facts` (`families`, `correct`, `answered`, `medianMs`, `accuracy`, `speed`) | Fact for the whole section. There is **no result per family** today. | Families add/sub to 20 and ×2, ×5, ×10. 19 of 19 right in 60 s, median 2.6 s. Accuracy secure, speed quick. |
| S10 | What the test left open | `profile.unknowns` (`untested`, `earlySigns`, `checkNext`) | Fact | All empty |
| S11 | Pace and rushing | `profile.behaviour` (`medianMs`, `veryFast`, `unreliable`, `rushRuns`, `leftOut`) | Fact, but there is no norm for "slow" | Median 64 s per question; no very fast answers; reliable |
| S12 | Late-test drop | `behaviour.thirds.drop` | Judged only with 3 or more questions in each third | No drop: 14 of 14, then 6 of 6 |
| S13 | Read-aloud use | `behaviour.readAloud` | Fact (since #184) | 0 uses on 42 questions |
| S14 | Shown work | `behaviour.whiteboard` | Fact | Work shown on 1 of 7 show-your-work questions |
| S15 | Help during the test | `behaviour.help` (`answer`, `flags`, `likely`) | Fact plus a code rule | Answered "no"; no flags; help not likely |
| S16 | Answer changes | `public.answers.answer_changes` | **Not a signal.** It stores each keystroke ("6", "65", "650"), not a change of mind. | 88 entries over 42 answers. Do not use. |
| S17 | Learning styles and interests | `children.learning_styles`, `children.interests` → `profile.preferences` | Parent | **Not answered** |
| S18 | Feeling, goal, weekly time | `children.math_feeling`, `learning_goal`, `weekly_time` → `profile.parent` | Parent | **Not answered** |
| S19 | Learner profile AI parts | `profile.ai` (`likelyCauses`, `howToHelp`, `nextChallenge`, `workbookPlan`) | Soft | `nextChallenge` 5.13, 6.12, 6.8. `workbookPlan`: review 20% (4.14, 4.5, 4.7, 4.8), stretch 80% (5.13, 6.12, 6.8). |
| S20 | Child profile AI findings | `ChildLearnerProfile.ai.findings` | Soft; needs events | None, because there is no profile and no events |
| S21 | Report | `public.reports.model`: `howWeHelp` (code), `summary` (AI, #68), `work[].comment` (AI) | `howWeHelp` is a code fact; the rest is soft | `howWeHelp` "ahead". The summary says "did very well in every area". One work image with no comment. |
| S22 | Test length and device | `reports.minutes`, `assessments.device` | Fact | 55 minutes, desktop, mouse |

The first customer has strong signals: a clear working level above his grade, at the ceiling, and quick facts. He has no weak signals, no mistakes with a code and no events, and the learning card is not answered. His book must be visibly his own from S1 to S15 and S19 to S21. S17 and S18 fall back to today's behaviour: Savar chose not to email the parent the card first (Q5).

## 2. Profile build

**Rule B1: the workbook job builds the profile at plan time.** On the first job call of a run (before a `RunFrame` exists), the job does these steps in order:

1. It rebuilds the learner profile of the child's latest finished BC test, when the stored one is missing a field this spec needs (for example the per-family facts, P1 in the tickets) or has another schema version. It uses `rebuildLearnerProfile` with the normal AI switch.
2. It always rebuilds the child profile, using `rebuildChildProfileNow`. This is cheap and uses compare and set. The AI findings run only when the child has events, as they do today.
3. It reads the profile with `readChildProfile` and plans from it. The `RunFrame` records the profile revision, as it does today.

A resume call never rebuilds. It uses the stored frame, so a run stays one book.

**Rule B2: fail closed.** A child who has a finished BC-scored test but whose profile cannot be built or read gets no generic book. The run fails with "We couldn't build <Name>'s profile from the assessment. Try again, or check the admin profile page." A child with no test plans exactly as today, from the grade alone.

**Rule B3: no backfill of live rows.** The three children without a child profile get one the first time their workbook is planned. No migration is needed.

**Other rebuilds**, most of which exist already:

- **Report job after a test finishes**, including a retake. It calls `rebuildChildProfileNow` last, and keeps doing so.
- **Learning card change.** `/api/account/learning` rebuilds both profiles, and keeps doing so.
- **Marked pages and Maya calls** will rebuild the profile once they write events (D-193, D-213). That is not part of this spec.
- **Admin "Preview plan"** builds the profile in memory with `childProfileFacts` (pure) and stores nothing. See section 6.

## 3. Placement

These are the terms the rules use:

- **G** is the school grade.
- **W** is the working level (S2).
- **Home level** is the first level of grade `min(W, 9)`, capped at U27 (D-153). For example, Grade 5 is U16 and Grade 4 is U13.
- **Weak** means a standard at or below G that is not secure (D-084). A standard above G is never weak.
- **Clearly weak** means weak with certainty "clear", for example 0 of 2.

The rules apply in order. The first one that matches decides the start.

| Rule | When | Start |
|---|---|---|
| P0 | The child has workbooks | As today: the newest workbook's level (later, the level test moves the child on) |
| P1 | No learner profile | As today: the lowest weak level at or below G, else the first level of G |
| P2 | W > G, and any of these: level certainty is an early sign, confidence is "low", `help.likely`, or `behaviour.unreliable` | The first level of G. The above-grade start needs a clear, trusted level. Its units get the stretch rules in section 4, item 2. |
| P3 | 2 or more clearly weak standards, or one clearly weak standard 2 or more grades below the home level | The lowest level holding a clearly weak standard: catch up first, as today |
| P4 | Exactly 1 clearly weak standard below the home level | The home level. The weak unit takes the support slot (the Unit B page, plan rule 4.9) in the first 2 books, with the mini-test on Day 6 of book 2. The child catches up while moving on. |
| P5 | Otherwise | The home level |

The rules apply inside every start level:

- **P5a: early-sign secure units are taught, not skipped.** In the first book, a unit of the start level is skipped (review only) only when its standard is secure **and clear**. A unit that is secure on 1 to 3 answers is taught from step 1, and marked pages move the child on faster (steps pass at 90%). Placement does this by handing the plan only the clear results as "secure", so no change to `workbook-plan.ts` is needed.
- **P5b: untested units** of the start level keep today's 4-item unit check.
- **P6: early-sign weak standards below the start level do not move the start.** Each one gets its skills in Remember these on Days 2, 3 and 4 (2 items each), 1 item in the Friday 5 on Day 5, and its spaced review from Day 2. If the check items come back wrong on marked pages, the next book's Fix it takes them.
- **P7: at the ceiling** (S3 true, with P5), the start stays at the home level. The book never guesses a level above what the test measured. The stretch is in section 4, item 2.
- **P8: never a weakness above grade** (D-084) stays. Above-grade wrong answers (5.13 here) never become review, Fix it or a Watch out line before their own level is taught. The admin view lists them as "above school grade, not a weakness".
- **P9: Kindergarten and U27** stay as today.

**The U16 case, encoded as a test.** G = 4, W = 5. The level is clear, confidence normal, help not likely, results reliable, at the ceiling.

- P2 does not apply. There are no weak standards, so P3, P4 and P6 do not apply. P5 gives the home level, **U16**.
- P5a: 5.1, 5.5, 5.10, 5.12 and 5.17 (secure on 1 to 2 answers) are taught.
- P5b: 5.8 and 5.9 (untested) get unit checks on Days 1 and 2.
- P8: 5.13 (0 of 1, a U17 unit) is not in the book.
- The step progression's window of three gives book 1 the units 5.1, 5.9 and 5.10. The probe on main showed this order once the skip was off.

## 4. What each signal changes in the book

Each rule names its gate, its change and its limit. "Today" means the book is made exactly as it is now. Every number below is a starting value for Savar to tune. The tests check the rule, not the taste.

### 1. Weak and not-secure standards (S5, S6, S8)

- **Order.** In the start level, a weak unit moves ahead of a unit that is not weak, unless it needs one of that unit's skills (the skill-map prerequisites). Otherwise the order is the skeleton's.
- **Extra practice.** A weak unit taught in the book adds 1 more practice page on its first step's day, inside the day's page count. It takes the place of a word-problems page that day, never Practice 2 or the Challenge.
- **Spaced review.** A weak skill's first review comes after 2 practice days, then 5, then 15. These are today's intervals, but they start from a weak skill's first taught day, not its last.
- **Weak below the start level:** P6.
- **Gate:** clearly weak and early-sign weak both count for order and review. Only clearly weak moves the start (P3, P4).
- **Test:** a persona with weak 4.3 gets 4.3 skills in Remember these on Days 2 to 4 and in the Friday 5. Remove the weakness and those items go.

### 2. Strengths, the ceiling and where to stretch (S2 to S5)

- **Secure below the start level:** review only, from the 15-day interval. That means less review than for weak standards.
- **Stretch shift.** When W > G (after P2), or the child is at the ceiling, every day uses `dayDifficulty(level, min(day + 2, 10))` for its number range and difficulty. Day 1 is then as hard as today's Day 3. The help level ("pictures" on Days 1 to 3) is kept as today: new ideas still get their pictures.
- **Challenge.** The 3 Challenge questions (D-228) take their step's hardest templates from Day 1. With today's schedule, that happens only on harder days. The other cards prefer the strongest secure standards of the steps taught or reviewed before.
- **Limit:** never above a skill's curriculum bound or its level. The Challenge stays inside D-228 (steps taught or reviewed before), so an AI "stretch" standard from another level never appears (see item 9).
- **Test:** at the same level, the first customer's Day 1 number range is wider than the sample child's, and his Challenge templates on Day 1 are "hard".

### 3. Mistakes and misconceptions (S7, S8)

The sources:

- the misconception ids on wrong answers to standards at or below G (`struggles[].wrong[].misconception`);
- the event mistakes (`ChildStandard.events.mistakes`, from marking and calls later);
- the stuck steps (`events.stuckSteps`).

The rules:

- **Watch out line.** When a planned step's curriculum `mistakes[]` names a misconception the child showed, the worked example's Watch out line uses that mistake's line instead of the step's default `spotTheError`. The line is code text from the step data. It needs a printable pair (wrong, fix) for each such mistake (ticket C2), and keeps today's once-a-day and length rules.
- **Spot the error.** A closed table maps misconception ids to Sam's mistakes, for example a dropped carry to `forgot-carry` and regrouping not taken to `regroup-not-taken`. On a step page whose sum allows it, Sam's mistake is the child's own mistake first. The others follow in today's order, at most once a day.
- **Fresh numbers only.** The book never reprints the child's question or answer (D-227).
- **Stuck steps:** the faded practice of that skill's step ends with 2 "finish this" items instead of 1.
- **Gate:** the mistake must be on a standard at or below G (D-084).
- **Fallback:** today's Watch out and Spot the error.
- **First customer:** his one wrong answer has no code and is above his grade, so nothing changes, as expected.
- **Test:** a persona with misconception `forgot-carry` on 4.4 gets that line on the 4.4 worked example and Sam's `forgot-carry` on the first Spot the error that allows it.

### 4. Fact speed and families (S9)

- **Per-family results.** The facts are drawn from the test seed, so code can re-derive each family's right answers and median time. Ticket P1 stores them in `profile.facts.byFamily`. Without them, the section's result applies to every family it asked.
- **The warm-up mix.** Families of the level's fluency skills fall into three groups:
  - **Known**: secure and quick.
  - **Needs practice**: accuracy or speed "needs-practice".
  - **Not measured**: not asked.

  In the 30 warm-up items of Days 1 to 5, known families take at most a third, needs practice and not measured families take at least half, and needs practice comes first in In your head. Days 6 to 10 mix all of the level's families evenly.
- **Fallback:** today's mix.
- **First customer:** add/sub to 20 and ×2, ×5, ×10 are known. The U16 fluency skills are 5.8 (extended facts) and 5.9 (recall of 2s, 3s, 4s, 5s and 10s), so ×3, ×4 and the extended facts take at least 15 of the 30 items on Days 1 to 5.
- **Test:** count the warm-up items by family in his fake book.

### 5. Interests (S17)

- **No AI wording.** Story text stays code-only (D-231). Interests only change which person-free nouns code offers to a story frame's `{thing}` and `{places}` slots.
- **The lists.** A new code list per interest id gives things and places that every frame they can fill allows (`frameDoes`), for example sports: balls, cones, medals, jerseys. Every listed word joins the story check's word lists (`storyKey`), so a printed story is still code's text with only its noun changed.
- **The share.** With interests, at least half and at most two thirds of the book's story items with a `{thing}` or `{places}` slot use an interest word. The rest use today's lists, for variety. Names are not keyed by interest.
- **Fallback:** today's lists.
- **First customer:** not answered, so no change unless Q5.
- **Test:** a sports persona's stories pages use sports words in 50% to 67% of the slots, and every story passes `codeStoryProblem`.

### 6. Learning styles (S17)

D-070 lets us name styles, but there is no evidence that matching a style helps. So a style only moves a share by one item a page, and never removes a part kind.

| Style | Change |
|---|---|
| Pictures | "picture" goes first in a practice slot's kinds where the step has a representation. The worked example keeps its picture when the panel fits. |
| Stories | The word-problems page holds the top of its range. Stories stay only on stories pages (Savar's U16 condition). |
| Worked examples | Faded practice (watch 1, finish 2) on the first practice page of every taught step, not just a new idea's day |
| Hands-on | A "draw" item in place of one practice item a page, where the skill's response type allows drawing |

- **Fallback:** today's.
- **Test:** for each style persona, the changed item count differs from the plain persona's by exactly the rule.

### 7. The parent's goal, feeling and weekly time (S18)

- **Goal "catch up":** P4 also applies to 2 early-sign weak standards (not only clearly weak), and the help level stays "pictures" to Day 5.
- **Goal "get ahead":** the stretch shift (item 2) applies also when W = G and the child is secure in every area.
- **Goal "keep up", or no answer:** no change.
- **Feeling "avoids":** the stretch shift is capped at +1, and the Challenge page is marked Extra (below).
- **Weekly time** sets the day's **required** estimate:

  | Weekly time | Required estimate |
  |---|---|
  | Under 1 hour | 20 minutes or less |
  | 1 to 2 hours | 25 minutes or less |
  | More time, or no answer | Today's: under 35 by the book's estimate (`dayTimeProblem`, Savar 2026-11-04) |

  Pages stay full (D-186 page counts, D-229 8 to 10 practice questions). Work above the required estimate is printed with a small "Extra" chip on whole blocks, in this order: the Challenge page, then the day's last practice page. The How + Plan page says "about N minutes" from the required estimate (D-229 derives it, never fixed copy).
- **Gate:** Savar's answer to Q6.
- **Fallback:** no Extra chip.
- **Test:** an under-1-hour persona's required estimate is 20 minutes or less on every day, and each Extra block is a whole block.

### 8. Behaviour and reading load (S11 to S16, S22)

- **Reads with help.** When read-aloud was used on 3 or more questions, stories use the short frames (`COMPACT_STORY_FRAMES`) where one exists for the operation, story text is at most 20 words, and the story share stays at 0.2 on every day (today it is 0.4 on Days 8 to 10).
- **Late-test drop** (`thirds.drop` true): the required estimate is lowered by 5 minutes.
- **Rushed** (`rushRuns` 1 or more, or `unreliable`): no stretch shift (P2 already blocks an above-grade start).
- **Pace alone** (`medianMs`): no change. We have no norm for slow, and a slow, accurate child (like the first customer) should not get easier work.
- **Shown work, test length and device:** recorded in the admin view, with no change. Savar removed redundant explain prompts, so we do not add any.
- **Answer changes:** never used (S16).
- **Test:** a read-aloud persona's stories are all 20 words or less, and no Day 8 to 10 page has more stories than the plain persona's.

### 9. AI findings and the report (S19 to S21)

These are soft signals. They may only break a tie that the facts leave open:

- which of several equally weak units goes first;
- which secure standards Remember these draws first;
- which allowed standard a Challenge card prefers.

They never:

- move the start;
- make a standard weak or secure;
- add a standard above grade or from another level;
- change a count, a share or a time.

The report's AI summary and work comments are not read by the generator. They come from the same facts.

The report's `howWeHelp` is a code fact, and it is a consistency check: "ahead" with a start below the home level, or "behind" with an above-grade start, shows a warning in the admin view.

- **First customer:** `workbookPlan` review 4.14 and 4.5 make those Remember these's first picks. The stretch 5.13, 6.12 and 6.8 are not in U16, so they are not used, and the admin view says why. `howWeHelp` "ahead" matches U16.
- **Test:** removing the AI parts changes only tie-breaks, never the start, the units or any count.

### 10. The cover line (S2 to S9)

Under "Made from <Name>'s assessment", one code-written sentence says one true, specific thing about the assessment and what the book does with it. The parts in priority order:

1. **Where it starts:**
   - ahead: "<Name> did very well on every part of the assessment, so this book moves ahead to <first 2 or 3 taught topics>."
   - weak first: "This book starts with <topic>, one step at a time, then moves on to <next topic>."
   - on level: "This book works on <topics>, at the level <Name> showed on the assessment."
2. **The warm-up**, when item 4 changed it and room is left: "Warm-ups add the 3s and 4s times tables."

Rules:

- One or two sentences.
- At most 30 words and 180 characters, and it must fit the cover box (layout check).
- No school grade (CONTEXT section 2: never show a grade on any page), no percent and no comparison with other children.
- Never a count of wrong answers, and nothing the facts do not show.
- The topics come from the plan's taught skills (`coverSkills`).
- Book 2 and later keep "Made from <Name>'s last workbook" and today's sentence, also when the last workbook has marks
  (Savar, 2026-11-05 on #476; `coverPage` in `src/lib/workbook-template.ts`).
- **First customer:** "<Name> did very well on every part of the assessment, so this book moves ahead to numbers to a million, multiplying by tens and pattern rules. Warm-ups add the 3s and 4s times tables." The topic words come from the curriculum's short titles.

## 5. Safety

**Precedence.** A lower signal may only choose among options a higher one leaves open:

1. Savar's decisions;
2. the curriculum skeleton's rules (D-192);
3. clear facts from the child's own answers;
4. early-sign facts;
5. the parent's card answers;
6. behaviour;
7. AI findings and report text.

**Bounds that personalization never crosses:**

- Ten days, five a week, pages a day by band (D-186). Saddle-stitch padding (D-191).
- 8 to 10 practice questions on practice and review pages (D-229). New idea floors (D-226).
- 3 Challenge questions a day, all harder than the day's practice, from steps taught or reviewed before (D-228).
- Friday 5 on Days 5 and 10, Show what you know on Day 10 (D-190).
- Story text is code-only (D-231), and stories only on stories pages.
- The main book never repeats a task. Spaced review uses fresh numbers (D-226, D-227).
- Commas from 1,000 (D-230). Natural titles of at most 4 words (D-201). "Circle" on choice pages.
- The day is under 35 minutes by the book's estimate. Every page still passes the fit and fullness checks.
- Never a weakness above the school grade (D-084). Never above U27 (D-153). Never a school grade on a page.

**Missing data falls back to today.** Each rule has a "today" path, taken when its signal is missing, null, or from an older schema. One golden test checks this: a profile with only grade and standards gives a plan identical to today's, field for field, and a fake book identical page for page.

**Deterministic.** The same profile revision, curriculum and seed give the same book. All personal choices are made at plan time and stored in the plan inside the `RunFrame`, so a resume makes the same book.

**Private.** The book, plan and admin trace never hold the free-text note, the parent's details or the child's answers as typed. They hold only standard codes, misconception ids and counts.

## 6. Admin "Why this book" view

The view goes on the admin draft page (`/admin/workbooks/[id]`) and the run page. It reads a trace stored in the plan (`plan.personal`), so it needs no new table.

1. **Inputs.** One row per signal S1 to S22, with what it said, how reliable it is (clear, early sign, parent, soft), and whether it was **used**, **not used** with the plain reason, or **missing**. Examples of reasons: "above school grade, not a weakness", "not in this level", "learning card not answered".
2. **Start.** The rule that decided it (P0 to P9), in one sentence. For example: "Started at U16: working level Grade 5 is clear and above the school grade, and nothing is weak." The admin view may name grades; pages may not.
3. **Pages.** For each page, the signals that shaped it, with the change. For example:
   - "Day 1 page 1, warm-up: facts known for add/sub to 20 and ×2, ×5, ×10, so 16 of 30 items are ×3, ×4 or extended facts."
   - "Day 3 page 7: Remember these first picks 4.14, 4.5 (AI tie-break)."
   - "Cover: ahead sentence."

   A page shaped by nothing says "Same as a standard book".
4. **Warnings.** A `howWeHelp` mismatch, a fallback taken for a child with a test, and an AI suggestion that was dropped.

**Preview plan.** A button on the admin child page builds the profile in memory, plans, and shows this view without starting a run or calling the AI. Savar can check the personalization before he presses "Prepare next workbook". Labels follow the plain admin label rule: no internal ids except standard codes, and no raw errors.

## 7. Tests and verification

- **Pure unit tests**, public interface only:
  - the signals module: reliability, fallback and precedence;
  - placement: P0 to P9, with one test per row, the U16 case, a behind case, early-sign versus clear weak, help likely blocking an above-grade start, and U27;
  - plan: each rule in section 4, plus the golden "no signals = today" test.
- **Personas.** `src/lib/workbook-sample-profiles.ts` gains full `ChildLearnerProfile` personas (made-up data, never a real child's):

  | Persona | Profile |
  |---|---|
  | **Ahead** | Shaped like the first customer: G4, W5 clear, at the ceiling, quick on add/sub 20 and ×2, ×5, ×10, no card |
  | **Catch up** | G4, W3. Clearly weak 3.3 and 4.4, with `forgot-carry`. Read-aloud on 6 questions. Goal catch up, under 1 hour. Animals. Pictures. |
  | **On level, interests** | G4, W4. Early-sign weak 4.3. ×3 not quick. Sports and space. Stories. Get ahead, 2 to 3 hours. |
  | **Rushed** | G4, W5 as an early sign. `unreliable`, help likely. |

  A test makes each persona's fake book and compares a fixed set of features:
  - start level and units;
  - warm-up families;
  - Spot the error mistakes;
  - Watch out lines;
  - interest words;
  - story lengths;
  - Extra blocks;
  - the cover sentence.

  Every pair of personas must differ in at least 3 features. Each persona must match its own expected values.
- **The first customer.** A fixture with his profile's shape (no name, no ids, no answer text) must give:
  - U16;
  - 5.1, 5.9 and 5.10 taught in book 1;
  - unit checks for 5.8 and 5.9;
  - no 5.13;
  - Day 1 at today's Day 3 difficulty, and hard Challenge templates from Day 1;
  - ×3, ×4 and extended facts on at least 15 of 30 warm-up items on Days 1 to 5;
  - today's interest lists and Watch out lines;
  - the cover sentence of section 4, item 10.
- **Live check, read-only.** Preview plan on the live admin for child `71ce22a1…` shows U16 and the same trace as the fixture. Nothing is stored except the profile rows B1 writes when a real run starts.
- **Integration**, per the round guide: full seeded U4 and U16 fake books, then the Ahead and Catch up personas at their levels. Then a real U16 sample with `--replay` for Savar, with its Why this book page.

## 8. Savar's answers (2026-11-04)

| # | Question | Recommendation | Savar |
|---|---|---|---|
| Q1 | A unit secure on only 1 to 3 test answers: teach it in the first book, or skip it to review? | **Teach it** (P5a). Skipping left the first customer's U16 book with one unit. Marked pages move him on fast. | Accepted: teach it |
| Q2 | An early-sign weak standard (for example 1 of 2) below the start: move the start down, as today, or keep the start and check and review it? | **Keep the start, check and review it** (P6). Only clearly weak (0 of 2 or worse) moves the start. | Accepted: keep the start, check and review |
| Q3 | An above-grade start needs a clear working level, normal confidence, no likely help and no rushing. Agree? | **Yes** (P2). Otherwise start at the first level of the school grade with the stretch shift. | Accepted |
| Q4 | At the test ceiling, start at the working level (U16) and stretch, or start higher (U17)? | **U16 and stretch** (P7, section 4 item 2). Start higher only after the U16 level test. | Accepted: U16 and stretch |
| Q5 | The first customer's learning card is empty. Email the parent the card before his book, or make it without? | **Email first**, with a 2-day wait, then make it either way. It fills interests, styles, goal and time. | **No email.** Make the book from his test alone |
| Q6 | Weekly time: print an "Extra" chip on the Challenge and last practice blocks above 20 or 25 required minutes, or leave weekly time out of book 1? | **The Extra chip** (section 4, item 7). It keeps pages full and the rules intact. | Accepted: the Extra chip |
| Q7 | The day limit: D-229 says under 30 minutes, the code and your note of 2026-11-04 say under 35. Which is binding? | **Under 35**, recorded as D-232, with D-229 updated | Accepted: under 35 (D-232) |
| Q8 | The cover sentence: no grades, no numbers, at most 30 words. OK with the first customer's draft? | **Yes**. It is true and specific without scores. | Accepted |
| Q9 | May the report's AI summary or the profile's AI plan change the book beyond tie-breaks? | **No.** Soft signals only break ties, and the view shows what they suggested. | Accepted: tie-breaks only |

## Ticket split

These are the lanes from [Workbook rounds](workbook-rounds.md), plus a new **Profile and placement** lane. Paths are in `src/lib/` unless shown. Sizes are rough: **S** is half a day or less, **M** about a day, **L** about two days.

**Running now:**

- **Layout:** `site/workbook-layout-checks`. It touches `workbook-generator.ts`, `workbook-quality.ts`, `workbook-template.ts`, `workbook-render.ts`, `workbook-fit.ts`, `print-engine-chromium.ts` and the new `workbook-layout-check.ts`.
- **Content:** `site/workbook-u4-floor`. It touches `workbook-generator.ts`, `workbook-plan.ts`, `workbook-step-items.ts`, `workbook-curriculum/house-templates.ts` and `data/curriculum/`.

The tickets marked "now" touch none of these files.

**Owners this round:**

- `workbook-generator.ts`: G1.
- `workbook-quality.ts`: L1.
- `workbook-book.ts`: G1, then B1.
- `workbook-plan.ts`: C3.

| Ticket | Lane | Work | Owned files | Needs | Acceptance | Size | Runs |
|---|---|---|---|---|---|---|---|
| **P1** Fact families | Profile and placement | Store right answers and median per fact family in the learner profile, as the optional `facts.byFamily`, within schema 1 | `assessment/facts.ts`, `assessment/profile.ts` and their tests | None | Re-derived from the seed. Old profiles read with no `byFamily`. Assessment core stays pure. | S | Now, in parallel |
| **P2** Profile at plan time | Profile and placement | B1 to B3: rebuild the learner profile when stale, rebuild the child profile, fail closed | `workbook-job.ts` (plan step only), `workbook-job-deps.ts`, `workbook-job-store.ts`, `workbook-job-memory.ts`, `child-profile-server.ts`, tests | None | A child with a test and no profile gets one, and the plan reads it. If the build fails with a test present, the run fails with a plain reason. A resume never rebuilds. No migration. | M | Now, in parallel |
| **P3** Book signals and personas | Profile and placement | New pure module: profile to `BookSignals` (S1 to S22, reliability, used or missing, reasons). Persona profiles. First customer fixture. | New `workbook-signals.ts`, `workbook-signals.test.ts`, `workbook-sample-profiles.ts` | P1 (handles it absent) | Each signal's gate and fallback. Answer changes are never read. Personas build. | M | Now, in parallel |
| **P4** Placement | Profile and placement | Rules P0 to P9, the clear-only "secure" handed to the plan (P5a), the support slot (P4), the start trace | `workbook-placement.ts`, new `workbook-placement.test.ts` | P3 | The U16 case. The probe check passes: U16 book 1 teaches 5.1, 5.9 and 5.10. A support slot (P4) with a standard from a lower level plans and fills with the step progression. One test per rule. No signals gives today's result. | M | After P3 |
| **C1** Interest word lists | Correctness | Code lists of things and places per interest. Add them to the story check lists. Frame checks. | New `workbook-interests.ts`, `workbook-wording.ts`, `workbook-code-story.ts`, tests | None | Every word passes each frame it can fill. `storyKey` treats them as nouns. No story text changes. | M | Now, in parallel |
| **C2** Mistake lines | Content | A printable Watch out pair for each step mistake with a misconception (fixed in-house, logged in `author-changes.md`). The misconception to Sam's mistake table. | `data/curriculum/`, `workbook-curriculum/`, new `workbook-mistake-map.ts` | u4-floor merged | Every pair passes `printable`, commas, 150 characters. The table is closed, and each entry is tested. | M | After u4-floor |
| **C3** Plan personal input | Content | Optional `PlanInput.personal`: weak order, extra page, weak review days (P6), stretch shift, hard Challenge from Day 1, help days, story share, required estimate. With it absent, the plan is the same. | `workbook-plan.ts`, `workbook-plan.test.ts`, `workbook-plan-steps.test.ts` | u4-floor merged, P3 | The golden "absent = today" test. Each rule of section 4, items 1, 2, 7 and 8, tested on the plan. | L | After u4-floor and P3 |
| **G1** Personal items | Generator owner | Wire the Watch out choice, Spot the error order, warm-up family mix, interest words offered, short frames for reading load, and style kind order | `workbook-generator.ts`, `workbook-book.ts`, `workbook-generator-items.ts` | layout-checks and u4-floor merged, C1, C2, C3 | The persona feature tests pass on fake books. Story check and solve check unchanged. Full U4 and U16 seeded books pass. | L | After C1, C2 and C3 |
| **L1** Extra blocks and required time | Layout | The "Extra" chip on whole blocks. The required estimate gate. How + Plan minutes from the required estimate. | `workbook-template.ts`, `workbook-quality.ts`, `workbook-feedback-check.ts`, layout tests | layout-checks merged, C3, Q6 answered | The under-1-hour persona stays at 20 minutes or less required. Pages stay full. Layout checks pass. | M | In parallel with G1 (separate files) |
| **B1** Cover line | Content | The code sentence of section 4, item 10, and its fit check | New `workbook-cover-line.ts`, `workbook-book.ts` (cover case only) | G1 merged, Q8 | The first customer's sentence, word for word. No grade or number. Each persona's sentence. Fits the cover. | S | After G1 |
| **A1** Why this book and Preview plan | Profile and placement | Store the trace in `plan.personal`. The admin section on the draft and run pages. Preview plan on the child page (in memory, no AI, no run). | New `workbook-why.ts`, `src/app/(product)/admin/workbooks/[id]/`, `src/app/(product)/admin/children/[id]/`, a new admin route for the preview | P4, C3 | The first customer's preview shows U16 with the inputs, start, page rows and warnings of section 6. Plain labels. Checked in the browser with Aside. | M | After P4 and C3, in parallel with G1 |
| **I1** Integration | Orchestrator | The round guide's integration, plus the persona books, the first customer fixture end to end, a real U16 `--replay` sample, and the Why page for Savar | Tests only (`workbook-personal-books.test.ts`) | Everything above | Every pair of personas differs in 3 or more features. The first customer checks of section 7 pass. The full gate passes. Savar approves U16. | M | Last |

**Order:**

1. **Now, in parallel:** P1, P2, P3 and C1.
2. **Then:** P4 after P3. C2 and C3 once u4-floor merges.
3. **Then:** G1 after C1, C2, C3 and layout-checks. A1 and L1 can run beside G1, because they own other files.
4. **Then:** B1 after G1.
5. **Last:** I1.

The first customer's book waits for I1 and Savar's approval of the U16 sample.
