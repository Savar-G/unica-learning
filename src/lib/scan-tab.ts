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
