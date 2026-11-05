# Round r337 review

## Savar's picks (2026-11-05)

| Row | Pick | What changed in the round |
|---|---|---|
| D-277 | A at 1024 px and wider, B below | `call.html` opens on the mix; the review bar still has A, B and C |
| D-278 | The board is always there during a call | The Call tab and its screen are gone. Tabs are Chat and Call + board. Chat is off during a call |
| D-279 | Never tell the child what Maya can't do | The `held` screen is gone. New: `quiet` (no call or chat button, no reason), `say-offer` and `offer` |
| D-280 | Failed payment: calls stop at once | New: `desk-paused` ("Calls are paused. Ask a grown-up."). `p-failed` now says "Payment failed" with Update the card |
| D-281 | The four new lines are approved | Marked in the manifest |

Re-rendered after the picks: all option A screens, the desk and pause screens, and `p-failed`, 103 captures in all, with no sideways scroll and no broken image. Checked in the browser: the mix is B at 1023 px and A at 1024 px; the tabs in a call are Chat (off) and Call + board; the words "can't help", "cannot help", "payment", "card", "plan" and "yet" are on none of the child's screens `quiet`, `say-offer`, `desk-paused`, `offer`, `pick` and `confirm`. The click path from pick to the Try Maya after-screen ran again on the mix at 1024 px, and each click reached the planned screen. It did not run below 1024 px after the picks. Tap targets and the canvas sizes were not measured again. Open points are in `open_points` in the manifest.

## First review (before the picks)

Not independent: the agent that made the mockups wrote this review. It used the rubric of the `/design` skill. No child or parent saw these screens, and nobody heard a voice.

## What was checked in the browser (Aside, account u0, the local mockup)

| Check | Result | What it does not prove |
|---|---|---|
| Horizontal scroll on the 178 captures of that pass | None | Text zoom was not tested |
| Images load on those captures and on the board page | No broken image | - |
| Click path: pick, page, question 4, call, mic, connecting, talking, take the pen, give it back, mic off and on, Ask why, hang up, back, Leave, PIN, Parent home, Try Maya, sample call, after | Each click reached the planned screen | The mockup has no call, mic or server behind it |
| Tap targets under 44 px on a phone (9 sample screens, after the fix below) | None | Rail items were included only in this last sample |
| Strokes animate when the page is not in still mode | Dash offset was moving on the talking screen | Timing against speech: no audio exists here |
| Canvas sizes | See `measured_canvas_px` in the manifest | One state per option |

Found and fixed while checking:

- Option B's board overflowed its card and cut off the answer row (an SVG percent height).
- Options B and C put the top bar in the wrong grid cell (inherited `grid-area`).
- Board notes covered the hang up button and the timer on narrow boards. They now sit under the pill.
- "Maya has the pen" showed twice. The bar now holds only the button.
- On a phone, the pill covered the sample question's label.
- The desk's tabs (40 px) and Sound button (36 px) are under the desk's 44 px rule today. The mockup uses 44 px. The real desk needs the same fix.

Not tested: keyboard use, a screen reader, and the reduced-motion setting of the operating system. The CSS for reduced motion is written, and the still mode shows the end states.

## Scores (0 to 10) for the recommended mix

| Dimension | Score | Why |
|---|---|---|
| Task fit | 8 | The board and the turn signal lead. The child can find mic, Ask why, pen and hang up at every width. |
| Content and hierarchy | 8 | "Your turn" stands out. On a laptop the transcript and the caption repeat the same line. |
| System coherence | 9 | Desk CSS and tokens are the real ones. New parts: pill (from the video), control bar, board notes. |
| Interaction and states | 8 | Every state in the brief has a screen. Missing: a second tab with the call open (existing board-tab rule). |
| Accessibility and responsiveness | 6 | Four sizes are clean. Keyboard and screen reader were not tested. A phone on its side has a small board. |
| Visual expression | 7 | Warm, and close to the video. It adds no new character, as `DESIGN.md` asks. |
| Craft | 7 | Hand-placed board. The real layout core will place it differently. Maya's pen picture is an estimate of the video's. |
| Evidence and fidelity | 6 | Screens are rendered. Nothing is proven with a child, a voice or a real iPad. |

## Weak points to look at first

1. A phone on its side (`opt-b-listening-phone-landscape.png`): the bar takes much of the height. The desk's layout treats this size as a phone.
2. Portrait tablet with option A (`opt-a-talking-tablet-p.png`): the reason for the mix.
3. The closing state only warns. After it, TIME_CLOSE gives the answer and asks the child to write it, so a child can hear the answer before they finish. That is D-162 and spec behaviour; the screen copy says "Maya will help you finish this question."
4. `after-solved` says "We finished 27 + 39 together." A child who solved it alone needs "You did it", from the `close.solved` lines. The build must pick by the call's outcome.
