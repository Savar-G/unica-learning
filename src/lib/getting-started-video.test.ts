import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GettingStarted, { metadata } from "@/app/(product)/getting-started/page";
import { GETTING_STARTED_CAPTIONS_SRC, GETTING_STARTED_VIDEO_LABEL, GETTING_STARTED_VIDEO_PATH, GETTING_STARTED_VIDEO_SRC, GETTING_STARTED_VIDEO_URL } from "@/lib/getting-started-video";
import { planStartEmail } from "@/lib/workbook-email";

vi.mock("next/navigation", () => ({ usePathname: () => "/getting-started" }));

describe("the approved getting-started video", () => {
  it("renders a responsive, user-controlled inline player, captions and an account link without requiring sign-in", () => {
    const html = renderToStaticMarkup(createElement(GettingStarted));
    expect(html).toContain("controls=\"\"");
    expect(html).toContain("playsInline=\"\"");
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('width:100%');
    expect(html).toContain('aspect-ratio:16 / 9');
    expect(html).toContain(`src="${GETTING_STARTED_VIDEO_SRC}" type="video/mp4"`);
    expect(html).toContain(`kind="captions" src="${GETTING_STARTED_CAPTIONS_SRC}" srcLang="en"`);
    expect(html).toContain('href="/account"');
    expect(html).not.toMatch(/autoplay|autoPlay|loop=/);
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toBe(GETTING_STARTED_VIDEO_PATH);
  });

  it("ships the approved movie byte-for-byte and timed captions from the final render", () => {
    const movie = readFileSync(`public${GETTING_STARTED_VIDEO_SRC}`);
    expect(createHash("sha256").update(movie).digest("hex")).toBe("2233b9cf6247f1ee6752bbcaf497fee65a1bb617d1c95b5fb506a1a3e6a6d1d5");
    const captions = readFileSync(`public${GETTING_STARTED_CAPTIONS_SRC}`, "utf8");
    expect(captions).toMatch(/^WEBVTT\n/);
    expect(captions).not.toMatch(/VO TBD/);
    expect(captions).toContain("Scan pages");
    expect(captions).toContain("Maya");
    const times = [...captions.matchAll(/(\d\d):(\d\d):(\d\d)\.(\d{3})/g)].map((match) => Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000);
    expect(times.length).toBeGreaterThan(100);
    expect(times.every((time, index) => time >= 0 && time < 167.867 && (index === 0 || time >= times[index - 1]))).toBe(true);
  });

  it("links the production watch page for every grade and sibling billing variant, regardless of dispatch configuration", () => {
    vi.stubEnv("ONBOARDING_WALKTHROUGH_URL", "https://dispatch.invalid/video");
    try {
      for (const grade of [0, 2, 3, 9]) for (const sharedWindow of [false, true]) for (const free of [false, true]) for (const reminder of [false, true]) {
        const email = planStartEmail({ parentName: "Sam", childName: "Alex", grade, sharedWindow, free, reminder, marking: true, explain: true, price: 59.99, firstCharge: "December 15, 2026" });
        expect(email.text).toContain(`${GETTING_STARTED_VIDEO_LABEL}: ${GETTING_STARTED_VIDEO_URL}`);
        expect(email.html).toContain(`href="${GETTING_STARTED_VIDEO_URL}"`);
        expect(email.html).toContain(`>${GETTING_STARTED_VIDEO_LABEL}</a>`);
        expect(email.html).toContain("display:inline-block;padding:14px 20px");
        expect(email.text.indexOf(GETTING_STARTED_VIDEO_LABEL)).toBeLessThan(email.text.indexOf("As a parent"));
        expect(email.text).not.toContain("dispatch.invalid");
        expect(email.text.includes("Set up Maya")).toBe(grade >= 3);
        expect(email.text).toContain("Your regular price is CAD 59.99 a month until you cancel.");
        expect(email.text.includes("We will email you a reminder 7 days before the first charge.")).toBe(reminder);
        expect(email.text.includes("you pay nothing.")).toBe(free);
        expect(email.text).toContain('then press "Cancel plan"');
        expect(email.text).toContain("contact@unicalearning.com");
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("preserves every other email byte across 216 variants from main fb98903a", () => {
    vi.stubEnv("ONBOARDING_WALKTHROUGH_URL", "");
    try {
      const messages = [];
      for (const grade of [2, 3, 9]) for (const sharedWindow of [undefined, true]) for (const free of [undefined, true, false]) for (const reminder of [undefined, true, false]) for (const marking of [false, true]) for (const explain of [false, true]) {
        const email = planStartEmail({ parentName: "Sam", childName: "Alex", grade, sharedWindow, free, reminder, marking, explain, price: 59.99, firstCharge: "December 15, 2026" });
        messages.push({
          ...email,
          text: email.text.replace(`${GETTING_STARTED_VIDEO_LABEL}: ${GETTING_STARTED_VIDEO_URL}\n\n`, ""),
          html: email.html.replace(/<p style="margin:0 0 16px"><a href="https:\/\/unicalearning.com\/getting-started"[^>]*>Watch the getting-started video<\/a><\/p>/, ""),
        });
      }
      expect(messages).toHaveLength(216);
      expect(createHash("sha256").update(JSON.stringify(messages)).digest("hex")).toBe("351c08319c21cd414c831758ca25d904a3b9cf048bb2d1477702c99f392002a6");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
