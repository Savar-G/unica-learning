import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import { bookPageContent } from "@/lib/workbook-book";
import { coverLineProblem } from "@/lib/workbook-cover-line";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { renderFitCheck } from "@/lib/workbook-fit";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { renderWorkbook, type PrintOutput, type WorkbookDraft } from "@/lib/workbook-render";
import { bookPersona, firstCustomerProfile, type BookPersona } from "@/lib/workbook-sample-profiles";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

const BC = curriculumFor("bc")!;
const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const PERSONAS: BookPersona[] = ["ahead", "catch-up", "on-level", "rushed"];
const chromium = await findChromium();

describe.skipIf(!chromium)("personal cover print fit", () => {
  it("prints every persona and the first customer, and rejects a clipped cover box", async () => {
    const fixtures = [...PERSONAS.map(key => ({ key, ...bookPersona(key) })), { key: "first-customer", initials: "I.J.", profile: firstCustomerProfile() }];
    const draft: WorkbookDraft = {
      id: "55555555-5555-4555-8555-0000000000b1", childId: CHILD, number: 1, levels: [10, 13, 16], profileBuild: null,
      pages: fixtures.map(({ profile, initials }, i) => {
        const result = planNextWorkbook({ curriculum: BC, grade: 4, profile, workbooks: [], number: 1 });
        if (!result.ok) throw new Error(result.reason);
        return { number: i + 1, dayLabel: null, type: "cover", qrToken: `b1-cover-fixture-${i}`, questions: [],
          content: bookPageContent({ curriculum: BC, plan: result.plan, child: initials, workbook: 1, type: "cover", number: i + 1 }) };
      }),
    };
    const template = workbookTemplate(await fixedTemplateFonts());
    const engine = chromiumPrintEngine();
    let printed: PrintOutput | undefined;
    const result = await renderWorkbook({ draft, parentId: PARENT, template, engine: { print: async job => {
      printed = await engine.print(job);
      return printed;
    } } });
    expect(result.status === "failed" ? result.problems : []).toEqual([]);
    expect(result.status).toBe("rendered");
    expect(printed!.pdfPages).toBe(5);
    const measured = printed!.measured;
    for (const [i, page] of draft.pages.entries()) {
      if (page.content?.kind !== "cover") throw new Error("not a cover");
      const box = measured.find(m => m.sheet === i && m.name === "slot-made-from")!;
      expect(box.visible, fixtures[i].key).toBe(true);
      expect(box.textPrinted, fixtures[i].key).toBe(true);
      expect(box.text, fixtures[i].key).toContain(page.content.sentence);
      expect(box.scrollHeight, fixtures[i].key).toBeLessThanOrEqual(box.clientHeight + 1);
      expect(box.scrollWidth, fixtures[i].key).toBeLessThanOrEqual(box.clientWidth + 1);
      expect(coverLineProblem(page.content.sentence)).toBeNull();
    }

    // The very same copy must fail when the cover's box clips it.
    const clipped = { ...template, css: `${template.css}\n.made{max-height:60px}` };
    const fit = await renderFitCheck({ template: clipped, engine, parentId: PARENT }).fits(draft.pages[0], draft);
    expect(fit.ok).toBe(false);
    expect(fit.ok ? [] : fit.problems).toContainEqual(expect.objectContaining({ reason: expect.stringMatching(/made-from/) }));

    // Local review artifacts are optional. The gate needs no output directory.
    const out = process.env.B1_COVER_EVIDENCE;
    if (out && result.status === "rendered") {
      await mkdir(out, { recursive: true });
      const tiles: { input: Buffer; left: number; top: number }[] = [];
      for (const [i, image] of printed!.images.entries()) {
        await writeFile(`${out}/${fixtures[i].key}.png`, image.png);
        const resized = await sharp(image.png).resize(637, 825).png().toBuffer();
        const label = Buffer.from(`<svg width="637" height="35"><rect width="637" height="35" fill="white"/><text x="12" y="24" font-family="Arial" font-size="20">${fixtures[i].key}</text></svg>`);
        tiles.push({ input: label, left: i % 3 * 657, top: Math.floor(i / 3) * 880 });
        tiles.push({ input: resized, left: i % 3 * 657, top: Math.floor(i / 3) * 880 + 35 });
      }
      await sharp({ create: { width: 1971, height: 1760, channels: 3, background: "#eeeeee" } }).composite(tiles).png().toFile(`${out}/contact-sheet.png`);
      await writeFile(`${out}/covers.pdf`, printed!.pdf);
      await writeFile(`${out}/evidence.json`, JSON.stringify({ fixtures: fixtures.map((f, i) => ({ key: f.key, sentence: draft.pages[i].content?.kind === "cover" ? draft.pages[i].content.sentence : null })), measured: measured.filter(m => m.name === "slot-made-from"), clipped: fit }, null, 2));
    }
  }, 120_000);
});
