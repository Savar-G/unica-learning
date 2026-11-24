import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSafeOutputFile } from "@/lib/reference-record";
import { fileSlugFromRef } from "./answers";
import { keptCheckedRefs, loadCheckedPages } from "./checked-pages";
import { readRegularFileNoFollow, resolveSafeChildPath } from "./prepare";

// While a reader of one photo digest runs, no reading, final record, or view of that page may be in
// the work folder. The shelter moves those files to a new private folder in the OS temp folder and
// removes the digest from both run.json files. On close it puts back every file that was not
// replaced by a new reading. Without a commit (an error) it puts back everything and deletes the
// files written while it was open. It never takes the record of a page that a person checked: that
// file stays in final/, so that a killed run cannot lose it.

export type ShelterCategory = "slotA" | "slotB";

export interface PageShelterOptions {
  workDir: string;
  slotDirA: string;
  slotDirB: string;
  repoRoot: string;
  sha256: string;
  slotAFiles: string[];
  slotBFiles: string[];
  finalSourceRefs: string[];
}

export interface PageShelter {
  readonly shelterDir: string;
  // The old files of this reader are not put back on a committed close. newFiles are deleted on a
  // close without a commit.
  markReplaced(category: ShelterCategory, newFiles?: string[]): void;
  markCommitted(): void;
  close(): void;
}

interface ShelteredFile {
  category: ShelterCategory | "final";
  original: string;
  stored: string;
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function stripDigestFromRun(runPath: string, sha256: string, repoRoot: string): string | null {
  if (!exists(runPath)) return null;
  const text = readRegularFileNoFollow(runPath).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const photos = (parsed as { photos?: unknown }).photos;
  if (!Array.isArray(photos)) return null;
  const kept = photos.filter((p) => (p as { photo_sha256?: unknown })?.photo_sha256 !== sha256);
  if (kept.length === photos.length) return null;
  writeSafeOutputFile(runPath, `${JSON.stringify({ ...(parsed as object), photos: kept }, null, 2)}\n`, repoRoot);
  return text;
}

// Also in other letter case: some disks see one file there.
function assertNoCheckedRecord(workDir: string, refs: readonly string[]): void {
  const finalDir = join(workDir, "final");
  const slug = (ref: string): string => fileSlugFromRef(ref).toLowerCase();
  const kept = new Set([...keptCheckedRefs(finalDir, loadCheckedPages(finalDir))].map(slug));
  const checked = refs.find((ref) => kept.has(slug(ref)));
  if (checked !== undefined) {
    throw new Error(`Refusing to move the final record of ${checked}: a person checked this page.`);
  }
}

export function openPageShelter(opts: PageShelterOptions): PageShelter {
  assertNoCheckedRecord(opts.workDir, opts.finalSourceRefs);
  const shelterDir = mkdtempSync(join(tmpdir(), "unica-ref-shelter-"));
  chmodSync(shelterDir, 0o700);
  const files: ShelteredFile[] = [];
  const runTexts: Array<{ path: string; text: string }> = [];
  const replaced = new Set<ShelterCategory>();
  const newFiles: string[] = [];
  let committed = false;
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    const errors: string[] = [];
    if (!committed) {
      for (const path of newFiles) {
        try {
          if (exists(path)) unlinkSync(path);
        } catch (err) {
          errors.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      for (const run of runTexts) {
        try {
          writeSafeOutputFile(run.path, run.text, opts.repoRoot);
        } catch (err) {
          errors.push(`${run.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    for (const file of files) {
      if (committed && file.category !== "final" && replaced.has(file.category)) continue;
      try {
        writeSafeOutputFile(file.original, readFileSync(file.stored), opts.repoRoot);
      } catch (err) {
        errors.push(`${file.original}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (errors.length > 0) {
      throw new Error(
        `Could not put back ${errors.length} file(s); the old files stay in ${shelterDir} (see paths.json): ${errors.join("; ")}`,
      );
    }
    rmSync(shelterDir, { recursive: true, force: true });
  };

  try {
    for (const slotDir of [opts.slotDirA, opts.slotDirB]) {
      const runPath = join(slotDir, "run.json");
      const text = stripDigestFromRun(runPath, opts.sha256, opts.repoRoot);
      if (text !== null) runTexts.push({ path: runPath, text });
    }

    const finalDir = join(opts.workDir, "final");
    const viewDir = join(opts.workDir, "final-view");
    const candidates: Array<{ category: ShelteredFile["category"]; dir: string; name: string }> = [
      ...opts.slotAFiles.map((name) => ({ category: "slotA" as const, dir: opts.slotDirA, name })),
      ...opts.slotBFiles.map((name) => ({ category: "slotB" as const, dir: opts.slotDirB, name })),
      ...opts.finalSourceRefs.flatMap((ref) => [
        { category: "final" as const, dir: finalDir, name: `${fileSlugFromRef(ref)}.json` },
        { category: "final" as const, dir: viewDir, name: `${fileSlugFromRef(ref)}.md` },
      ]),
    ];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const original = resolveSafeChildPath(candidate.dir, candidate.name);
      if (!original || seen.has(original) || !exists(original)) continue;
      seen.add(original);
      const stored = join(shelterDir, String(files.length));
      writeFileSync(stored, readRegularFileNoFollow(original), { mode: 0o600, flag: "wx" });
      files.push({ category: candidate.category, original, stored });
      writeFileSync(
        join(shelterDir, "paths.json"),
        `${JSON.stringify(files.map((f) => ({ original: f.original, stored: f.stored })), null, 2)}\n`,
        { mode: 0o600 },
      );
      unlinkSync(original);
    }
  } catch (err) {
    try {
      close();
    } catch (closeErr) {
      throw new AggregateError([err, closeErr], (closeErr as Error).message);
    }
    throw err;
  }

  return {
    shelterDir,
    markReplaced(category, written = []) {
      replaced.add(category);
      newFiles.push(...written);
    },
    markCommitted() {
      committed = true;
    },
    close,
  };
}
