# Template check report

Made by `npm run check:templates` (scripts/check-templates.mjs). Bank: 1-2, 125 templates. Updated 2026-10-11 08:08 UTC.

Pass: 8. Review: 4. Fail: 0. Error: 0. Not checked: 113. Changed since its check: 0.

A template passes when Claude found its answers correct, its coded wrong answers wrong, and its BC grade right. Review means a wording problem or a province tag doubt that a person should decide.

## Review (4)

### 2-make-ten-strategy

- Wording: In examples 2, 4, 5, 7 and 8 the read-aloud lists the choices in a different order than the choice buttons. For example, in example 2 the voice says '10 plus 7, 10 plus 5 or 10 plus 9' but the buttons show 10 + 9, 10 + 5, 10 + 7.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-square-or-rectangle

- Wording: In most examples the read-aloud lists the shapes in a different order than the choice buttons. For example, in example 1 the voice says 'a square, a circle or a rectangle' but the buttons show rectangle, square, circle.
- Wording: Small point: the read-aloud starts each choice list with a lowercase 'a' after a question mark ('...? a square, ...'). A browser voice reads this fine, but it is inconsistent as written text.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-turned-shape

- Wording: The read-aloud lists the choices in a different order than the buttons in every example. For example, in example 1 the voice reads 'Still a square' first, but that button is shown third.
- Wording: The square examples (1 and 4) show no picture, while the rectangle and triangle examples show one (▮, ▼). Consider adding ◆ so the square examples match.
- Checked 2026-10-11 with claude-opus-5-5.

### 2-roll-and-stack

- Wording: In most examples the read-aloud lists the objects in a different order than the choice buttons. For example, in example 1 the voice says 'an ice cube, a ball or a drum' but the buttons show ice cube, drum, ball.
- Checked 2026-10-11 with claude-opus-5-5.

## Not checked (113)

`k-count-shapes`, `k-number-after`, `k-number-before`, `k-missing-number`, `k-who-has-more`, `k-make-five`, `k-split-number`, `k-rest-are`, `k-in-all`, `k-pattern-ab`, `k-pattern-abc`, `k-pattern-aab`, `k-number-pattern`, `k-how-many-more`, `k-take-away`, `k-balance-match`, `k-balance-tips`, `k-longer-line`, `k-heavier-object`, `k-balance-heavier`, `k-can-roll`, `k-graph-which-more`, `k-graph-count`, `k-likely-event`, `1-ten-and-more`, `1-smallest-biggest`, `1-more-or-less`, `1-make-ten`, `1-count-coins`, `1-subtract-from-20`, `1-story-add`, `1-story-take`, `1-story-compare`, `1-pattern-four`, `1-pattern-missing`, `1-pattern-letters`, `1-number-pattern`, `1-build-to`, `1-missing-addend`, `1-which-sum-more`, `1-pattern-predict`, `1-letters-to-shapes`, `1-change-story`, `1-balance-cubes`, `1-equal-or-not`, `1-cubes-longer`, `1-unit-size`, `1-order-three`, `1-shape-sides`, `1-sides-in-all`, `1-graph-how-many-more`, `1-graph-in-all`, `1-more-likely`, `1-cover-card`, `1-length-together`, `1-tallest-child`, `1-heaviest-box`, `2-digit-value`, `2-ten-more-less`, `2-greatest`, `2-tens-and-ones`, `2-skip-count-back`, `2-add-2-digit`, `2-subtract-2-digit`, `2-story-add-2-digit`, `2-story-subtract-2-digit`, `2-coins-mixed`, `2-balance-equation`, `2-missing-left`, `2-missing-addend`, `2-increasing-pattern`, `2-pattern-core`, `2-change-unknown`, `2-pattern-rows`, `2-number-pattern-predict`, `2-shape-pattern-predict`, `2-true-equation`, `2-missing-in-pattern`, `2-change-unknown-add`, `2-ruler-length`, `2-length-unit`, `2-face-of-solid`, `2-graph-in-all`, `2-graph-fewer`, `2-spinner`, `2-compare-lengths`, `2-sides-in-all`, `3-build-number`, `3-ten-more-less`, `3-after-99`, `3-digit-value`, `3-add-3-digit`, `3-subtract-across-zero`, `3-story-subtract`, `3-equal-groups`, `3-share-equally`, `3-money-total`, `3-decreasing-pattern`, `3-increasing-pattern`, `3-pattern-rule`, `3-start-unknown`, `3-change-unknown`, `3-balance-equation`, `3-area-tiles`, `3-mass-unit`, `3-length-convert`, `3-solid-parts`, `3-time-units`, `3-days-weeks`, `3-bar-graph-more`, `3-table-total`, `3-bag-likely`, `3-coin-streak`

## Pass (8)

- `k-shape-attribute` (2026-10-11, claude-opus-5-5)
- `1-skip-count` (2026-10-11, claude-opus-5-5)
- `1-add-to-20` (2026-10-11, claude-opus-5-5)
- `1-never-sometimes-always` (2026-10-11, claude-opus-5-5)
- `2-even-or-odd` (2026-10-11, claude-opus-5-5)
- `2-certain-possible` (2026-10-11, claude-opus-5-5)
- `3-greatest` (2026-10-11, claude-opus-5-5)
- `3-growing-tables` (2026-10-11, claude-opus-5-5)
