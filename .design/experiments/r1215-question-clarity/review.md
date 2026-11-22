# #1215 Asking questions clearly: before and after

Synthetic pages only (made-up questions, no family data), rendered with the real template in Chromium at level 19 on the measured layout. Each `before-*` image is `origin/main` (`dcaaab8a`); each `after-*` is this branch.

| Item | Before | After |
|---|---|---|
| 1. Lettered choices ("Which is prime? A) 22 B) 17 Write A or B.") | `before-choices.png` | `after-choices.png` |
| 2. Page instruction matches the questions | `before-mixed.png`, `before-show-what-you-know.png` | `after-mixed.png`, `after-show-what-you-know.png` |
| 3. Standard answer-box size (Extra practice page) | `before-extra-practice.png` | `after-extra-practice.png` |
| 1. Lettered choices inside word-problem, Challenge and Friday 5 cards | none (new layouts) | `after-slot-word-problems.png`, `after-slot-challenge.png`, `after-slot-friday-5.png` |

- Item 1: the question prints its words once, then each option on its own line, letter first. "Write A or B." is gone.
- Item 2: the page instruction names every answer kind the page prints ("Write in boxes. Circle one choice."), never "Circle true or false." over written answers.
- Item 3: Extra practice pages at level 19 and up drew every answer box 88 px tall; they now use the standard box.

Full-book check: a fake U16 book (84 pages, 593 questions) before and after, strict render problems and fit failures both 0.
