# Isolated browser check

Aside account u0, local Next dev server, synthetic component harness (removed before commit), 2026-11-13. No account or photo mutations.

- 375 × 812: invitation visible, Show instructions opens modal and focuses heading. Native modal fits between y=16 and y=796, scrolls vertically, no horizontal overflow. Screenshot: mobile.png.
- Keyboard: Tab remains inside modal; Escape dismisses. The help entry remains. Final browser probes confirm focus on the surviving trigger after both Not now and Escape. Reload after opening does not repeat the invitation. Unit tests also cover dismissal/remount, explicit focus return, parent scope and blocked storage.
- 768 × 1024 and 1440 × 1000: inspected exported rendered screenshots; dialog remains constrained and scrollable. Screenshots: tablet.png and desktop.png. Desktop measurement: x overflow false, top 16, bottom 984.
- Feature-off desktop: phone-only addition/retake guidance; no Send or results navigation offered.

Limit: isolated help rendering and component tests are not final account-linked flow acceptance. Main owns final integration with #916/#923/#924 and real rejected/marked-page flows. No real-camera, recognition or marking-accuracy evidence added. Design/copy acceptance remains pending.
