# Workbook file access

Savar, 6 November 2026: parents must never download full workbook PDFs. The whole answer key opens after confirmed delivery. Root applies the file restriction first; the parent screen and direct API removal follow in this branch.

Applied migration workbook_parent_files_no_pdf, version 20261106175907, to project cdjobwsyzndtltzfpyqa. The hosted ledger and pg_policies confirm a restrictive authenticated SELECT policy. It allows workbook PNGs only when the extension and stored MIME type agree. Admin access remains allowed. Existing ownership and shipped-book policies still apply. Other buckets are unchanged.

Falsifier: a parent can download or sign a PDF, including a renamed or mismatched file, or the policy blocks the parent's real page PNG or team printing.

Actual hosted Auth and Storage checks on four synthetic files passed. access.pdf, renamed.png with PDF MIME type, and renamed.pdf with PNG MIME type each returned 400 for both download and signing. page-1.png returned 200 for both, with 68 bytes downloaded. Service printing returned 200 and 55 synthetic PDF bytes. SQL checked that ownership was valid before the parent file refusal. A temporary Admin role could read the PDF metadata; its subtransaction rolled back. Cleanup confirmed zero owned parents, children, files and Admin roles.

This proves hosted file access for the tested paths. It does not prove the pending answer-key screen or delivery gate. No workbook contents, email, paid provider call or persistent role change were used.

Root ran npm run db:types successfully. The only generated change was scan_marking_saved_command, from the separately pending #470 migration. This policy has no public type signature. Root restored the exact prior generated snapshot to keep this branch separate from #470. No generated type was edited by hand.

Probe source and result: /Users/savargupta/unica-workbook-samples/parent-workbook-access-20261106/storage-access-probe.mjs and storage-probe.json.
