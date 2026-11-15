// The browser's Sentry reports arrive here through /monitoring (tunnelRoute in next.config.ts) and go on to Sentry.
// Only the payload goes on: no visitor address and no header (docs/sentry.md).
export { POST } from "@sentry/nextjs/tunnel";
