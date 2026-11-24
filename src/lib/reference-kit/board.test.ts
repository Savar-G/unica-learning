import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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
    <rounded-rectangle id="12:2" name="Chart &#39;A&#39; &#x26; &#X42;" x="10" y="10" width="360" height="480" />
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
    expect(sections[3].photos[0].name).toBe("Chart 'A' & B");
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
  it("keeps the image with the most pixels of each photo, names small ones, names missing ones, and sets mode 0600", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-board-repo-"));
    const root = mkdtempSync(join(tmpdir(), "ref-board-"));
    tempDirs.push(repo, root);
    const downloads = join(root, "downloads");
    const photos = join(root, "photos");
    mkdirSync(downloads);
    mkdirSync(photos);

    // Photo a: a full-size original and a small preview. The extension of a download can be wrong.
    writeFileSync(join(downloads, "a-10-2__1.png"), await image(378, 504, "png"));
    writeFileSync(join(downloads, "a-10-2__2.bin"), await image(1800, 2400, "jpeg"));
    // Photo b: only a small preview.
    writeFileSync(join(downloads, "b-10-3__1.jpeg"), await image(378, 504, "jpeg"));
    // Photo d: narrow strip photo (long side passes, short side under 600 px).
    writeFileSync(join(downloads, "d-10-4__1.jpeg"), await image(461, 3473, "jpeg"));
    // Not an image, and a file with another name pattern.
    writeFileSync(join(downloads, "c-10-21__1.jpeg"), "not an image");
    writeFileSync(join(downloads, "notes.txt"), "ignore me");

    const result = await pickLargestDownloads(
      downloads,
      photos,
      ["a-10-2", "b-10-3", "c-10-21", "d-10-4"],
      repo,
    );

    expect(result.picked.map((p) => [p.file, p.width, p.height])).toEqual([
      ["a-10-2.jpg", 1800, 2400],
      ["b-10-3.jpg", 378, 504],
      ["d-10-4.jpg", 461, 3473],
    ]);
    expect(result.tooSmall.map((p) => p.stem)).toEqual(["b-10-3", "d-10-4"]);
    expect(result.missing).toEqual(["c-10-21"]);
    expect(readdirSync(photos).sort()).toEqual(["a-10-2.jpg", "b-10-3.jpg", "d-10-4.jpg"]);
    expect(statSync(join(photos, "a-10-2.jpg")).mode & 0o777).toBe(0o600);
    const kept = await sharp(join(photos, "a-10-2.jpg")).metadata();
    expect([kept.width, kept.height]).toEqual([1800, 2400]);
    expect(existsSync(join(photos, "notes.txt"))).toBe(false);
  });

  it("removes an older file of the same stem with a different extension before writing the new larger file", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-board-ext-repo-"));
    const root = mkdtempSync(join(tmpdir(), "ref-board-ext-"));
    tempDirs.push(repo, root);
    const downloads = join(root, "downloads");
    const photos = join(root, "photos");
    mkdirSync(downloads);
    mkdirSync(photos);

    // First pick writes a-10-2.png (smaller preview) and a-10-20.png (distinct stem that must stay).
    writeFileSync(join(downloads, "a-10-2__1.png"), await image(400, 500, "png"));
    writeFileSync(join(downloads, "a-10-20__1.png"), await image(1700, 1200, "png"));
    await pickLargestDownloads(downloads, photos, ["a-10-2", "a-10-20"], repo);
    expect(readdirSync(photos).sort()).toEqual(["a-10-2.png", "a-10-20.png"]);

    // Second pick has a larger JPEG for a-10-2: old a-10-2.png must be removed while a-10-20.png stays.
    writeFileSync(join(downloads, "a-10-2__2.bin"), await image(1800, 2400, "jpeg"));
    await pickLargestDownloads(downloads, photos, ["a-10-2", "a-10-20"], repo);
    expect(readdirSync(photos).sort()).toEqual(["a-10-2.jpg", "a-10-20.png"]);
  });

  it("refuses to write through a symlink at the destination or inside the repo root", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-board-sym-repo-"));
    const root = mkdtempSync(join(tmpdir(), "ref-board-sym-"));
    const outside = mkdtempSync(join(tmpdir(), "ref-board-sym-out-"));
    tempDirs.push(repo, root, outside);
    const downloads = join(root, "downloads");
    const photos = join(root, "photos");
    mkdirSync(downloads);
    mkdirSync(photos);

    const targetFile = join(outside, "victim.txt");
    writeFileSync(targetFile, "do-not-overwrite");
    symlinkSync(targetFile, join(photos, "a-10-2.jpg"));
    writeFileSync(join(downloads, "a-10-2__1.jpg"), await image(1800, 2400, "jpeg"));

    await expect(
      pickLargestDownloads(downloads, photos, ["a-10-2"], repo),
    ).rejects.toThrow(/symlink/i);
    expect(readFileSync(targetFile, "utf8")).toBe("do-not-overwrite");

    const insideRepoPhotos = join(repo, "photos-in");
    mkdirSync(insideRepoPhotos);
    await expect(
      pickLargestDownloads(downloads, insideRepoPhotos, ["a-10-2"], repo),
    ).rejects.toThrow(/inside the repository/i);
  });

  it("with a plan, keeps only the photos of the plan and removes a photo that left the board", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-board-plan-repo-"));
    const root = mkdtempSync(join(tmpdir(), "ref-board-plan-"));
    tempDirs.push(repo, root);
    const downloads = join(root, "downloads");
    const photos = join(root, "photos");
    mkdirSync(downloads);
    mkdirSync(photos);
    // An earlier run kept a photo that is no longer on the board, and its download is still there.
    writeFileSync(join(photos, "gone-10-9.jpg"), await image(1800, 2400, "jpeg"));
    writeFileSync(join(downloads, "gone-10-9__1.jpg"), await image(1800, 2400, "jpeg"));
    writeFileSync(join(downloads, "a-10-2__1.jpg"), await image(1800, 2400, "jpeg"));

    const result = await pickLargestDownloads(downloads, photos, ["a-10-2"], repo);

    expect(result.picked.map((p) => p.stem)).toEqual(["a-10-2"]);
    expect(result.removed).toEqual(["gone-10-9.jpg"]);
    expect(readdirSync(photos)).toEqual(["a-10-2.jpg"]);
  });

  it("prefers downloads that pass the size rule over a narrow image with more pixels, and falls back only when none passes", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-board-size-repo-"));
    const root = mkdtempSync(join(tmpdir(), "ref-board-size-"));
    tempDirs.push(repo, root);
    const downloads = join(root, "downloads");
    const photos = join(root, "photos");
    mkdirSync(downloads);
    mkdirSync(photos);

    // Narrow image has more pixels (2,096,500) than passing image (1,500,000); passing image wins in either order.
    writeFileSync(join(downloads, "p1-1-1__1.jpeg"), await image(599, 3500, "jpeg"));
    writeFileSync(join(downloads, "p1-1-1__2.jpeg"), await image(750, 2000, "jpeg"));
    writeFileSync(join(downloads, "p2-1-2__1.jpeg"), await image(750, 2000, "jpeg"));
    writeFileSync(join(downloads, "p2-1-2__2.jpeg"), await image(599, 3500, "jpeg"));
    // Two passing downloads: keep the one with the most pixels.
    writeFileSync(join(downloads, "p3-1-3__1.jpeg"), await image(750, 2000, "jpeg"));
    writeFileSync(join(downloads, "p3-1-3__2.jpeg"), await image(1800, 2400, "jpeg"));
    // No download passes: keep the one with the most pixels and flag it too small.
    writeFileSync(join(downloads, "p4-1-4__1.jpeg"), await image(378, 504, "jpeg"));
    writeFileSync(join(downloads, "p4-1-4__2.jpeg"), await image(599, 3500, "jpeg"));

    const result = await pickLargestDownloads(
      downloads,
      photos,
      ["p1-1-1", "p2-1-2", "p3-1-3", "p4-1-4"],
      repo,
    );

    expect(result.picked.map((p) => [p.stem, p.width, p.height])).toEqual([
      ["p1-1-1", 750, 2000],
      ["p2-1-2", 750, 2000],
      ["p3-1-3", 1800, 2400],
      ["p4-1-4", 599, 3500],
    ]);
    expect(result.tooSmall.map((p) => [p.stem, p.width, p.height])).toEqual([["p4-1-4", 599, 3500]]);
  });
});
