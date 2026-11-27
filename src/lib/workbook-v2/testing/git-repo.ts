// Whether a path is inside a git repository, so that real-level golden files and real families' books are never written
// into one (or read from one, for a private snapshot). It looks at the path as written and at the path with every symbolic
// link resolved, also links in parts that do not exist yet, and finds a ".git" folder or file (a worktree has a file) in
// the path or any folder above it.
import { lstatSync, readlinkSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

const MAX_LINKS = 40;

/**
 * Resolves symbolic links step by step in POSIX order, BEFORE collapsing `..`, so `/var/../.` follows `/var` to
 * `/private/var` and then steps to `/private` just as the filesystem does. Never passes unwalked segments through
 * `path.join` or `path.resolve`, which would collapse `..` lexically before following an intermediate symlink.
 */
export function resolvedPath(path: string, links = 0): string {
  const splitParts = (p: string): string[] => p.split(/[\\/]+/).filter((seg) => seg !== "" && seg !== ".");
  let current = isAbsolute(path) ? parse(path).root : resolvedPath(process.cwd(), links);
  const queue = splitParts(isAbsolute(path) ? path.slice(current.length) : path);
  let linkCount = links;
  for (let i = 0; i < queue.length; i++) {
    const part = queue[i];
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    const next = join(current, part);
    let link: boolean;
    try {
      link = lstatSync(next).isSymbolicLink();
    } catch {
      return resolve(next, ...queue.slice(i + 1));
    }
    if (link) {
      linkCount++;
      if (linkCount > MAX_LINKS) throw new Error(`${path} has too many symbolic links.`);
      const target = readlinkSync(next);
      const rest = queue.slice(i + 1);
      if (isAbsolute(target)) {
        const root = parse(target).root;
        current = root;
        queue.splice(0, queue.length, ...splitParts(target.slice(root.length)), ...rest);
      } else {
        queue.splice(0, queue.length, ...splitParts(target), ...rest);
      }
      i = -1;
      continue;
    }
    current = next;
  }
  return current;
}

const hasGit = (folder: string): boolean => {
  try {
    lstatSync(join(folder, ".git"));
    return true;
  } catch {
    return false;
  }
};

function repoAbove(path: string): string | null {
  for (let folder = path; ; folder = dirname(folder)) {
    if (hasGit(folder)) return folder;
    if (dirname(folder) === folder) return null;
  }
}

/** The repository that holds the path, as written or with its links resolved in POSIX order, or null when there is none. */
export function gitRepoOf(path: string): string | null {
  return repoAbove(resolve(path)) ?? repoAbove(resolvedPath(path));
}

/** Stops when the path is in a git repository and returns the POSIX-resolved path to use for I/O. */
export function refuseInsideGit(path: string, what: string): string {
  const safe = resolvedPath(path);
  const repo = repoAbove(resolve(path)) ?? repoAbove(safe);
  if (repo !== null) throw new Error(`Refused: ${what} ${path} is inside the git repository ${repo}. Use a folder outside every git repository.`);
  return safe;
}

/** True when two paths resolve to the same place or one sits inside the other. */
export function pathsOverlap(a: string, b: string): boolean {
  const [ra, rb] = [resolvedPath(a), resolvedPath(b)];
  if (ra === rb) return true;
  const inside = (parent: string, child: string) => {
    const rel = relative(parent, child);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  };
  return inside(ra, rb) || inside(rb, ra);
}
