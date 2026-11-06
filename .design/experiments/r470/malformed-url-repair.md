# Malformed URL privacy repair

Independent review rejected 7fe942bc for F1, a P2 privacy failure. A malformed percent escape or invalid UTF-8 byte stopped nested decoding before private route separators were recognized. PostHog and both Vercel callbacks could then retain a private identifier. No actual external disclosure was exercised.

Five new public-interface regression inputs failed before the fix. They cover malformed escapes, invalid UTF-8, truncated encoding and nested/error paths. Each corrected input now returns null through the actual PostHog before_send callback, scrubAnalyticsEvent and scrubSpeedEvent. Both redactors remove the synthetic private marker. Well-formed public encoded-space controls remain admitted.

The shared decoder now uses the existing private Admin-route classification when decoding fails, as it already does for excess nesting. Its exported type and all callers are unchanged. This drops telemetry for an address whose encoding cannot be classified safely. It changes no application URL, authorization rule, scan event protocol, score or stored history.

After the correction, 36 tests across 5 files passed. Targeted lint and the normal build exited 0. Logs are in the durable evidence folder with prefix pd470-malformed-. A fresh fixed-head review is required before push or merge. No paid call, family flag or hosted schema change was needed for this fix.
