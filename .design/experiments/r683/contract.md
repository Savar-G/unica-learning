# Referral program contract

Route: direct. Job: new. Surfaces: product and marketing. Constraint: existing system.

The parent can share a permanent family code and receive the approved discount without a support request. The new family can see and confirm its code before card setup.

Use the existing Account cards, form fields, buttons, alert text, spacing and focus styles. Use the current fonts and tokens in src/ds/styles. Place the Account card after billing. Add an account-accessible referral page for free and closed families when the dashboard does not open to them. Do not put the program behind paid access.

Keep the pricing explanation inside its existing section. Add one FAQ entry. Keep the main plan price and free-month terms dominant. Do not add a separate section or imply that 50% is the permanent monthly price.

States: loading, ready, no reward yet, reward waiting, applied code, code pending confirmation, invalid code, self-referral, already paid, signed out, desk open, read failure, write outcome unknown, copy success and copy failure. A failed read shows no invented zero counts. Retain typed input after a failed write. Disable a repeated write while it is pending. Announce results accessibly. Keep the input label visible.

Use docs/referrals.md for the approved business rules. The user specified the placements and approved the offer. The direct route skips additional contract and direction approval. Production merge remains with Savar.

Acceptance: all children in the fixed enrolled list receive the correct single paid-renewal benefit; separate rewards remain separate; trial invoices do not consume it; pause and cancellation preserve it; Account and checkout show accurate states; no other family's identity is exposed; desktop and phone have no horizontal overflow; keyboard focus and alerts work.
