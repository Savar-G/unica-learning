# Root verification

Computer: Savars-MacBook-Pro-5.local.
Source: 0eaa5e5289da04a476f28bb64902608efbe96402.

Falsifiers: a non-admin receives the page; a rendered scenario sends a write; a frame permits active controls, forms or scripts; a long name causes horizontal overflow; the production build fails.

- Full suite: 16,720 passed, one optional skip, 446 files. Source lint exited 0. Root production build exited 0.
- Real authorization: dedicated Admin 200; authenticated non-admin 404; signed-out 404; demo query 404; desk-locked Admin 307 to /tutor. The response byte counts are in root-auth.json.
- Browser: all 93 unique scenario selections rendered in the real Admin route. The frame contained no scripts, forms, nested frames, navigable links or enabled controls. No mutation request was observed. Ordinary route reads and the desk-state GET still occurred.
- Phone: 390 CSS pixels. Host and frame fit with the long child name. Tablet: host width 820, scroll width 805; frame width and scroll width 820. One, two and no-child selections updated the URL. Only the two-child case showed the child selector.
- Keyboard: Enter on a disabled frame link left the host and frame URLs unchanged and sent no write. Frame scroll was checked with instant scrolling because the shared browser pane was hidden.

admin-desktop.png is a shared-browser capture of the authenticated Admin controls. overview-phone.png and plan-tablet.png are Aside captures of the exact static srcDoc rendered by that route. The same three stylesheet assets and fonts were embedded for file-origin rendering. These two images prove static layout. They do not prove a separate authenticated Aside session. Two shared-browser screenshot attempts timed out before the permitted Aside fallback.

The two dedicated Auth identities were deleted. No Admin fixture rows remain. Their private credential files were removed. The shared-browser QA cookie was cleared. The owned browser tabs and development process were closed. No real family data, provider calls, release flags or billing settings changed.

These checks do not prove physical scans, recognition accuracy, paid provider behavior, hosted marking permissions or deployment behavior. The preview deliberately shows synthetic data and disabled actions.
