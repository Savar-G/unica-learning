# Schedule verification before independent review

The root checkout is `site/parent-schedule` on Savar's MacBook. The implementation starts at `e2c67eb7`; integration with actual PR689 is `8b89949e`.

- 241 focused tests passed across 11 files. They cover frozen revision binding, changed PDF/content/manifest/geometry/QR refusal, both children, foreign ids, print eligibility, receipt scope and pagination, historical unknown status, route and Desk guards, and the real synthetic renderer.
- The shell uses one bounded book-existence read per child. It does not read draft, questions or receipts. The selected Schedule page verifies the full frozen print binding.
- The hosted schema has immutable accepted receipts, an accepted-only status constraint, family/child write fences and cascade ownership keys. Authenticated direct receipt reads are Admin-only. This feature reads through the authorized server client and writes no receipts.
- The prepared customer revision's ten stored rows match the versioned Schedule projection. Visual inspection of its existing PDF page 2 confirms the rows, ranges and global daily time of about 25 minutes. The prepared draft has no selected public approved book. This check does not approve printing or prove the parent route for that customer.
- Root browser, hosted adapter/access fixtures, the full suite and independent review remain pending at this point. The receipt owner's positive hosted admission and full #475 release proof remain separate.

No provider call, family flag, print source, receipt writer or reminder changed.
