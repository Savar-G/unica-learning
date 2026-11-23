import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildBoardPlan,
  findLevelSection,
  parseBoardSections,
  pickLargestDownloads,
  sourceKeyFromSectionName,
} from "./board";

const LISTING = `<canvas id="1:1" name="Reference pages" x="0" y="0" width="0" height="0">
  <section id="10:1" name="Grade 3 (Sample Level M)" x="0" y="0" width="9000" height="6000">
    <rounded-rectangle id="10:2" name="IMG_0001 1" x="10" y="10" width="743" height="3310" />
    <rounded-rectangle id="10:3" name="IMG_0002 1" x="900" y="10" width="360" height="480" />
    <connector id="10:9" x="5" y="5" connectorStart="10:2" connectorEnd="10:3"></connector>
    <sticky id="10:8" x="1" y="1" color="STICKY_RED" author="" width="240" height="240">A note &amp; more</sticky>
    <section id="10:20" name="Later sheets" x="0" y="0" width="100" height="100">
      <rounded-rectangle id="10:21" name="IMG_0003 1" x="10" y="10" width="360" height="480" />
    </section>
  </section>
  <section id="11:1" name="Grade 4 (Sample Level N)" x="0" y="7000" width="9000" height="6000">
    <rounded-rectangle id="11:2" name="IMG_0002 1" x="10" y="10" width="360" height="480" />
  </section>
  <section id="12:1" name="Visuals" x="0" y="14000" width="9000" height="6000">
    <rounded-rectangle id="12:2" name="Chart &#39;A&#39;" x="10" y="10" width="360" height="480" />
  </section>
</canvas>`;

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

async function image(width: number, height: number, format: "jpeg" | "png"): Promise<Buffer> {
  const base = sharp({ create: { width, height, channels: 3, background: "#ffffff" } });
  return format === "jpeg" ? base.jpeg().toBuffer() : base.png().toBuffer();
}

describe("board sections", () => {
  it("lists each section with its photo nodes, also the photos of an inner section", () => {
    const sections = parseBoardSections(LISTING);
    expect(sections.map((s) => [s.name, s.photos.length])).toEqual([
      ["Grade 3 (Sample Level M)", 3],
      ["Later sheets", 1],
      ["Grade 4 (Sample Level N)", 1],
      ["Visuals", 1],
    ]);
    expect(sections[0].photos.map((p) => p.nodeId)).toEqual(["10:2", "10:3", "10:21"]);
    expect(sections[3].photos[0].name).toBe("Chart 'A'");
  });

  it("gives each photo a unique, file-name-safe stem even when two photos share a name", () => {
    const stems = parseBoardSections(LISTING).flatMap((s) => s.photos.map((p) => p.stem));
    expect(stems.every((stem) => /^[A-Za-z0-9_-]+$/.test(stem))).toBe(true);
    const m = buildBoardPlan(LISTING, "M").photos.map((p) => p.stem);
    const n = buildBoardPlan(LISTING, "N").photos.map((p) => p.stem);
    expect(new Set([...m, ...n]).size).toBe(m.length + n.length);
  });

  it("finds the section of a level by whole words and reports the choices when it finds none", () => {
    const sections = parseBoardSections(LISTING);
    const found = findLevelSection(sections, "n");
    expect(found.ok && found.section.nodeId).toBe("11:1");

    const none = findLevelSection(sections, "Q");
    expect(none.ok).toBe(false);
    if (!none.ok) {
      expect(none.candidates).toEqual(["Grade 3 (Sample Level M)", "Grade 4 (Sample Level N)"]);
    }
    expect(findLevelSection(sections, "M N").ok).toBe(false);
    expect(() => buildBoardPlan(LISTING, "Q")).toThrow(/no section is named "Level Q"/);
  });

  it("builds a plan with the level in upper case and the source key from the section name", () => {
    const plan = buildBoardPlan(LISTING, "m");
    expect(plan.level).toBe("M");
    expect(plan.source).toBe("sample");
    expect(plan.section).toEqual({ nodeId: "10:1", name: "Grade 3 (Sample Level M)" });
    expect(plan.photos).toHaveLength(3);
    expect(sourceKeyFromSectionName("Visuals")).toBeNull();
  });
});

describe("pickLargestDownloads", () => {
  it("keeps the image with the most pixels of each photo, names small ones, and names missing ones", async () => {
    const root = mkdtempSync(join(tmpdir(), "ref-board-"));
    tempDirs.push(root);
    const downloads = join(root, "downloads");
    const photos = join(root, "photos");
    mkdirSync(downloads);
    mkdirSync(photos);

    // Photo a: a full-size original and a small preview. The extension of a download can be wrong.
    writeFileSync(join(downloads, "a-10-2__1.png"), await image(378, 504, "png"));
    writeFileSync(join(downloads, "a-10-2__2.bin"), await image(1800, 2400, "jpeg"));
    // Photo b: only a small preview.
    writeFileSync(join(downloads, "b-10-3__1.jpeg"), await image(378, 504, "jpeg"));
    // Not an image, and a file with another name pattern.
    writeFileSync(join(downloads, "c-10-21__1.jpeg"), "not an image");
    writeFileSync(join(downloads, "notes.txt"), "ignore me");

    const result = await pickLargestDownloads(downloads, photos, ["a-10-2", "b-10-3", "c-10-21"]);

    expect(result.picked.map((p) => [p.file, p.width, p.height])).toEqual([
      ["a-10-2.jpg", 1800, 2400],
      ["b-10-3.jpg", 378, 504],
    ]);
    expect(result.tooSmall.map((p) => p.stem)).toEqual(["b-10-3"]);
    expect(result.missing).toEqual(["c-10-21"]);
    expect(readdirSync(photos).sort()).toEqual(["a-10-2.jpg", "b-10-3.jpg"]);
    const kept = await sharp(join(photos, "a-10-2.jpg")).metadata();
    expect([kept.width, kept.height]).toEqual([1800, 2400]);
    expect(existsSync(join(photos, "notes.txt"))).toBe(false);
  });
});
