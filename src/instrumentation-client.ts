// Analytics start only after the visitor accepts them (src/lib/consent.ts).
// This file only watches the stored choice. It does not import PostHog. A returning visitor who accepted
// loads PostHog after the page is idle, so analytics never compete with the first paint.
import { getAnalytics } from "@/lib/analytics";

getAnalytics()?.begin();
