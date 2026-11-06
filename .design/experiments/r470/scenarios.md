# S8 checks

Use the current scan stack, item review, result view and Admin table controls. Group saved pages by child, workbook and printed day. Show the displayed page count. Never infer a result from a job status. Keep blank, unscored, pending, failed, never scanned and ready distinct. Retakes do not add canonical pages.

The check fails if a page appears twice, a filtered count differs from the visible set, an old page disappears after image expiry, or a later scan claims to rewrite a frozen workbook plan. It fails if a page awaiting a parent check looks complete. It fails if a failed page blocks another page.

The cost check fails if failed or uncertain spend disappears, if unknown cost becomes zero, or if global reservations are filtered to the displayed family. Show logical calls and adapter dispatch attempts separately. Split by UTC date, model and saved job outcome. Do not invent a provider-attempt outcome that the ledger does not record.

Analytics fail if a payload holds an answer, score, name, family/child ID, URL, path, token, raw error, previous-page context, session identifier or SDK user/group identity. Unset, denied or withdrawn consent must send nothing and must not replay old work. Account/context changes must invalidate pending uploads, reviews and analytics callbacks. Test the SDK before_send boundary with injected defaults and nested values.

The Maya control stays disabled. Just show results opens the existing page results. No model, recognition, paid practice, email, provider or release call is authorized. Root owns phone/tablet/laptop browser evidence and approval. Local synthetic checks do not prove provider privacy, handwriting accuracy, hosted permissions or physical camera behavior.
