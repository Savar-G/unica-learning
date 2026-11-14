# Scan instructions — #926

Draft for owner design/copy review. No new release approval, launch claim or marking accuracy claim.

A first visit shows a small inline invitation, not an automatic modal. The parent can start scanning immediately, choose Show instructions or dismiss with Not now. The How scanning works trigger remains above the scan content, including loading/error, empty and existing-photo screens. A native modal contains a short ordered guide. It takes focus on its heading, contains keyboard focus, closes with Escape, Close instructions, Back to Scan pages or the backdrop, and restores focus to the persistent help trigger. No motion.

Dismissal scope: opening the guide or choosing Not now saves `seen` under `unica.scan-help.v1:<parent>` in this browser's local storage. It covers all children in the signed-in account, feature changes, remounts and ordinary return visits. It does not sync between devices or browsers. Clearing browser data resets it. If storage is blocked, dismissal lasts for the mounted visit only; help remains usable. No child names, photos or guide activity go to analytics.

Copy matches current main: phone camera/existing photo inputs; desktop adds and retakes on phone; `listing.checks` controls check/Send instructions; `listing.marking` controls Page history/View page results instructions. Saved-only accounts are told checks/sending/results are unavailable. No any-order or pending batch controls are named. The printed bottom-of-sheet number is the reference, never manual counting of covers or the position within a day. This does not change main's current labels; #916 supplies their correction. The existing photo notice and acknowledgement are untouched.

Ownership: only the ScanHelp import and three minimal render mounts in ScanPages. No edits to scan stack, upload queue, dock, add sheet, calibration, history or marking prompt. Main should recheck wording/mounts against #916/#923/#924 once integrated. Rejected-photo/marked-page real-device flow remains main's integrated acceptance; isolated component behavior is not recognition evidence.

Design process: AGENTS.md and DESIGN.md reviewed; installed `/design` skill could not be located in repo, ~/.claude/skills or plugin cache. Location requested from main. This contract and manifest preserve a reviewable proposal while approval remains pending.
