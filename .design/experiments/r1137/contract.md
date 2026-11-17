# Maya lesson layout comparison

The child needs to see the question, understand one math step, and respond without leaving the lesson. The same step must work with a microphone, text, touch, a keyboard, or a printed workbook.

Use the current desk and board as references. The desktop desk has room for a board and a separate conversation. In the earlier phone evidence, the chat comes first and the board is below the fold. Current source still puts chat before the board at phone widths and moves the board first during a voice call. The comparison uses the existing Maya image, warm colors, dotted board, and call/chat terms. The images from round r358 show an earlier build.

- [Desk source](../../../src/components/desk.tsx)
- [Desk styles and current breakpoints](../../../src/components/desk.css)
- [Historical desktop chat capture](../r358/chat-laptop.png)
- [Historical phone chat capture](../r358/chat-phone.png)

Compare the order of the board, prompt, and next action. Use the same synthetic question and the same controls in each option. Keep the answer unfilled. Keep workbook navigation and the transcript in disclosures. Keep the next step available as a button. Offer an explicit paper choice that preserves the current step.

Compare math lettering separately. The current board uses Relief SingleLine under D-182. The preview renders its actual digit strokes beside EMS Tech strokes and a typeset tabular sample. Compare 1 and 7, 6 and 9, 8 and 0, column alignment, minus and division signs, a stacked fraction, and long division. The interface continues to use the Warm sans-serif type in the proposed design.

- [Current board fonts and paths](../../../src/lib/board/fonts.ts)
- [Maya avatar asset](../../../public/desk/maya.webp)
- [Warm interface tokens](../../../src/ds/styles/warm.css)

Use the exchange to compare motion. The new quantities appear immediately and a brief movement traces where the ten went. The reduced-motion choice shows the same completed state immediately with zero animation.

**Recommendation.** Choose A, Board-led, with current Relief SingleLine lettering. A keeps the representation beside the notation and offers a direct way back to paper. Relief preserves the existing shape of the written digits. Review the alternatives before recording a choice.

**Selection.** Savar chose A, Board-led, and Relief SingleLine on 2026-11-17. The prototype simulates the interaction and uses no family or provider account.

Preview checks passed at 728 and 390 CSS px for all three options. The checks exercised the exchange to 4 tens and 12 ones, division into four groups of 2 tens, both disclosures, and paper mode with the completed step retained. No animation ran with the reduced-motion control selected. The checks ran with synthetic data and programmed button clicks. Touch, keyboard focus order, and audio on real devices remain release checks.
