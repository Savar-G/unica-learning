// Whether a path is inside a git repository, so that real-level golden files and real families' books are never written
// into one (or read from one, for a private snapshot). It looks at the path as written and at the path with every symbolic
// link resolved, also links in parts that do not exist yet, and finds a ".git" folder or file (a worktree has a file) in
// the path or any folder above it.
import { lstatSync, readlinkSync } from "node:fs";
import { dirname, join, parse, resolve, sep } from "node:path";

const MAX_LINKS = 40;

/** The path with every symbolic link resolved. A part that does not exist ends the resolving: no link can be below it. */
export function resolvedPath(path: string, links = 0): string {
  const absolute = resolve(path);
  const parts = absolute.split(sep).filter((p) => p !== "");
  let current = parse(absolute).root;
  for (let i = 0; i < parts.length; i++) {
    const next = join(current, parts[i]);
    let link: boolean;
    try {
      link = lstatSync(next).isSymbolicLink();
    } catch {
      return join(next, ...parts.slice(i + 1));
    }
    if (link) {
      if (links >= MAX_LINKS) throw new Error(`${path} has too many symbolic links.`);
      return resolvedPath(join(resolve(current, readlinkSync(next)), ...parts.slice(i + 1)), links + 1);
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

/** The repository that holds the path, as written or with its links resolved, or null when there is none. */
export function gitRepoOf(path: string): string | null {
  return repoAbove(resolve(path)) ?? repoAbove(resolvedPath(path));
}

/** Stops when the path is in a git repository. `what` names the file for the message. */
export function refuseInsideGit(path: string, what: string): void {
  const repo = gitRepoOf(path);
  if (repo !== null) throw new Error(`Refused: ${what} ${path} is inside the git repository ${repo}. Use a folder outside every git repository.`);
}
