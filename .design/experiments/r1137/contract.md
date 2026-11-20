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

## Implementation (#1151)

The desk at `/tutor` now uses option A. The layout and the paper rules are in [DESIGN.md](../../../DESIGN.md), under Checked Maya lessons. The board drawing, the chat, the call and the checked move are the existing parts. Only their places changed. Inside the desk, the checked move uses the one paper choice on the question and shows no second toggle. A board used alone keeps its own toggle.

Browser checks ran on 2026-11-20 in Aside (Chromium) and in iOS Safari on the iPhone 17 Pro simulator (iOS 26.5). They used the real desk component on a local page with synthetic data (52 minus 28, a 13-line chat and the checked exchange). Chat requests were answered in the browser. No family, account or provider took part.

| Check | Result |
|---|---|
| Desktop 1280 x 800 | Question, board with Maya says beside it, reply row and navigation fit one screen. No sideways scroll. |
| Tablet 768 x 1024 | Same order with a 230 px Maya says. No sideways scroll. |
| Phone 390 x 844 | Board at 205 px and Exchange one ten at 668 px are on the first screen. The open 14-line transcript starts at 1057 px. No sideways scroll. |
| Phone on its side 844 x 390 | One column in the phone order. No sideways scroll. |
| Keyboard | Tab order: Leave desk, Pick another question, Use paper, the board tools and pen, Call Maya, Chat with Maya, reply box, Transcript, Workbook navigation. Each shows a 3 px focus ring. Enter and Space work Use paper and Show board. Enter opens both disclosures. |
| Touch | iOS simulator taps on Use paper and Show board changed the paper state. A tap on Chat with Maya started the chat. A tap opened the transcript. The exchange finished during that tap run, but no single logged tap is proven to have sent it. Aside has no touch screen. |
| Paper | The question stays. The canvas hides. All 21 board strokes come back on Show board. Paper stayed on through a chat start and a resize from 1280 px to 390 px and back. |
| Contrast | 41 text runs checked. Lowest ratio 8.85:1. None below 4.5:1. |
| Reduced motion | 0 running animations during the exchange. No partly drawn strokes. Transitions are 0 s. The 4 tens and 12 ones state showed at once. |
| Targets | Every control is 44 px or more after the pen buttons went from 40 to 44 px. |

Screens: [desktop chat](impl-desktop-chat.jpg), [desktop paper](impl-desktop-paper.jpg), [desktop after the exchange](impl-desktop-exchanged.jpg), [tablet](impl-tablet-chat.jpg), [phone with reduced motion](impl-phone-chat-reduced.jpg), [phone paper](impl-phone-paper.jpg).

Not checked here: a physical iPhone or iPad, a live call (the call screens and the Hang up row at the bottom of a phone), and screen reader output beyond the iOS accessibility tree.
