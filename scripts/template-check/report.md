# Template check report

Made by `npm run check:templates` (scripts/check-templates.mjs). Bank: 1-2, 125 templates. Updated 2026-10-11 12:51 UTC.

Pass: 80. Review: 36. Fail: 9. Error: 0. Not checked: 0. Changed since its check: 0.

A template passes when Claude found its answers correct, its coded wrong answers wrong, and its BC grade right. Review means a wording problem or a province tag doubt that a person should decide.

## Fail (9)

### k-number-pattern

- A coded wrong answer is not wrong, or its misconception does not fit.
- The 'Treats a repeating pattern as one that keeps growing' distractor is always the largest number plus 1. That error does not produce it when the sequence ends on the smaller number. Example 2 (3,2,3,2,3,2): growing on from 2 gives 3, which is the correct answer, not 4. Example 3 (…,2): growing gives 3, not 5. Example 6 (…,1): growing gives 2, not 5. Example 8 (…,2): growing gives 3 or 5, not 6. Use last+1 as the distractor when it differs from the answer, or recode these four.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-greatest

- A coded wrong answer is not wrong, or its misconception does not fit.
- Example 1 (82, 28, 74): 74 is coded as 'compares digits in the wrong places'. Neither part of that misconception gives 74. Leading digit gives 82. Bigger ones digit gives 28, since 8 is the largest ones digit. Picking 74 fits a digit-sum error (7+4=11).
- Example 4 (29, 88, 92): 88 is coded the same way. Bigger ones digit gives 29, since 9 is the largest ones digit, not 88. Picking 88 fits a digit-sum or 'biggest digits' error.
- In both examples the coded misconception actually gives the answer coded as the tens-and-ones swap, so the two diagnoses cannot be told apart.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-skip-count-back

- A coded wrong answer is not wrong, or its misconception does not fit.
- Every first coded wrong answer is the last term minus 1 (for example 16 → 15, 35 → 34, 85 → 84). The coded misconception is 'Counts on by 1', which means counting forward and would give 17, 36, 86 and so on. The named error does not produce the coded answer. Recode to a direction-neutral misconception such as 'counts by 1 instead of the skip-counting step', or a 'counts back by 1' entry.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-shape-pattern-predict

- A coded wrong answer is not wrong, or its misconception does not fit.
- Three distractors are shapes that do not appear in the pattern: square in example 2, circle in example 5 and triangle in example 7. Each is coded 'Does not see the part of a pattern that repeats'. Misreading the core cannot produce a shape that is not in the pattern, so these are filler distractors with no plausible misconception.
- Wording: 'What shape is number 12?' is clearer as 'What is the 12th shape?'
- Wording: The read-aloud lists the options in a different order from the choices on screen. Example 1 reads 'square, star, circle' but the screen shows circle, star, square.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-true-equation

- A coded wrong answer is not wrong, or its misconception does not fit.
- The 'Makes a ten from one number but does not change the other number to match' code does not produce the distractor in examples 3, 4, 6 and 7. In example 3 (7+5), that error would give 10+5, but the distractor is 10+3. In example 4 (7+6), it would give 10+6, but the distractor is 10+4. In example 6 (6+7), it would give 10+7 or 10+6, but the distractor is 10+4. In example 7 (6+8), it would give 10+8 or 10+6, but the distractor is 10+5. These distractors come from writing the amount moved or from being off by one, not from the coded error. Examples 1, 2, 5 and 8 are coded correctly.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-decreasing-pattern

- A coded wrong answer is not wrong, or its misconception does not fit.
- In every example the second wrong answer is one less than the last term (9 after 10, 15 after 16, 24 after 25, and so on). That comes from counting back by 1. The coded misconception 'Counts on by 1 instead of by the skip-counting step' would give one more than the last term (11, 17, 26, ...), so it does not produce these answers. Recode to a 'counts back by 1 instead of by the step' misconception.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-change-unknown

- A coded wrong answer is not wrong, or its misconception does not fit.
- The 'counts the starting number' distractor (change + 1) only makes sense when the change is small enough to count on by ones (25+?=29 gives 5; 23+?=31 gives 9).
- For 10 + ? = 50, a child would count on by tens. Counting the start would give 5 or 50, not 41. Reaching 41 would need 40 one-steps, which no child would do.
- For 14 + ? = 41 (28) and 21 + ? = 43 (23), counting on by ones 27 or 22 times is not a plausible strategy, so these distractors are weak. The generator should only use this distractor when the change is about 10 or less.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-area-tiles

- The BC grade tag does not fit.
- The BC tag 3.9 covers linear, mass and capacity measurement only. It does not include area.
- BC (2016) teaches area of squares and rectangles in Grade 5. Tile-counting with small arrays might be Grade 4, but Grade 3 is more than one grade away. The template should be retagged.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-table-total

- A coded wrong answer is not wrong, or its misconception does not fit.
- In every example the first coded wrong answer is the sum of only two of the three classes (27 = 15+12, 38 = 18+20, 44 = 16+28, 44 = 19+25, 45 = 22+23, 52 = 29+23, 50 = 28+22, 56 = 29+27). The coded misconception 'Counts only one part instead of the whole' would give a single class value, not a two-class sum. It needs a misconception such as 'Leaves out one of the addends when adding several numbers'.
- The second wrong answer (the largest single class) is correctly matched to 'Counts only one part'.
- Wording: Read-aloud 'Class A read 11': browser voices often say 'read' in the present tense (reed). Many also read 'A' as the article 'uh'. Use 'Class A: 11 books' or 'Class A read eleven books' with past-tense phrasing such as 'finished'.
- Wording: The prompt says 'A table shows' but gives the data as inline text. Make sure a real table is rendered, or the sentence is misleading.
- Checked 2026-10-11 with claude-opus-5-5.

## Review (36)

### k-who-has-more

- The BC standard is tagged 'K2 ways to make 5', but this skill is comparing quantities, which belongs under K1 number concepts to 10. The amounts also go up to 9, so they are not limited to 5. Retag the standard.
- Wording: The read-aloud lists the choices in a different order from the screen. For example, it says 'Mia, they have the same or Leah' while the buttons show Leah / They have the same / Mia. A Kindergarten child who cannot read the names or 'They have the same' cannot use the spoken order to find the right button. Read the choices in the on-screen order.
- Checked 2026-10-11 with claude-opus-5-5.

### k-split-number

- Wording: The phrase '10 is 8 and how many more?' is unusual for a Kindergarten child. '8 and how many more make 10?' would match the k-make-five template and be clearer.
- Wording: All the dots are identical and show only the whole, not the two parts. A child who counts the dots may type the whole (for example 10) instead of the missing part. Colour the known part differently, or show only the known part.
- Checked 2026-10-11 with claude-opus-5-5.

### k-pattern-ab

- Wording: The read-aloud lists the choices in a different order from the screen. For example, it says 'a star, a square or a circle' while the buttons show circle / square / star. Read the choices in the on-screen order so a listening child can match them.
- Checked 2026-10-11 with claude-opus-5-5.

### k-pattern-abc

- Wording: Examples 2, 4, 7 and 8 (e.g. ★ ▲ ■ ★ ?) show the three-shape core only once, plus one shape. The repeating unit is not yet established, so a Kindergarten child cannot be expected to see a pattern. Show the core at least twice, as examples 1, 3, 5 and 6 do.
- Checked 2026-10-11 with claude-opus-5-5.

### k-pattern-aab

- Wording: Examples 5, 7 and 8 (e.g. ▲ ★ ★ ▲ ★ ?) show the core only once plus part of a second repeat. Kindergarten items should show the core at least twice so the pattern is established.
- Checked 2026-10-11 with claude-opus-5-5.

### k-balance-tips

- Wording: There is no picture, so the answer depends on 'left' and 'right', which many Kindergarten children have not mastered. A left/right mix-up would be wrongly coded as 'thinks the side that goes up holds more'. Add a picture or name the sides by object or colour.
- Checked 2026-10-11 with claude-opus-5-5.

### k-longer-line

- Wording: The lines are text strings (▬) inside answer buttons. If the buttons centre their text, the lines do not share a starting point, which direct comparison needs. Some fonts also show gaps between the characters, so a child may count pieces instead of comparing length. Render left-aligned images instead.
- Checked 2026-10-11 with claude-opus-5-5.

### k-heavier-object

- Wording: 'A big balloon' (examples 6 and 8) could make a child think of a water balloon, and a big water balloon is heavier than a small apple. Say 'a big balloon full of air'.
- Checked 2026-10-11 with claude-opus-5-5.

### k-balance-heavier

- Wording: The read-aloud puts 'they weigh the same' first or in the middle of the option list, for example 'Which is heavier: they weigh the same, the shoe or the apple?' (example 3) and 'the shoe, they weigh the same or the orange?' (example 2). This is ungrammatical and confusing when heard. Always end with 'or do they weigh the same?'
- Checked 2026-10-11 with claude-opus-5-5.

### k-can-roll

- Wording: The read-aloud lists the choices in a different order from the buttons in several examples (e.g. ex 3 says 'an orange, a block or a box' but shows A block / An orange / A box; also ex 4, 5, 6, 7, 8). A pre-reader cannot match the spoken order to the text-only buttons.
- Wording: The template mixes 'can roll' and 'cannot roll'. Kindergarten listeners often miss 'not'. Stress the word or keep one polarity.
- Checked 2026-10-11 with claude-opus-5-5.

### k-graph-which-more

- Wording: The dot rows start right after labels of different widths ('Apples:' vs 'Bananas:', 'Red:' vs 'Blue:'), so the rows do not share a baseline. A child comparing row lengths can be misled when the counts are close (6 vs 5, 6 vs 7). Align the rows the way a graph would.
- Wording: 'Children chose a favourite' does not say a favourite what (pet, colour, fruit).
- Checked 2026-10-11 with claude-opus-5-5.

### k-graph-count

- Wording: 'Children chose a favourite' does not say a favourite what. 'Red/Blue' is especially unclear without 'colour'.
- Checked 2026-10-11 with claude-opus-5-5.

### k-likely-event

- Wording: The read-aloud lists the choices in a different order from the buttons in every example (e.g. ex 1 says dinosaur, cow, car; the buttons show car, cow, dinosaur). The choices are long sentences a Kindergarten child cannot read, so they cannot match what they hear to a button.
- Wording: The browser voice reads the capitalised 'A dinosaur', 'You will' mid-sentence without a pause between items, so the three options can run together.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-pattern-letters

- Wording: Browser voices often read a lone capital 'A' as the article 'uh' rather than the letter name, so 'A A B' or 'A B C' may sound wrong. Spell the letters out (for example 'ay, ay, bee') or use separate SSML say-as letter tokens.
- Wording: When the choices are read as a run ('A B, A B B or A B C'), a listener cannot easily hear where one choice ends and the next begins. Add clear pauses or say 'choice one: A, B'.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-missing-addend

- The AB, SK and MB tags of grade 3 conflict with the BC and ON tags of grade 1 for the same easy task (sums of 10 or less).
- AB: suggests grade 1 (medium confidence). The 2022 AB curriculum treats equality and unknowns in addition and subtraction from grade 1. Grade 3 matches the old WNCP outcome for one-step equations, not the current curriculum.
- SK: suggests grade 1 (medium confidence). The formal outcome for one-step equations with a symbol (P3.2) is grade 3. But finding a missing part within 10 is taught in grade 1 through decomposing numbers and addition and subtraction to 20. Grade 3 overstates the difficulty.
- MB: suggests grade 1 (medium confidence). The formal outcome for one-step equations with a symbol is grade 3. But missing parts within 10 are handled in grade 1 through decomposing numbers to 20 and thinking addition for subtraction. The two-grade gap from BC and ON is suspect.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-pattern-predict

- Examples 2 and 5 have the same prompt (▲ ▲ ●, number 9). The generator can repeat items.
- Wording: 'What shape is number 11?' gives no numbered positions. A grade 1 child may not know it means the 11th shape in the line. Saying 'the 11th shape' or showing position numbers would be clearer.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-letters-to-shapes

- The AB pattern is always the shortest choice (4 shapes, while the others have 6). A child can pick it by length alone.
- Wording: A browser voice may read the letter 'A' in 'an A A B pattern' as the article 'uh', so it sounds like 'an uh uh B pattern'. Write the letters so they are spoken as letter names, for example 'ay ay bee', or say them one at a time.
- Wording: The read-aloud does not read the choices. A child who cannot name the shapes gets no audio help comparing them. This is acceptable for a visual task, but worth noting.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-equal-or-not

- Wording: The read-aloud says 'Yes, they are the same.' The choice reads 'Yes, they are the same amount.' The meaning is the same, so this is minor.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-unit-size

- Both wrong answers in every example use the same 'bigger unit' code. 'Exactly N' fits a separate idea better (thinks the count stays the same because the object did not change), if the catalogue has a separate entry for that.
- ON: suggests grade 1 (medium confidence). In the 2020 ON curriculum, grade 1 E2 includes describing the inverse relationship between unit size and the number of units needed.
- Wording: The prompt asks 'What will Liam get?' but gives no options in the text. Only the read-aloud names the three options. This is acceptable because the choices are shown, but the prompt could match the read-aloud.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-more-likely

- Wording: The read-aloud lists options in a different order from the on-screen choices. Example 2 says bird, penguin, equal, but the screen shows bird, equal, penguin. Example 4 reads 'equally likely' first, but the screen shows it last. A listening child may match the wrong button.
- Wording: In examples 4 and 5 the read-aloud opens the list with 'they are equally likely, ...'. This sounds like one of the events, and the question becomes confusing: 'Which is more likely to happen? they are equally likely, It will rain lemonade...'.
- Wording: The prompt shows only 'Which is more likely to happen?'. The events appear only as choices, so non-readers depend entirely on the read-aloud, which has the ordering problems above.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-length-together

- Wording: 'Put end to end, how many paper clips long are they together?' is a dangling phrase. 'If you put them end to end, ...' is clearer for a Grade 1 reader.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-coins-mixed

- AB: suggests grade 2 (low confidence). The Grade 4 tag follows the old WNCP placement of money with decimals. AB's 2022 K–6 curriculum may bring coin values to an earlier grade. Verify.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-make-ten-strategy

- Wording: In examples 2, 4, 5, 7 and 8 the read-aloud lists the choices in a different order than the choice buttons. For example, in example 2 the voice says '10 plus 7, 10 plus 5 or 10 plus 9' but the buttons show 10 + 9, 10 + 5, 10 + 7.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-number-pattern-predict

- Wording: 'What number is number 10 in the pattern?' is confusing because the terms themselves are numbers. A child may look for the value 10 or misread the question. Use 'What is the 10th number in the pattern?' in both the prompt and the read-aloud.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-square-or-rectangle

- Wording: In most examples the read-aloud lists the shapes in a different order than the choice buttons. For example, in example 1 the voice says 'a square, a circle or a rectangle' but the buttons show rectangle, square, circle.
- Wording: Small point: the read-aloud starts each choice list with a lowercase 'a' after a question mark ('...? a square, ...'). A browser voice reads this fine, but it is inconsistent as written text.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-turned-shape

- Wording: The read-aloud lists the choices in a different order than the buttons in every example. For example, in example 1 the voice reads 'Still a square' first, but that button is shown third.
- Wording: The square examples (1 and 4) show no picture, while the rectangle and triangle examples show one (▮, ▼). Consider adding ◆ so the square examples match.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-face-of-solid

- The pyramid item gives away its answer in the prompt.
- Choosing 'triangle' for the cone or pyramid more likely comes from seeing the side view or side faces than from mixing up shape names. A more specific misconception code would be more useful.
- Wording: The pyramid example asks 'What shape is the bottom of a pyramid with a square base?'. The answer is in the question, so the item tests nothing. Reword it, for example 'What shape is the flat bottom of this pyramid?' with a picture, or use a triangular-based pyramid.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-roll-and-stack

- Wording: In most examples the read-aloud lists the objects in a different order than the choice buttons. For example, in example 1 the voice says 'an ice cube, a ball or a drum' but the buttons show ice cube, drum, ball.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-graph-in-all

- Wording: The read-aloud does not read the categories or dot counts, so it does not say the same as the prompt. A child relying on the voice gets no data.
- Wording: The prompt says 'on the graph', but the data appears as inline text rows. If no real graph is drawn, the word 'graph' may confuse a young child.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-graph-fewer

- Wording: The read-aloud does not give the star counts, so it does not match the prompt's data.
- Wording: The prompt never says what the children chose, such as a favourite season or fruit. 'chose winter' has no context.
- Wording: Rows of 10 to 12 stars in one line of text are hard for a Grade 2 child to count reliably. Group the stars or show them as a graph.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-spinner

- Wording: '1 equal green part' is awkward: 'equal' has nothing to compare with in the singular. Say 'A spinner has 6 equal parts: 5 are blue and 1 is green.'
- Wording: The read-aloud says 'both equally likely', but the choice reads 'Blue and green are equally likely'. Make them match.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-money-total

- Wording: The read-aloud puts two numbers side by side ('2 5 dollar bills', '1 20 dollar bill', '2 10 dollar bills'). A browser voice says 'two five dollar bills', which a child can hear as 'twenty-five dollar bills'. Write the counts as words, e.g. 'two five-dollar bills'.
- Wording: On screen, '2 $5 bills' and '2 $20 bills' put the count right next to the bill value. This is easy for a Grade 3 reader to misread; 'two $5 bills' is clearer.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-increasing-pattern

- BC Grade 2 already teaches 'repeating and increasing patterns'. These small-number examples are at Grade 2 level, but they are within one grade of the Grade 3 tag.
- AB: suggests grade 2 (medium confidence). Increasing patterns with numbers under 100 are a Grade 2 outcome (PR2). Grade 3 extends them to 1000; these terms stay under 30.
- SK: suggests grade 2 (medium confidence). Grade 2 covers increasing patterns. Small numbers with steps of 3 or 4 sit at Grade 2 level.
- MB: suggests grade 2 (medium confidence). Grade 2 PR2 covers increasing patterns to 100.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-pattern-rule

- Wording: The read-aloud lists the choices in a different order from the screen in 6 of 8 examples (all except the 2, 7, 12, 17 and 6, 10, 14, 18 examples). Read them in the displayed order.
- Wording: All three choices sound almost the same when spoken ('Start at 3 and add 5' vs 'Start at 5 and add 3'). The voice reads them in one run with no labels or pauses, which is hard for a Grade 3 listener to hold. Add choice labels or pauses.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-mass-unit

- Wording: The read-aloud lists the choices in a different order from the screen. For the potatoes, it says 'metres, kilograms or grams' while the screen shows Grams, Metres, Kilograms. A child who listens and then clicks by position may be confused. Read the choices in the on-screen order, or leave them out of the read-aloud.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-bar-graph-more

- Wording: The prompt says 'A bar graph shows…' but no graph is displayed. A child may look for a missing picture. The item also tests only comparison subtraction, not reading a graph. Either show the graph or reword it as data in a sentence.
- Checked 2026-10-11 with claude-opus-5-5.

## Pass (80)

- `k-count-shapes` (2026-10-11, claude-opus-5-5)
- `k-number-after` (2026-10-11, claude-opus-5-5)
- `k-number-before` (2026-10-11, claude-opus-5-5)
- `k-missing-number` (2026-10-11, claude-opus-5-5)
- `k-make-five` (2026-10-11, claude-opus-5-5)
- `k-rest-are` (2026-10-11, claude-opus-5-5)
- `k-in-all` (2026-10-11, claude-opus-5-5)
- `k-how-many-more` (2026-10-11, claude-opus-5-5)
- `k-take-away` (2026-10-11, claude-opus-5-5)
- `k-balance-match` (2026-10-11, claude-opus-5-5)
- `k-shape-attribute` (2026-10-11, claude-opus-5-5)
- `1-ten-and-more` (2026-10-11, claude-opus-5-5)
- `1-skip-count` (2026-10-11, claude-opus-5-5)
- `1-smallest-biggest` (2026-10-11, claude-opus-5-5)
- `1-more-or-less` (2026-10-11, claude-opus-5-5)
- `1-make-ten` (2026-10-11, claude-opus-5-5)
- `1-count-coins` (2026-10-11, claude-opus-5-5)
- `1-add-to-20` (2026-10-11, claude-opus-5-5)
- `1-subtract-from-20` (2026-10-11, claude-opus-5-5)
- `1-story-add` (2026-10-11, claude-opus-5-5)
- `1-story-take` (2026-10-11, claude-opus-5-5)
- `1-story-compare` (2026-10-11, claude-opus-5-5)
- `1-pattern-four` (2026-10-11, claude-opus-5-5)
- `1-pattern-missing` (2026-10-11, claude-opus-5-5)
- `1-number-pattern` (2026-10-11, claude-opus-5-5)
- `1-build-to` (2026-10-11, claude-opus-5-5)
- `1-which-sum-more` (2026-10-11, claude-opus-5-5)
- `1-change-story` (2026-10-11, claude-opus-5-5)
- `1-balance-cubes` (2026-10-11, claude-opus-5-5)
- `1-cubes-longer` (2026-10-11, claude-opus-5-5)
- `1-order-three` (2026-10-11, claude-opus-5-5)
- `1-shape-sides` (2026-10-11, claude-opus-5-5)
- `1-sides-in-all` (2026-10-11, claude-opus-5-5)
- `1-graph-how-many-more` (2026-10-11, claude-opus-5-5)
- `1-graph-in-all` (2026-10-11, claude-opus-5-5)
- `1-never-sometimes-always` (2026-10-11, claude-opus-5-5)
- `1-cover-card` (2026-10-11, claude-opus-5-5)
- `1-tallest-child` (2026-10-11, claude-opus-5-5)
- `1-heaviest-box` (2026-10-11, claude-opus-5-5)
- `2-digit-value` (2026-10-11, claude-opus-5-5)
- `2-even-or-odd` (2026-10-11, claude-opus-5-5)
- `2-ten-more-less` (2026-10-11, claude-opus-5-5)
- `2-tens-and-ones` (2026-10-11, claude-opus-5-5)
- `2-add-2-digit` (2026-10-11, claude-opus-5-5)
- `2-subtract-2-digit` (2026-10-11, claude-opus-5-5)
- `2-story-add-2-digit` (2026-10-11, claude-opus-5-5)
- `2-story-subtract-2-digit` (2026-10-11, claude-opus-5-5)
- `2-balance-equation` (2026-10-11, claude-opus-5-5)
- `2-missing-left` (2026-10-11, claude-opus-5-5)
- `2-missing-addend` (2026-10-11, claude-opus-5-5)
- `2-increasing-pattern` (2026-10-11, claude-opus-5-5)
- `2-pattern-core` (2026-10-11, claude-opus-5-5)
- `2-change-unknown` (2026-10-11, claude-opus-5-5)
- `2-pattern-rows` (2026-10-11, claude-opus-5-5)
- `2-missing-in-pattern` (2026-10-11, claude-opus-5-5)
- `2-change-unknown-add` (2026-10-11, claude-opus-5-5)
- `2-ruler-length` (2026-10-11, claude-opus-5-5)
- `2-length-unit` (2026-10-11, claude-opus-5-5)
- `2-certain-possible` (2026-10-11, claude-opus-5-5)
- `2-compare-lengths` (2026-10-11, claude-opus-5-5)
- `2-sides-in-all` (2026-10-11, claude-opus-5-5)
- `3-build-number` (2026-10-11, claude-opus-5-5)
- `3-ten-more-less` (2026-10-11, claude-opus-5-5)
- `3-greatest` (2026-10-11, claude-opus-5-5)
- `3-after-99` (2026-10-11, claude-opus-5-5)
- `3-digit-value` (2026-10-11, claude-opus-5-5)
- `3-add-3-digit` (2026-10-11, claude-opus-5-5)
- `3-subtract-across-zero` (2026-10-11, claude-opus-5-5)
- `3-story-subtract` (2026-10-11, claude-opus-5-5)
- `3-equal-groups` (2026-10-11, claude-opus-5-5)
- `3-share-equally` (2026-10-11, claude-opus-5-5)
- `3-start-unknown` (2026-10-11, claude-opus-5-5)
- `3-balance-equation` (2026-10-11, claude-opus-5-5)
- `3-growing-tables` (2026-10-11, claude-opus-5-5)
- `3-length-convert` (2026-10-11, claude-opus-5-5)
- `3-solid-parts` (2026-10-11, claude-opus-5-5)
- `3-time-units` (2026-10-11, claude-opus-5-5)
- `3-days-weeks` (2026-10-11, claude-opus-5-5)
- `3-bag-likely` (2026-10-11, claude-opus-5-5)
- `3-coin-streak` (2026-10-11, claude-opus-5-5)
