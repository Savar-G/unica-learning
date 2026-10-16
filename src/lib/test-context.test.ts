import { describe, expect, it } from "vitest";
import { deviceOf, readDevice, type DeviceSignals, type TestDevice } from "@/lib/test-context";

// The device of a test (#185): what the screen works out from the browser, and what the server accepts.
const UA = {
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  pixel: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  galaxyTab: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

const signals = (s: Partial<DeviceSignals>): DeviceSignals => ({
  userAgent: "", maxTouchPoints: 0, screenWidth: 1440, screenHeight: 900, pointers: [], mainPointer: "fine", ...s,
});

describe("the device the screen reports", () => {
  it.each<[string, Partial<DeviceSignals>, TestDevice]>([
    ["an iPad, which says it is a Mac, with a pen", { userAgent: UA.ipadOs, maxTouchPoints: 5, screenWidth: 1024, screenHeight: 1366, pointers: ["touch", "pen", "touch"], mainPointer: "coarse" },
      { deviceClass: "tablet", input: "pen", screenWidth: 1024, screenHeight: 1366, browser: "safari" }],
    ["a Mac with a trackpad", { userAgent: UA.ipadOs, pointers: ["mouse"] },
      { deviceClass: "desktop", input: "mouse", screenWidth: 1440, screenHeight: 900, browser: "safari" }],
    ["an iPhone", { userAgent: UA.iphone, maxTouchPoints: 5, screenWidth: 390, screenHeight: 844, pointers: ["touch"], mainPointer: "coarse" },
      { deviceClass: "phone", input: "touch", screenWidth: 390, screenHeight: 844, browser: "safari" }],
    ["Chrome on an iPhone", { userAgent: UA.iphoneChrome, maxTouchPoints: 5, screenWidth: 390, screenHeight: 844, mainPointer: "coarse" },
      { deviceClass: "phone", input: "touch", screenWidth: 390, screenHeight: 844, browser: "chrome" }],
    ["an Android phone", { userAgent: UA.pixel, maxTouchPoints: 5, screenWidth: 412, screenHeight: 915, pointers: ["touch"], mainPointer: "coarse" },
      { deviceClass: "phone", input: "touch", screenWidth: 412, screenHeight: 915, browser: "chrome" }],
    ["an Android tablet in the Samsung browser", { userAgent: UA.galaxyTab, maxTouchPoints: 10, screenWidth: 1280, screenHeight: 800, pointers: ["touch"], mainPointer: "coarse" },
      { deviceClass: "tablet", input: "touch", screenWidth: 1280, screenHeight: 800, browser: "samsung" }],
    ["Edge on Windows, started with the keyboard", { userAgent: UA.edge, mainPointer: "fine" },
      { deviceClass: "desktop", input: "mouse", screenWidth: 1440, screenHeight: 900, browser: "edge" }],
    ["Firefox on Windows", { userAgent: UA.firefox, pointers: ["mouse"] },
      { deviceClass: "desktop", input: "mouse", screenWidth: 1440, screenHeight: 900, browser: "firefox" }],
    ["a touch Chromebook used with a finger", { userAgent: UA.chromebook, maxTouchPoints: 10, screenWidth: 1366, screenHeight: 768, pointers: ["mouse", "touch"], mainPointer: "fine" },
      { deviceClass: "desktop", input: "touch", screenWidth: 1366, screenHeight: 768, browser: "chrome" }],
    ["a browser that says nothing", { userAgent: "", screenWidth: 0, screenHeight: 0, mainPointer: null },
      { deviceClass: "desktop", input: null, screenWidth: 1, screenHeight: 1, browser: "other" }],
  ])("%s", (_, given, device) => {
    expect(deviceOf(signals(given))).toEqual(device);
    // Whatever the screen works out, the server takes.
    expect(readDevice(device)).toEqual(device);
  });
});

describe("the device the server accepts", () => {
  const ok: TestDevice = { deviceClass: "tablet", input: "pen", screenWidth: 1024, screenHeight: 1366, browser: "safari" };

  it("takes a device with every field, and keeps only those fields", () => {
    expect(readDevice({ ...ok, userAgent: "Mozilla/5.0 (Macintosh)", name: "Asha" })).toEqual(ok);
    expect(readDevice({ ...ok, input: null })).toEqual({ ...ok, input: null });
  });

  it.each<[string, unknown]>([
    ["not an object", "tablet"],
    ["nothing", null],
    ["an unknown class", { ...ok, deviceClass: "watch" }],
    ["an unknown input", { ...ok, input: "voice" }],
    ["an unknown browser", { ...ok, browser: "netscape" }],
    ["a screen of 0", { ...ok, screenWidth: 0 }],
    ["a screen that is not a whole number", { ...ok, screenHeight: 1366.5 }],
    ["a screen far too large", { ...ok, screenWidth: 100_000 }],
    ["a missing field", { deviceClass: "tablet", input: "pen", screenWidth: 1024, browser: "safari" }],
  ])("refuses %s", (_, raw) => {
    expect(readDevice(raw)).toBeNull();
  });
});
