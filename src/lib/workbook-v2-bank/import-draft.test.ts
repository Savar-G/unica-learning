// The import command's file rule (B1-5) and the import plan's statuses (B1-4).
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkDraft } from "./draft";
import { assertOutsideGitRepo, importDraft, planImport, runBankImport } from "./import-draft";
import { memoryBankStore } from "./memory-store";
import { synthDraft } from "./store.fixtures";

type Rec = Record<string, unknown>;

describe("assertOutsideGitRepo", () => {
  let root: string;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "bank-guard-")));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const file = (...parts: string[]) => {
    const path = join(root, ...parts);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(synthDraft("guard")));
    return path;
  };

  it("accepts a file in a private folder outside every repository", () => {
    expect(() => assertOutsideGitRepo(file("private", "draft.json"))).not.toThrow();
  });

  it("refuses a file in a repository root, in its subfolder, and in a worktree whose .git is a file", () => {
    mkdirSync(join(root, "repo", ".git"), { recursive: true });
    mkdirSync(join(root, "worktree"), { recursive: true });
    writeFileSync(join(root, "worktree", ".git"), "gitdir: /tmp/example-gitdir\n");
    for (const path of [file("repo", "draft.json"), file("repo", "deep", "er", "draft.json"), file("worktree", "sub", "draft.json")]) {
      expect(() => assertOutsideGitRepo(path)).toThrow(/inside a git repository/);
    }
  });

  it("refuses a link outside a repository that leads into one, a link inside a repository that leads out, and an intermediate link inside a worktree that leads out", () => {
    mkdirSync(join(root, "repo", ".git"), { recursive: true });
    mkdirSync(join(root, "worktree"), { recursive: true });
    writeFileSync(join(root, "worktree", ".git"), "gitdir: /tmp/example-gitdir\n");
    const inside = file("repo", "draft.json");
    const outside = file("private", "draft.json");
    symlinkSync(inside, join(root, "private", "link-in.json"));
    symlinkSync(outside, join(root, "repo", "link-out.json"));
    symlinkSync(join(root, "repo"), join(root, "repo-folder-link"));
    symlinkSync(join(root, "private"), join(root, "worktree", "link-dir"));
    // Symlink bounce: private/entry -> repo/sub, repo/sub/exit -> private (bounces through repo and back outside).
    mkdirSync(join(root, "repo", "sub"), { recursive: true });
    symlinkSync(join(root, "repo", "sub"), join(root, "private", "entry"));
    symlinkSync(join(root, "private"), join(root, "repo", "sub", "exit"));
    for (const path of [
      join(root, "private", "link-in.json"),
      join(root, "repo", "link-out.json"),
      join(root, "repo-folder-link", "draft.json"),
      join(root, "worktree", "link-dir", "draft.json"),
      join(root, "private", "entry", "exit", "draft.json"),
    ]) {
      expect(() => assertOutsideGitRepo(path)).toThrow(/inside a git repository/);
    }
  });

  it("refuses a file inside this repository, and the import writes nothing", async () => {
    const store = memoryBankStore();
    const result = await runBankImport(fileURLToPath(import.meta.url), store);
    expect(result).toMatchObject({ ok: false, problems: [expect.stringMatching(/inside a git repository/)] });
    expect(store.tables.levels.size + store.tables.topics.size + store.tables.sheets.size + store.tables.questions.size).toBe(0);
  });
});

describe("planImport", () => {
  it("keeps an approved item that did not change, and sends a changed one back to draft with the next revision", async () => {
    const store = memoryBankStore();
    const draft = synthDraft("plan");
    await importDraft(draft, store);
    for (const row of store.tables.questions.values()) row.status = "approved";
    for (const row of store.tables.topics.values()) {
      row.status = "approved";
      row.child_title = "Kept title";
    }
    const edited = structuredClone(draft);
    ((edited.questions as Rec[])[0] as Rec).difficulty = 3;
    const checked = checkDraft(edited);
    if (!checked.ok) throw new Error(checked.problems.join("\n"));
    const { write, counts } = planImport(await store.readLevel(String((draft.level as Rec).id)), checked.rows);
    expect(write.questions.map((q) => [q.id, q.status, q.revision])).toEqual([["muffin-boxes", "draft", 2]]);
    expect(write.topics).toEqual([]);
    expect(counts).toEqual({ added: 0, changed: 1, unchanged: 19, retired: 0 });
    expect((await importDraft(edited, store)).ok).toBe(true);
    const topic = [...store.tables.topics.values()][0];
    expect([topic.status, topic.child_title]).toEqual(["approved", "Kept title"]);
  });
});
