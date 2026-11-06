# Current main integration

Base: e9615fd3, the merged workbook start/resume lock fix in PR670.
Computer: Savars-MacBook-Pro-5.local.

The reviewed feature source and documentation are unchanged by this rebase. A tree comparison against the prior candidate found no changed src or docs file. The new base adds its own SQL migration and SQL tests. The feature does not replace those files.

The latest-base checks passed 124 focused public-interface tests. The production build exited zero. The saved main670 logs record those checks. The previous full test and source-lint results remain separate evidence. Required CI on the pushed candidate must pass before merge. No release switch changed.
