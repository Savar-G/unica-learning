// Writes worker/maya-voice/package-lock.json from the root package-lock.json (#533 review R598-3): the voice worker's
// image installs exactly the package tree the root tests, typecheck and build ran with, transitive packages included.
// `npm install` in worker/maya-voice would resolve its own, newer tree instead; never run it there.
//
// It takes the worker's dependencies and devDependencies (worker/maya-voice/package.json), follows each package's
// dependencies, optional dependencies and required peers through the root lockfile with Node's lookup (the nearest
// node_modules folder up the path), and copies those entries, with the same paths, versions and integrity. The dev and
// optional flags are worked out again for the worker's own tree. worker/maya-voice/src/packaging.test.ts checks that the
// committed file equals this output.
//
// Usage: npm run voice:lock
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FLAGS = ["dev", "optional", "devOptional", "peer", "extraneous"];

/** The package entry a package at `from` gets for `name`: Node's lookup up the node_modules folders. */
function lookup(packages, from, name) {
  let base = from;
  for (;;) {
    const path = `${base ? `${base}/` : ""}node_modules/${name}`;
    if (packages[path]) return path;
    if (!base) return null;
    const i = base.lastIndexOf("/node_modules/");
    base = i < 0 ? "" : base.slice(0, i);
  }
}

/** The worker's lockfile, from the root lockfile and the worker's package.json. Throws when a needed package is missing. */
export function workerLock(rootLock, workerPackage) {
  const packages = rootLock.packages;
  /** Paths reached from `roots`; with `optional`, through optional edges too. */
  const reach = (roots, optional) => {
    const seen = new Set();
    const visit = (path) => {
      if (seen.has(path)) return;
      seen.add(path);
      const e = packages[path];
      const optionalPeers = e.peerDependenciesMeta ?? {};
      const edges = [
        ...Object.keys(e.dependencies ?? {}).map((n) => [n, false]),
        ...Object.keys(e.optionalDependencies ?? {}).map((n) => [n, true]),
        ...Object.keys(e.peerDependencies ?? {}).filter((n) => !optionalPeers[n]?.optional).map((n) => [n, false]),
      ];
      for (const [name, isOptional] of edges) {
        if (isOptional && !optional) continue;
        const to = lookup(packages, path, name);
        if (!to) {
          if (isOptional) continue;
          throw new Error(`${path} needs ${name}, which the root lockfile does not hold`);
        }
        visit(to);
      }
    };
    for (const name of roots) {
      const to = lookup(packages, "", name);
      if (!to) throw new Error(`the root lockfile does not hold ${name}`);
      visit(to);
    }
    return seen;
  };
  const prod = Object.keys(workerPackage.dependencies ?? {});
  const dev = Object.keys(workerPackage.devDependencies ?? {});
  for (const [name, version] of Object.entries({ ...workerPackage.dependencies, ...workerPackage.devDependencies })) {
    const found = packages[`node_modules/${name}`]?.version;
    if (found !== version) throw new Error(`worker/maya-voice/package.json has ${name} ${version}, the root lockfile ${found ?? "none"}`);
  }
  const prodRequired = reach(prod, false);
  const prodAny = reach(prod, true);
  const devRequired = reach(dev, false);
  const devAny = reach(dev, true);
  const out = {
    "": {
      name: workerPackage.name,
      ...(workerPackage.dependencies ? { dependencies: workerPackage.dependencies } : {}),
      ...(workerPackage.devDependencies ? { devDependencies: workerPackage.devDependencies } : {}),
    },
  };
  for (const path of [...new Set([...prodAny, ...devAny])].sort()) {
    const entry = Object.fromEntries(Object.entries(packages[path]).filter(([k]) => !FLAGS.includes(k)));
    if (prodRequired.has(path)) {
      // Needed at run time.
    } else if (prodAny.has(path)) entry.optional = true;
    else if (devRequired.has(path)) entry.dev = true;
    else { entry.dev = true; entry.optional = true; }
    out[path] = entry;
  }
  return { name: workerPackage.name, lockfileVersion: 3, requires: true, packages: out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
  const lock = workerLock(read("package-lock.json"), read("worker/maya-voice/package.json"));
  writeFileSync(resolve(root, "worker/maya-voice/package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`worker/maya-voice/package-lock.json: ${Object.keys(lock.packages).length - 1} packages from the root lockfile`);
}
