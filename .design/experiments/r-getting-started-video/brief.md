# Approved getting-started video

## Scope

Implement the approved final video without editing or redesigning it. Use the existing support page and primary button styles. Keep the route outside the account's sign-in gate so a parent can watch straight from the instructions email, with an obvious account link afterwards. The existing Admin delivery confirmation and separate start-plan action remain unchanged. No new onboarding section, customer send, bulk resend, billing action or deployment.

## Design route

Design direct, existing system: reuse `SupportPage`, warm tokens, Geist typography and native media controls. No alternative video concepts or new visual system. The local `/design` and `/implement` command skills were not available in this worktree or the installed skill roots; the repository's design contract and existing round manifest conventions guide this focused implementation.

## Acceptance

- The start-plan email has the exact approved button label and a canonical production watch URL.
- Grade, sibling, billing, cancellation, support and existing send-ledger behavior stay intact.
- The player fits phones, has controls and inline playback, never autoplays, and provides selectable English captions.
- Metadata is noindex and the help page is not added to the sitemap.
- The shipped movie's checksum equals the approved render. Maya sections stay unchanged.
- Browser evidence covers phone, tablet and desktop sizes, keyboard access, playback and seeking.
- No Vercel preview deployment or real customer email is used for verification.
