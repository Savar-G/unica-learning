// The notice that new free-trial families wait longer for Workbook 1 while the workbooks are rebuilt (#1247). It shows on
// /thank-you after a saved card from the report and in the saved-card welcome email, in place of the "5 to 7 days" line.
// Approved word for word by Cedric on 2026-11-22. Pure: no network, database or clock.

/** The one switch. Set to false when the new workbooks are live: the screen and the welcome go back to their earlier words. */
export const WORKBOOK_DELAY_ON = true;

export const WORKBOOK_DELAY_NOTICE = "We're improving our workbooks right now, so your child's first workbook will arrive in about 2 to 3 weeks. Your free month doesn't start until it arrives. In the meantime, you can see your child's results and report.";

/** The notice while the switch is on, or null. */
export const workbookDelayNotice = (on: boolean = WORKBOOK_DELAY_ON): string | null => (on ? WORKBOOK_DELAY_NOTICE : null);
