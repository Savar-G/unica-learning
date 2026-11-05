import { expect, it } from "vitest";
import { SCAN_PATH, scanPageUrl, scanScreen, scanSignInPath } from "@/lib/scan-tab";

it("opens the camera flow on a phone or a tablet", () => {
  expect(scanScreen("mobile", false)).toBe("camera");
  expect(scanScreen("tablet", false)).toBe("camera");
});

it("asks for a phone when the server cannot tell the device, as for a desktop or an iPad that reports a Mac", () => {
  expect(scanScreen(undefined, false)).toBe("desktop");
  expect(scanScreen("smarttv", false)).toBe("desktop");
});

it("opens the camera flow on any device when the parent chose to continue on it", () => {
  expect(scanScreen(undefined, true)).toBe("camera");
});

it("puts only the page's address in the QR code and the email", () => {
  expect(SCAN_PATH).toBe("/account/scan");
  expect(scanPageUrl("https://unicalearning.com")).toBe("https://unicalearning.com/account/scan");
  expect(new URL(scanPageUrl("http://localhost:3000")).search).toBe("");
});

it("sends a signed-out visitor to sign in, then back to the page", () => {
  expect(scanSignInPath).toBe("/sign-in?next=%2Faccount%2Fscan");
});

it("sends a page's QR code to Scan pages only for a parent who was just scanning and may scan", async () => {
  const { continueHerePath, pageCodeTarget, scanPagePath } = await import("@/lib/scan-tab");
  expect(continueHerePath(null)).toBe("/account/scan?here=1");
  expect(continueHerePath({ workbookId: "6f1c2a3b-0000-4000-8000-000000000001", page: 12 })).toBe("/account/scan?w=6f1c2a3b-0000-4000-8000-000000000001&p=12&here=1");
  expect(pageCodeTarget({ scanning: true, scanAccess: true })).toBe("scan");
  expect(pageCodeTarget({ scanning: true, scanAccess: false })).toBe("desk");
  expect(pageCodeTarget({ scanning: false, scanAccess: true })).toBe("desk");
  expect(scanPagePath("6f1c2a3b-0000-4000-8000-000000000001", 12)).toBe("/account/scan?w=6f1c2a3b-0000-4000-8000-000000000001&p=12");
});
