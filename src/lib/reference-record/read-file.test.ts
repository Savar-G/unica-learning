import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRegularFileIfExists, readRegularFileNoFollow } from "./read-file";

describe("the shared file reader", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ref-read-file-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads a regular file, and only a missing file counts as missing", () => {
    const path = join(dir, "file");
    writeFileSync(path, "text");
    expect(readRegularFileNoFollow(path).toString("utf8")).toBe("text");
    expect(readRegularFileIfExists(path)?.toString("utf8")).toBe("text");
    expect(readRegularFileIfExists(join(dir, "nothing"))).toBeNull();
    expect(() => readRegularFileNoFollow(join(dir, "nothing"))).toThrow(/ENOENT/);
  });

  it("refuses a link, a folder and a device", () => {
    writeFileSync(join(dir, "file"), "text");
    symlinkSync(join(dir, "file"), join(dir, "link"));
    symlinkSync(join(dir, "nothing"), join(dir, "dangling"));
    mkdirSync(join(dir, "folder"));
    for (const [path, expected] of [
      [join(dir, "link"), /symlink/],
      [join(dir, "dangling"), /symlink/],
      [join(dir, "folder"), /non-regular/],
      ["/dev/null", /non-regular/],
    ] as const) {
      expect(() => readRegularFileNoFollow(path), path).toThrow(expected);
      expect(() => readRegularFileIfExists(path), path).toThrow(expected);
    }
  });

  it("refuses a named pipe at once, also when nothing writes to it", () => {
    const pipe = join(dir, "pipe");
    const released = join(dir, "released");
    execFileSync("mkfifo", [pipe]);
    // A reader that waits for a writer would wait for ever. This helper lets it go after some seconds
    // and leaves a mark, so that the test fails and does not hang.
    const helper = spawn("sh", ["-c", 'sleep 4; : > "$1"; while true; do : > "$0"; done', pipe, released]);
    try {
      expect(() => readRegularFileNoFollow(pipe)).toThrow(/non-regular/);
      expect(() => readRegularFileIfExists(pipe)).toThrow(/non-regular/);
      expect(existsSync(released)).toBe(false);
    } finally {
      helper.kill("SIGKILL");
    }
  });
});
