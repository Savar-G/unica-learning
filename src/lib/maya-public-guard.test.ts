import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WhatsIncluded, SHOW_CALL_SCREENS, SHOW_VOICE_DEMO } from "@/components/whats-included";
import { SHOW_VOICE_DEMO as SHOW_HOME_VOICE_DEMO } from "@/components/guidance-demo";
import { SHOW_OLD_SAMPLE_PLANS } from "@/lib/maya-public-images";
import Home from "@/app/(site)/page";

vi.mock("@/components/card-return", () => ({ CardReturn: () => null }));

// Follow public page imports into components and shared copy, and include all published content.
const root = resolve(process.cwd(), "src");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.(tsx?|mdx)$/.test(path) && !/\.test\./.test(path) ? [path] : [];
  });
}
function publicSources(): string[] {
  const pending = [...files(join(root, "app/(site)")), ...files(join(root, "content")), ...files(join(root, "app/llms.txt")), join(root, "app/opengraph-image.tsx")];
  const seen = new Set<string>();
  while (pending.length) {
    const path = pending.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
      const spec = match[1];
      const base = spec.startsWith("@/") ? join(root, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(path), spec) : "";
      if (!base || !base.startsWith(root)) continue;
      for (const candidate of [base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")]) {
        try { readFileSync(candidate); pending.push(candidate); break; } catch { /* Not a source module. */ }
      }
    }
  }
  return [...seen];
}

const forbidden = /speaks to your child|unlimited chat|(?:every grade.{0,80}(?:maya|chat)|(?:maya|chat).{0,80}every grade)|gives your child the answer|call maya|call the teaching assistant|out loud|talk with the teaching assistant|voice calls?|companion calls|call with maya|\bcall the|call notes|numbers on this page are made up/i;

describe("first ship public Maya copy", () => {
  it("has no voice claims in public sources", () => {
    const allowed: Record<string, RegExp[]> = {
      "app/(site)/terms/page.tsx": [/Voice calls with Maya are not open to families/],
      "app/(site)/privacy/page.tsx": [/Voice calls with Maya \(not open yet\)/, /Voice calls are not open to families/, /holds nothing from a chat or call with Maya/],
      "content/resources/bc-proficiency-scale.tsx": [/what many parents still call the final report card/, /Ask your child to explain their thinking out loud/],
      "content/resources/bc-grade-4-math-and-reading.tsx": [/recall the 2s/],
      // These components remain in the source for a later release. The render test checks that they are hidden.
      "components/whats-included-dash.tsx": [/const NAV = .*Companion calls/],
      "components/whats-included.tsx": [/This demo shows a planned voice call/],
      "components/guidance-demo.tsx": [/This demo shows a planned voice call/],
      "components/guidance.tsx": [/\/\/ "voice call" wording/],
    };
    const violations: string[] = [];
    for (const path of publicSources()) {
      // Windows paths use backslashes; the allow-list keys use slashes.
      const relative = path.slice(root.length + 1).replace(/\\/g, "/");
      if (relative.startsWith("lib/") && relative.slice(4).includes("/")) continue;
      readFileSync(path, "utf8").split("\n").forEach((line, index) => {
        if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;
        if (forbidden.test(line) && !(allowed[relative] ?? []).some((rule) => rule.test(line))) violations.push(`${relative}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(violations).toEqual([]);
  });

  it("keeps the first ship image and voice flags off", () => {
    expect([SHOW_OLD_SAMPLE_PLANS, SHOW_CALL_SCREENS, SHOW_VOICE_DEMO, SHOW_HOME_VOICE_DEMO]).toEqual([false, false, false, false]);
  });

  it("does not render the hidden images on either public page", () => {
    for (const page of [Home, WhatsIncluded]) {
      const html = renderToStaticMarkup(createElement(page));
      expect(html).not.toMatch(/(?:leah|mateo)-02-plan\.jpg|app-marked\.png|dash-main\.jpg|dash-side\.png|dash\.jpg|app-callnotes\.png|Companion calls|Call with Maya|call notes|Numbers on this page are made up|Every scan updates your dashboard/i);
    }
  });
});
