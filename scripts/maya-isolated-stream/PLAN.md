# Local streaming test plan

Source pin: `b8d7569bf5c5ea78994ea34befdf1b442a8d2822`.

1. Add a loopback HTTP harness outside the production app.
2. Use the pinned call, stream, desk, and board modules with synthetic memory records.
3. Add spaced fake replies, reset, connection cut, and pending/confirmed recovery controls.
4. Reject external requests and external runtime requests. Check source provenance at startup.
5. Run focused public-interface tests and local bundle checks. Leave browser proof and independent review to the lead.
6. Open one draft PR. Leave no server running.

Production files, readers, family switches, and `callSeams.streamChat` stay unchanged.
