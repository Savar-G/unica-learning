import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const MAX_SYMLINK_DEPTH = 40;

function resolveRealPath(targetPath: string, depth = 0): string {
  if (depth > MAX_SYMLINK_DEPTH) {
    throw new Error(`Too many levels of symbolic links while resolving ${targetPath}`);
  }
  const abs = resolve(targetPath);
  const trailing: string[] = [];
  let cursor = abs;

  while (true) {
    let stat;
    try {
      stat = lstatSync(cursor);
    } catch {
      const parent = dirname(cursor);
      if (parent === cursor) return trailing.length > 0 ? join(cursor, ...trailing) : cursor;
      trailing.unshift(cursor.slice(parent.length).replace(/^[/\\]+/, ""));
      cursor = parent;
      continue;
    }

    if (stat.isSymbolicLink() && !existsSync(cursor)) {
      const linkTarget = readlinkSync(cursor);
      const nextTarget = resolve(dirname(cursor), linkTarget);
      const combined = trailing.length > 0 ? join(nextTarget, ...trailing) : nextTarget;
      return resolveRealPath(combined, depth + 1);
    }

    const base = realpathSync(cursor);
    return trailing.length > 0 ? join(base, ...trailing) : base;
  }
}

// True when the nearest existing ancestor of the candidate, or any folder above it, is the same
// folder on disk as the container. This catches a path that differs only in letter case on a
// case-insensitive volume, where a string comparison sees two different paths.
function hasContainerAsAncestorOnDisk(candidatePath: string, containerDir: string): boolean {
  let container;
  try {
    container = statSync(containerDir);
  } catch {
    return false;
  }
  let cursor = resolve(candidatePath);
  while (true) {
    try {
      const stat = statSync(cursor);
      if (stat.dev === container.dev && stat.ino === container.ino) return true;
    } catch {
      // The path does not exist yet; check the folder above it.
    }
    const parent = dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}

export function isPathInsideDir(candidatePath: string, containerDir: string): boolean {
  if (hasContainerAsAncestorOnDisk(candidatePath, containerDir)) return true;
  const realContainer = resolveRealPath(containerDir);
  const realCandidate = resolveRealPath(candidatePath);
  if (hasContainerAsAncestorOnDisk(realCandidate, realContainer)) return true;
  const rel = relative(realContainer, realCandidate);
  if (rel === "") return true;
  if (isAbsolute(rel)) return false;
  const firstComponent = rel.split(/[\\/]/)[0];
  return firstComponent !== "..";
}

function findGitAncestor(candidatePath: string): string | null {
  let cursor = resolveRealPath(candidatePath);
  while (true) {
    try {
      const stat = lstatSync(cursor);
      if (stat.isDirectory()) {
        try {
          lstatSync(join(cursor, ".git"));
          return cursor;
        } catch {
          // no .git entry in this ancestor
        }
      }
    } catch {
      // ancestor does not exist yet; keep walking up
    }
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

export function assertOutsideRepo(outPath: string, repoRoot: string): void {
  if (isPathInsideDir(outPath, repoRoot)) {
    throw new Error(
      `Refusing to write reference records inside the repository (${resolve(outPath)}). Choose an --out folder outside ${resolve(repoRoot)}.`,
    );
  }
  const gitRoot = findGitAncestor(outPath);
  if (gitRoot) {
    throw new Error(
      `Refusing to write reference records to ${resolve(outPath)}: the output folder is inside a git repository (${gitRoot}).`,
    );
  }
}

export function prepareSafeOutputDir(outPath: string, repoRoot: string): string {
  const absOut = resolve(outPath);
  assertOutsideRepo(absOut, repoRoot);
  mkdirSync(absOut, { recursive: true, mode: 0o700 });
  const realOut = realpathSync(absOut);
  assertOutsideRepo(realOut, repoRoot);
  chmodSync(realOut, 0o700);
  return realOut;
}

export function assertSafeOutputFile(filePath: string, repoRoot: string): void {
  const absFile = resolve(filePath);
  assertOutsideRepo(dirname(absFile), repoRoot);
  let stat;
  try {
    stat = lstatSync(absFile);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      assertOutsideRepo(absFile, repoRoot);
      return;
    }
    throw err;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to write through a symlink destination file: ${absFile}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Refusing to overwrite non-regular file destination: ${absFile}`);
  }
  assertOutsideRepo(absFile, repoRoot);
}

export function writeSafeOutputFile(
  filePath: string,
  content: string | Uint8Array,
  repoRoot: string,
): void {
  assertSafeOutputFile(filePath, repoRoot);
  const absFile = resolve(filePath);
  const realDir = realpathSync(dirname(absFile));
  assertOutsideRepo(realDir, repoRoot);
  const targetPath = join(realDir, basename(absFile));
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow;
  const tempName = `.${basename(absFile)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const tempPath = join(realDir, tempName);

  const fd = openSync(tempPath, flags, 0o600);
  try {
    fchmodSync(fd, 0o600);
    if (typeof content === "string") {
      writeFileSync(fd, content, "utf8");
    } else {
      writeFileSync(fd, content);
    }
  } catch (err) {
    try {
      closeSync(fd);
    } catch {
      // ignore secondary close error
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
  closeSync(fd);

  try {
    assertSafeOutputFile(targetPath, repoRoot);
    renameSync(tempPath, targetPath);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}
