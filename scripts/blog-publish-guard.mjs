#!/usr/bin/env node
// Guard for the Blog publish workflow (.github/workflows/blog-publish.yml).
// A claude/blog-* branch may only add one post and register it, so the weekly routine
// (docs/blog-automation.md) can never change site code on its way to production.
// Usage: node scripts/blog-publish-guard.mjs <base-ref> [<head-ref>]
// Exits 0 when the diff from the merge base is a valid post; prints the reasons and exits 1 otherwise.
import { execFileSync } from "node:child_process";

const base = process.argv[2];
const head = process.argv[3] ?? "HEAD";
if (!base) {
  console.error("usage: blog-publish-guard.mjs <base-ref> [<head-ref>]");
  process.exit(2);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const range = `${base}...${head}`;

const POST = /^src\/content\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\.tsx$/;
const REGISTRY = "src/lib/blog.ts";
const BACKLOG = "docs/blog-topics.md";
// The only lines the routine may add to or remove from the registry.
const REGISTRY_LINE = [/^import \* as \w+ from "@\/content\/blog\/[a-z0-9-]+";$/, /^const BLOG_MODULES: BlogModule\[\] = \[[\w, ]*\];$/];

const problems = [];
const changes = git("diff", "--name-status", "--no-renames", range).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
if (!changes.length) problems.push("the branch changes nothing");

const added = [];
for (const [status, path] of changes) {
  const post = POST.exec(path);
  if (post && status === "A") added.push(post[1]);
  else if (post && status === "M") continue; // an update to an existing post (a fix) is allowed
  else if ((path === REGISTRY || path === BACKLOG) && status === "M") continue;
  else problems.push(`not allowed: ${status} ${path}`);
}
if (added.length > 1) problems.push(`one new post per run, found ${added.length}: ${added.join(", ")}`);

if (changes.some(([status, p]) => p === REGISTRY && status === "M")) {
  const diff = git("diff", "--unified=0", range, "--", REGISTRY).split("\n");
  for (const line of diff) {
    if (!/^[+-]/.test(line) || /^(\+\+\+|---) /.test(line)) continue;
    const body = line.slice(1);
    if (body.trim() && !REGISTRY_LINE.some((re) => re.test(body))) problems.push(`registry line not allowed: ${line}`);
  }
}

if (problems.length) {
  console.error(`Blog publish guard failed for ${range}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Blog publish guard passed for ${range}: ${added.length ? `new post ${added[0]}` : "post update"} (${changes.length} files)`);
