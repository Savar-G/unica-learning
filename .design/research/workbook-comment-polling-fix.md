# Workbook comment progress and request control

Computer: `Savars-MacBook-Pro-5.local`.

Worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/root-workbook-comment-progress`.

Branch: `site/workbook-comment-progress`.

The comment reviewer previously refreshed the full run every 2.5 seconds. A slow request could leave later refreshes running beside it. Each refresh also requested large run inputs and signed page images. This is unsuitable for a long-running batch.

The replacement polls the existing edit route with a read-only GET. It reads the checked Admin session, run-to-draft identity, latest edit checkpoint row and that batch's page references. It does not read generation frames, drafts, revisions, solves, audit records or storage. It returns a fixed progress projection without checkpoint contents, image paths, question text or model data.

There is one request in flight. A successful active reply waits five seconds before the next read. A failed or malformed reply waits 30 seconds. Closing the screen aborts the request. A terminal or changed batch stops polling and refreshes the full run once. The server shares one eight-second abort signal across Auth and database requests. Ordinary session callers retain their current behavior.

Counts use distinct pages in this batch. A saved response alone does not count as a checked page. A page and its matching saved image count as ready. An error counts as checked and needing attention. Ready does not mean the revision has committed. Complete checkpoints with an active row show saving. Queued work with a frame or completed checkpoint shows retrying. The existing six-minute heartbeat boundary shows stalled work.

Falsifiers: more than one request during a delayed response; a new request before the required delay; an update after unmount; a full run read while the batch remains active; partial comment counts; another batch contributing pages; a failed page counted as ready; a new revision claimed before commit; a parent or anonymous user reading progress; or a database error reaching the client.

Validation at this stage: 41 cases in four files passed. These include a 130-second held read, error backoff, terminal state, abort, exact checkpoint counts, fixed response size below 500 bytes, checked Admin access, complete comment counts and server deadline. Real Supabase client tests also check Auth/data deadline sharing, query cancellation and unchanged callers without a deadline. Four mounted React checks prove the displayed counts, small-GET polling, replacement of stale stopped state, once-only terminal refresh and unavailable state. Scoped ESLint passed. After Next type generation, the scoped TypeScript program returned zero diagnostics before the final two test files were added. The final type and release gates remain open.

Proof is local and synthetic. No production load test, model call, email, print operation, worker restart, push or PR occurred. The independent review, full gate, local browser check, exact-head CI and production verification remain open. The template fixes and the complete comment routing path are separate work.

HANDOFF_REVIEW_PENDING
