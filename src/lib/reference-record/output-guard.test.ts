import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertOutsideRepo,
  assertSafeOutputFile,
  isPathInsideDir,
  prepareSafeOutputDir,
  writeSafeOutputFile,
} from "./output-guard";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("assertOutsideRepo", () => {
  it("refuses paths inside the repo root and allows paths outside", () => {
    const root = mkdtempSync(join(tmpdir(), "ref-guard-repo-"));
    const outside = mkdtempSync(join(tmpdir(), "ref-guard-out-"));
    tempDirs.push(root, outside);

    expect(() => assertOutsideRepo(root, root)).toThrow(/Refusing to write/);
    expect(() => assertOutsideRepo(join(root, "sub", "records"), root)).toThrow(/Refusing to write/);
    expect(() => assertOutsideRepo(join(outside, "records"), root)).not.toThrow();
    expect(isPathInsideDir(join(outside, "records"), root)).toBe(false);
  });

  it("treats names inside the repo that start with double dots as inside the repo", () => {
    const root = mkdtempSync(join(tmpdir(), "ref-guard-repo-"));
    tempDirs.push(root);

    expect(isPathInsideDir(join(root, "..notes"), root)).toBe(true);
    expect(isPathInsideDir(join(root, "..notes", "records"), root)).toBe(true);
    expect(() => assertOutsideRepo(join(root, "..notes"), root)).toThrow(/Refusing to write/);
    expect(() => assertOutsideRepo(join(root, "..notes", "records"), root)).toThrow(
      /Refusing to write/,
    );
    expect(isPathInsideDir(join(root, "..", "sibling-outside"), root)).toBe(false);
  });

  it("refuses a letter-case variant of the repo path on a case-insensitive volume", () => {
    const base = mkdtempSync(join(tmpdir(), "ref-guard-case-"));
    tempDirs.push(base);
    const repo = join(base, "repoFolder");
    mkdirSync(repo);
    const variant = join(base, "REPOFOLDER");
    const sameFolderOnDisk = existsSync(variant);

    expect(isPathInsideDir(join(variant, "out"), repo)).toBe(sameFolderOnDisk);
    if (sameFolderOnDisk) {
      expect(() => prepareSafeOutputDir(join(variant, "out"), repo)).toThrow(
        /inside the repository/,
      );
      expect(() => writeSafeOutputFile(join(variant, "a.json"), "{}", repo)).toThrow(
        /inside the repository/,
      );
      expect(existsSync(join(repo, "out"))).toBe(false);
      expect(existsSync(join(repo, "a.json"))).toBe(false);
    }
  });

  it("refuses a symlink outside the repo that points inside the repo", () => {
    const root = mkdtempSync(join(tmpdir(), "ref-guard-repo-"));
    const outside = mkdtempSync(join(tmpdir(), "ref-guard-out-"));
    tempDirs.push(root, outside);

    const link = join(outside, "link-to-repo");
    symlinkSync(root, link);
    expect(() => assertOutsideRepo(join(link, "out"), root)).toThrow(/Refusing to write/);
    expect(() => prepareSafeOutputDir(join(link, "out"), root)).toThrow(/Refusing to write/);
  });

  it("refuses destination files that are symlinks or non-regular files", () => {
    const root = mkdtempSync(join(tmpdir(), "ref-guard-repo-"));
    const outside = mkdtempSync(join(tmpdir(), "ref-guard-out-"));
    tempDirs.push(root, outside);

    const repoTarget = join(root, "secret.json");
    writeFileSync(repoTarget, "original", "utf8");
    const outsideTarget = join(outside, "other.json");
    writeFileSync(outsideTarget, "other", "utf8");

    const linkIntoRepo = join(outside, "link-in.json");
    symlinkSync(repoTarget, linkIntoRepo);
    const linkOutside = join(outside, "link-out.json");
    symlinkSync(outsideTarget, linkOutside);
    const subDir = join(outside, "subdir.json");
    mkdirSync(subDir);

    expect(() => assertSafeOutputFile(linkIntoRepo, root)).toThrow(/symlink|regular file/i);
    expect(() => assertSafeOutputFile(linkOutside, root)).toThrow(/symlink|regular file/i);
    expect(() => assertSafeOutputFile(subDir, root)).toThrow(/symlink|regular file/i);

    // Non-existent file and regular file outside repo are allowed
    expect(() => assertSafeOutputFile(join(outside, "new.json"), root)).not.toThrow();
    expect(() => assertSafeOutputFile(outsideTarget, root)).not.toThrow();
  });

  it("does not overwrite a protected repo file reached through a hard link outside the repo", () => {
    const root = mkdtempSync(join(tmpdir(), "ref-guard-repo-"));
    const outside = mkdtempSync(join(tmpdir(), "ref-guard-out-"));
    tempDirs.push(root, outside);

    const protectedFile = join(root, "protected.json");
    writeFileSync(protectedFile, "protected original", "utf8");
    const hardLinkOutside = join(outside, "linked-record.json");
    linkSync(protectedFile, hardLinkOutside);

    writeSafeOutputFile(hardLinkOutside, "private output payload", root);

    expect(readFileSync(protectedFile, "utf8")).toBe("protected original");
    expect(readFileSync(hardLinkOutside, "utf8")).toBe("private output payload");
  });

  it("creates output directories with mode 0700 and output files with mode 0600", () => {
    const root = mkdtempSync(join(tmpdir(), "ref-guard-repo-"));
    const outside = mkdtempSync(join(tmpdir(), "ref-guard-out-"));
    tempDirs.push(root, outside);

    const outDir = prepareSafeOutputDir(join(outside, "private-records"), root);
    expect(statSync(outDir).mode & 0o777).toBe(0o700);

    const outFile = join(outDir, "record.json");
    writeSafeOutputFile(outFile, "{\"ok\":true}\n", root);
    expect(statSync(outFile).mode & 0o777).toBe(0o600);

    const binFile = join(outDir, "photo.jpg");
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    writeSafeOutputFile(binFile, bytes, root);
    expect(statSync(binFile).mode & 0o777).toBe(0o600);
    expect(new Uint8Array(readFileSync(binFile))).toEqual(bytes);
  });

  it("refuses output paths inside another git repository (.git folder or .git file) while allowing normal temp folders", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-guard-repo-"));
    const otherGitDir = mkdtempSync(join(tmpdir(), "ref-guard-othergit-"));
    const otherWorktree = mkdtempSync(join(tmpdir(), "ref-guard-worktree-"));
    const normalOutside = mkdtempSync(join(tmpdir(), "ref-guard-plain-"));
    tempDirs.push(repo, otherGitDir, otherWorktree, normalOutside);

    mkdirSync(join(otherGitDir, ".git"));
    writeFileSync(join(otherWorktree, ".git"), "gitdir: /tmp/example-gitdir\n", "utf8");

    expect(() => assertOutsideRepo(join(otherGitDir, "nested", "out"), repo)).toThrow(
      /inside a git repository/i,
    );
    expect(() => prepareSafeOutputDir(join(otherGitDir, "nested", "out"), repo)).toThrow(
      /inside a git repository/i,
    );
    expect(() => assertOutsideRepo(join(otherWorktree, "out"), repo)).toThrow(
      /inside a git repository/i,
    );
    expect(() => prepareSafeOutputDir(join(otherWorktree, "out"), repo)).toThrow(
      /inside a git repository/i,
    );
    expect(() => assertOutsideRepo(join(normalOutside, "private-out"), repo)).not.toThrow();
  });

  it("refuses output paths inside a bare git repository, which has no .git entry", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-guard-repo-"));
    const bare = mkdtempSync(join(tmpdir(), "ref-guard-bare-"));
    const lookalike = mkdtempSync(join(tmpdir(), "ref-guard-lookalike-"));
    tempDirs.push(repo, bare, lookalike);
    writeFileSync(join(bare, "HEAD"), "ref: refs/heads/main\n", "utf8");
    mkdirSync(join(bare, "objects"));
    mkdirSync(join(bare, "refs"));
    // A folder that only has a file named HEAD is not a repository.
    writeFileSync(join(lookalike, "HEAD"), "notes\n", "utf8");

    expect(() => assertOutsideRepo(join(bare, "reference-work"), repo)).toThrow(
      /inside a git repository/i,
    );
    expect(() => prepareSafeOutputDir(join(bare, "reference-work"), repo)).toThrow(
      /inside a git repository/i,
    );
    expect(() => assertOutsideRepo(join(lookalike, "out"), repo)).not.toThrow();
  });
});
