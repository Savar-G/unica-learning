# Template check report

Made by `npm run check:templates` (scripts/check-templates.mjs). Bank: 1-2, 125 templates. Updated 2026-10-11 17:37 UTC.

Pass: 96. Review: 29. Fail: 0. Error: 0. Not checked: 0. Changed since its check: 0.

A template passes when Claude found its answers correct, its coded wrong answers wrong, and its BC grade right. Review means a wording problem or a province tag doubt that a person should decide.

## Review (29)

### k-who-has-more

- Wording: In every example the read-aloud lists the choices in a different order from the screen. For example 1 the screen shows Leah / Same / Mia and the voice says Mia / Same / Leah. A pre-reader who picks by position after listening could be misled.
- Checked 2026-10-11 with claude-opus-5-5.

### k-pattern-ab

- Wording: In most examples the read-aloud gives the choices in a different order from the screen (for example, the screen shows circle, square, star and the voice says star, square, circle). This can mislead a child who relies on the audio.
- Checked 2026-10-11 with claude-opus-5-5.

### k-pattern-abc

- Wording: The read-aloud choice order does not match the screen order (for example, the screen shows square, star, circle and the voice says circle, star, square).
- Checked 2026-10-11 with claude-opus-5-5.

### k-pattern-aab

- Minor: the id says aab, but 6 of the 8 examples have ABB cores. The skill is still within K4.
- Wording: The read-aloud choice order does not match the screen order (for example, the screen shows square, star, triangle and the voice says square, triangle, star).
- Checked 2026-10-11 with claude-opus-5-5.

### k-longer-line

- The template id says 'longer', but 5 of the 8 examples ask 'shorter'. This is fine if intended.
- Wording: The lines are made of ▬ characters inside choice buttons. If the buttons are centred, the lines do not start from a common baseline, and close pairs such as 8 and 10 or 6 and 8 become hard to compare. The characters may also show gaps, so a child may count pieces instead of comparing length.
- Wording: If a screen reader or browser voice reads the choices, it will say 'black rectangle' many times.
- Checked 2026-10-11 with claude-opus-5-5.

### k-shape-attribute

- AB: suggests K (low confidence). AB 2022 Kindergarten geometry seems to include exploring and describing 2D shapes, so K may fit better than grade 1. I am not sure of the exact outcome.
- Checked 2026-10-11 with claude-opus-5-5.

### k-can-roll

- Wording: The choices are text only and most Kindergarten children cannot read them. The read-aloud lists the options in a different order from the buttons (e.g. 'an orange, a box or a book' vs buttons Orange, Book, Box), so a child who relies on the audio cannot match spoken options to buttons. Use pictures or make the spoken order match the button order.
- Checked 2026-10-11 with claude-opus-5-5.

### k-likely-event

- Wording: The choices are long sentences that a Kindergarten child cannot read. The read-aloud gives them in a different order from the buttons (e.g. ex1 says dinosaur, cow, car but the buttons show car, cow, dinosaur), so a child cannot match the audio to a button. Use pictures or make the spoken order match the button order.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-count-coins

- AB: suggests grade 2 (low confidence). Counting coins of one kind by 5s and 10s up to 100 cents fits early skip-counting with money. I am unsure where the 2022 Alberta curriculum places coin values, but grade 4 (decimal money) looks too late for this skill.
- SK: suggests grade 2 (medium confidence). The grade 2 skip-counting outcome (N2.1, WNCP-based) includes an indicator about counting sums of pennies, nickels or dimes up to 100 cents. Grade 4 money outcomes cover decimal notation, which is harder than this.
- MB: suggests grade 2 (medium confidence). In the WNCP-based grade 2 outcome N1 (skip counting), counting sums of nickels or dimes up to 100 cents is an achievement indicator. Grade 4 covers decimal money.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-pattern-four

- Wording: The read-aloud choice order does not match the screen order (for example, the screen shows star, square, triangle and the voice says square, triangle, star).
- Checked 2026-10-11 with claude-opus-5-5.

### 1-pattern-missing

- Wording: The read-aloud choice order does not match the screen order (for example, the screen shows star, triangle, circle and the voice says circle, triangle, star).
- Checked 2026-10-11 with claude-opus-5-5.

### 1-pattern-letters

- Wording: The read-aloud order of the choices does not match the screen order in most examples (for example 1, the screen shows ABB / AB / ABC and the voice says AB / ABB / ABC).
- Wording: Choices are separated only by periods in 'letter A, letter B. letter A, letter B, letter B.', so a browser voice gives almost no audible break between choices.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-missing-addend

- AB/SK/MB tags of grade 3 seem two grades too late for missing addends with sums to 10.
- AB: suggests grade 1 (low confidence). Finding the missing part within 10 (part-part-whole, think-addition, equality as balance) is Grade 1 work in the 2022 AB curriculum. Grade 3 is the old WNCP outcome for formal symbolic one-step equations, which is harder than these sums to 10.
- SK: suggests grade 1 (medium confidence). SK Grade 1 addition and subtraction to 20 (N1.10), including think-addition for subtraction, covers missing addends to 10. P3.3 (one-step equations with a symbol) is Grade 3, but at sums to 10 this is Grade 1 work, not two grades later.
- MB: suggests grade 1 (medium confidence). Same WNCP reasoning: 1.N.9 and 1.N.10 (addition to 20, think-addition strategies) cover this. 3.PR.4 formalizes symbolic equations, but at this difficulty the skill sits in Grade 1.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-unit-size

- ON: suggests grade 1 (medium confidence). The 2020 Grade 1 E2.2 asks students to describe the inverse relationship between unit size and the number of units. Grade 2 revisits it.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-graph-how-many-more

- Wording: The dot rows are inline text after labels of different lengths ('Apples:' vs 'Bananas:', 'Cats:' vs 'Dogs:'). The rows do not start at a common baseline and may wrap, so the child cannot match dots one-to-one as a concrete graph intends. Render the data as aligned rows or columns.
- Checked 2026-10-11 with claude-opus-5-5.

### 1-cover-card

- SK: suggests grade 1 (medium confidence). SS1.1 includes comparing by covering. The Grade 2 non-standard-unit outcomes cover only length and mass, not area.
- MB: suggests grade 1 (medium confidence). Grade 1 SS1 includes comparing by covering. Grade 2 SS2 and SS3 non-standard units cover length and mass only.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-coins-mixed

- The AB, SK and MB tags of grade 4 look too high for counting coins in cents. Most examples include quarters, which suggests grade 3 for SK and MB.
- AB: suggests grade 2 (low confidence). Counting coin collections in cents is a whole-number skip-counting task. Grade 4 is where decimal dollar notation appears, not cent counting. Exact placement in the 2022 AB curriculum is uncertain.
- SK: suggests grade 3 (medium confidence). In the WNCP-based outcomes, counting nickels and dimes to 100 cents is a grade 2 indicator (N2.1). Adding quarters is a grade 3 indicator (N3.1). Grade 4 money work is decimals.
- MB: suggests grade 3 (medium confidence). The 2.N.1 indicator counts pennies, nickels and dimes to 100 cents. The 3.N.1 indicator adds quarters. Grade 4 is decimal money, a different skill.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-make-ten-strategy

- Wording: In several examples the read-aloud says the choices in a different order from the screen. Example 2 shows 10 + 9, 10 + 5, 10 + 7 but reads 10 + 7, 10 + 5, 10 + 9. Examples 4, 5, 7 and 8 also differ. A child who follows the audio may click the wrong position.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-face-of-solid

- The ON tag is probably grade 1 rather than grade 2 (medium confidence).
- The side-view misconception would most naturally give 'rectangle' for a can or drum. 'square' is still plausible because rectangle is not a choice and young children often call rectangles squares.
- ON: suggests grade 1 (medium confidence). ON 2020 Grade 1 E1.2: identify 2-D shapes contained within objects and structures. The Grade 2 geometry expectations focus on sorting and composing 2-D shapes instead.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-roll-and-stack

- Wording: The read-aloud lists the options in a different order from the on-screen choices in every example (e.g. ex1 says block, ball, jar but shows jar, block, ball). A child who listens may match the wrong button.
- Wording: The read-aloud names the options but the printed prompt does not, so the spoken and written questions differ.
- Wording: 'Can be stacked into a tower' is ambiguous for a single object. A child may wonder whether something can be stacked on the object or whether many copies of it make a tower. 'Can be stacked into a tower of many' or 'you can stack them' would be clearer.
- Wording: Some children may answer from the real object rather than the shape. A real orange is not a perfect sphere, and a sugar cube is small. The answers still hold, so this is a minor point.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-spinner

- Wording: In several examples the read-aloud says the choices in a different order from the screen. For example, in example 1 the screen shows Blue, Green, Equally likely, but the voice says Equally likely, Green, Blue. A child who listens and then picks by position could choose wrongly.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-build-number

- AB: suggests grade 2 (medium confidence). The 2022 AB program appears to extend place value to 1000 in Grade 2.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-ten-more-less

- AB: suggests grade 2 (medium confidence). The 2022 AB program appears to work with numbers to 1000 in Grade 2.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-greatest

- AB: suggests grade 2 (medium confidence). The 2022 AB program appears to compare and order numbers to 1000 in Grade 2.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-after-99

- AB: suggests grade 2 (medium confidence). Alberta's 2022 K-6 math curriculum appears to extend whole numbers to 1000 in Grade 2. Counting across a hundred up to 899 would then be a Grade 2 outcome.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-digit-value

- AB: suggests grade 2 (medium confidence). Alberta's 2022 curriculum appears to place 3-digit place value (numbers to 1000) in Grade 2.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-share-equally

- ON: suggests grade 2 (medium confidence). Ontario Grade 2 already covers division as equal sharing with small numbers. This also clashes with the 3-equal-groups template, which tags ON as Grade 2.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-pattern-rule

- Wording: The read-aloud order of the choices differs from the screen order in several examples (1, 3, 4, 5, 6, 7, 8). This matters because the choices differ only in which number is the start and which is the step.
- Checked 2026-10-11 with claude-opus-5-5.

### 3-bar-graph-more

- No graph is shown, so the item tests only subtraction within 20. It does not test reading a bar graph, which is what standard 3.12 targets.
- Wording: The prompt refers to 'the bar' of a graph that is not shown. A child may look for a picture that is not there.
- Checked 2026-10-11 with claude-opus-5-5.

## Pass (96)

- `k-count-shapes` (2026-10-11, claude-opus-5-5)
- `k-number-after` (2026-10-11, claude-opus-5-5)
- `k-number-before` (2026-10-11, claude-opus-5-5)
- `k-missing-number` (2026-10-11, claude-opus-5-5)
- `k-make-five` (2026-10-11, claude-opus-5-5)
- `k-split-number` (2026-10-11, claude-opus-5-5)
- `k-rest-are` (2026-10-11, claude-opus-5-5)
- `k-in-all` (2026-10-11, claude-opus-5-5)
- `k-number-pattern` (2026-10-11, claude-opus-5-5)
- `k-how-many-more` (2026-10-11, claude-opus-5-5)
- `k-take-away` (2026-10-11, claude-opus-5-5)
- `k-balance-match` (2026-10-11, claude-opus-5-5)
- `k-balance-tips` (2026-10-11, claude-opus-5-5)
- `k-heavier-object` (2026-10-11, claude-opus-5-5)
- `k-balance-heavier` (2026-10-11, claude-opus-5-5)
- `k-graph-which-more` (2026-10-11, claude-opus-5-5)
- `k-graph-count` (2026-10-11, claude-opus-5-5)
- `1-ten-and-more` (2026-10-11, claude-opus-5-5)
- `1-skip-count` (2026-10-11, claude-opus-5-5)
- `1-smallest-biggest` (2026-10-11, claude-opus-5-5)
- `1-more-or-less` (2026-10-11, claude-opus-5-5)
- `1-make-ten` (2026-10-11, claude-opus-5-5)
- `1-add-to-20` (2026-10-11, claude-opus-5-5)
- `1-subtract-from-20` (2026-10-11, claude-opus-5-5)
- `1-story-add` (2026-10-11, claude-opus-5-5)
- `1-story-take` (2026-10-11, claude-opus-5-5)
- `1-story-compare` (2026-10-11, claude-opus-5-5)
- `1-number-pattern` (2026-10-11, claude-opus-5-5)
- `1-build-to` (2026-10-11, claude-opus-5-5)
- `1-which-sum-more` (2026-10-11, claude-opus-5-5)
- `1-pattern-predict` (2026-10-11, claude-opus-5-5)
- `1-letters-to-shapes` (2026-10-11, claude-opus-5-5)
- `1-change-story` (2026-10-11, claude-opus-5-5)
- `1-balance-cubes` (2026-10-11, claude-opus-5-5)
- `1-equal-or-not` (2026-10-11, claude-opus-5-5)
- `1-cubes-longer` (2026-10-11, claude-opus-5-5)
- `1-order-three` (2026-10-11, claude-opus-5-5)
- `1-shape-sides` (2026-10-11, claude-opus-5-5)
- `1-sides-in-all` (2026-10-11, claude-opus-5-5)
- `1-graph-in-all` (2026-10-11, claude-opus-5-5)
- `1-never-sometimes-always` (2026-10-11, claude-opus-5-5)
- `1-more-likely` (2026-10-11, claude-opus-5-5)
- `1-length-together` (2026-10-11, claude-opus-5-5)
- `1-tallest-child` (2026-10-11, claude-opus-5-5)
- `1-heaviest-box` (2026-10-11, claude-opus-5-5)
- `2-digit-value` (2026-10-11, claude-opus-5-5)
- `2-even-or-odd` (2026-10-11, claude-opus-5-5)
- `2-ten-more-less` (2026-10-11, claude-opus-5-5)
- `2-greatest` (2026-10-11, claude-opus-5-5)
- `2-tens-and-ones` (2026-10-11, claude-opus-5-5)
- `2-skip-count-back` (2026-10-11, claude-opus-5-5)
- `2-add-2-digit` (2026-10-11, claude-opus-5-5)
- `2-subtract-2-digit` (2026-10-11, claude-opus-5-5)
- `2-story-add-2-digit` (2026-10-11, claude-opus-5-5)
- `2-story-subtract-2-digit` (2026-10-11, claude-opus-5-5)
- `2-three-addends` (2026-10-11, claude-opus-5-5)
- `2-balance-equation` (2026-10-11, claude-opus-5-5)
- `2-missing-left` (2026-10-11, claude-opus-5-5)
- `2-missing-addend` (2026-10-11, claude-opus-5-5)
- `2-increasing-pattern` (2026-10-11, claude-opus-5-5)
- `2-pattern-core` (2026-10-11, claude-opus-5-5)
- `2-change-unknown` (2026-10-11, claude-opus-5-5)
- `2-pattern-rows` (2026-10-11, claude-opus-5-5)
- `2-number-pattern-predict` (2026-10-11, claude-opus-5-5)
- `2-shape-pattern-predict` (2026-10-11, claude-opus-5-5)
- `2-true-equation` (2026-10-11, claude-opus-5-5)
- `2-missing-in-pattern` (2026-10-11, claude-opus-5-5)
- `2-change-unknown-add` (2026-10-11, claude-opus-5-5)
- `2-ruler-length` (2026-10-11, claude-opus-5-5)
- `2-length-unit` (2026-10-11, claude-opus-5-5)
- `2-square-or-rectangle` (2026-10-11, claude-opus-5-5)
- `2-turned-shape` (2026-10-11, claude-opus-5-5)
- `2-graph-in-all` (2026-10-11, claude-opus-5-5)
- `2-graph-fewer` (2026-10-11, claude-opus-5-5)
- `2-certain-possible` (2026-10-11, claude-opus-5-5)
- `2-compare-lengths` (2026-10-11, claude-opus-5-5)
- `2-sides-in-all` (2026-10-11, claude-opus-5-5)
- `3-add-3-digit` (2026-10-11, claude-opus-5-5)
- `3-subtract-across-zero` (2026-10-11, claude-opus-5-5)
- `3-story-subtract` (2026-10-11, claude-opus-5-5)
- `3-equal-groups` (2026-10-11, claude-opus-5-5)
- `3-money-total` (2026-10-11, claude-opus-5-5)
- `3-decreasing-pattern` (2026-10-11, claude-opus-5-5)
- `3-increasing-pattern` (2026-10-11, claude-opus-5-5)
- `3-start-unknown` (2026-10-11, claude-opus-5-5)
- `3-change-unknown` (2026-10-11, claude-opus-5-5)
- `3-balance-equation` (2026-10-11, claude-opus-5-5)
- `3-growing-tables` (2026-10-11, claude-opus-5-5)
- `3-area-tiles` (2026-10-11, claude-opus-5-5)
- `3-mass-unit` (2026-10-11, claude-opus-5-5)
- `3-length-convert` (2026-10-11, claude-opus-5-5)
- `3-solid-parts` (2026-10-11, claude-opus-5-5)
- `3-time-units` (2026-10-11, claude-opus-5-5)
- `3-days-weeks` (2026-10-11, claude-opus-5-5)
- `3-bag-likely` (2026-10-11, claude-opus-5-5)
- `3-coin-streak` (2026-10-11, claude-opus-5-5)
