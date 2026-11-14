/** Shared parent instructions for onboarding emails and the future welcome guide (#967). */
export const GETTING_STARTED_HABITS = [
  "Pick the same time each day.",
  "Let your child try alone first.",
  "Missed a day? Pick up where you left off.",
  "Scan once, after the day's pages are done.",
] as const;

export const NEXT_WORKBOOK = "Your next workbook arrives two weeks after this one, on day 15. We build it from the pages you scan, so scan each day's finished pages to help us choose what comes next.";
export const DISPATCH_PREVIEW = "When the workbook arrives, follow the schedule on page 2. Let your child try the day's pages, then scan the finished pages at https://unicalearning.com/account/scan. We use those scans to plan the next workbook.";

/** Blank or unsafe configuration leaves the walkthrough out of every email. Read at send time. */
export function walkthroughUrl(raw: string | undefined = process.env.ONBOARDING_WALKTHROUGH_URL): string {
  if (!raw?.trim()) return "";
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
