// The Scan pages tab (#564, spec #544, D-246). Pure, shared by the page and the email: which screen a device gets, and
// the page's address. The camera flow itself is src/components/scan-pages.tsx; its access checks stay where they are.

export const SCAN_PATH = "/account/scan";

/** Where a signed-out visitor goes: sign in, then back to this page. */
export const scanSignInPath = `/sign-in?next=${encodeURIComponent(SCAN_PATH)}`;

/** The address the QR code and the email hold: the page and nothing else, so no token, child or family id. */
export const scanPageUrl = (origin: string) => `${origin}${SCAN_PATH}`;

/** The query that keeps the camera flow on a device the server calls a desktop. */
export const CONTINUE_HERE = "here";

export type ScanScreen = "camera" | "desktop";

/**
 * The camera flow on a phone or tablet. Anything else, or a device the server cannot tell (iPadOS Safari reports a
 * Mac), gets "Please take a picture with your phone", which offers to continue on this device. `deviceType` is the
 * user agent's device type as Next.js reads it: "mobile", "tablet", others, or undefined for a desktop.
 */
export function scanScreen(deviceType: string | undefined, continueHere: boolean): ScanScreen {
  return continueHere || deviceType === "mobile" || deviceType === "tablet" ? "camera" : "desktop";
}

/**
 * A note in this browser that the parent was on Scan pages in the last half hour. A page's QR code read by the phone's
 * own camera then opens Scan pages for that page instead of the desk (the r565 build note). It is not a credential: the
 * QR route still checks the session, the family's ownership of the page and the scan release.
 */
export const SCANNING_COOKIE = "unica_scanning";
export const SCANNING_SECONDS = 30 * 60;

/** Scan pages for one printed page: the workbook and the page number, never the page's QR token. */
export const scanPagePath = (workbookId: string, page: number) => `${SCAN_PATH}?w=${encodeURIComponent(workbookId)}&p=${page}`;

/** "Take the pictures on this device": it keeps the page a QR code named, so that page's child stays in view. */
export const continueHerePath = (named: { workbookId: string; page: number } | null) =>
  named ? `${scanPagePath(named.workbookId, named.page)}&${CONTINUE_HERE}=1` : `${SCAN_PATH}?${CONTINUE_HERE}=1`;

/**
 * Where a page's QR code goes for its signed-in owner when no desk is open on this device: Scan pages for that page when
 * the parent was just scanning and scanning is open to the family; otherwise the desk question, which offers "Scan this
 * page" when scanning is open. A desk open for the page's child goes to the desk before this is asked, so the child's
 * desk link keeps working.
 */
export function pageCodeTarget(o: { scanning: boolean; scanAccess: boolean }): "scan" | "desk" {
  return o.scanning && o.scanAccess ? "scan" : "desk";
}
