import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const launcher = new URL("./run.mjs", import.meta.url).href;
beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function child(code: string) {
  return execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 30_000 });
}
it("builds the real desk and core and verifies the full imported source graph", () => {
  const output = execFileSync(process.execPath, ["scripts/maya-isolated-stream/run.mjs", "--check"], { encoding: "utf8", timeout: 30_000 });
  expect(output).toMatch(/Verified \d+ core source files against b8d7569/);
  expect(output).toContain("Production streamChat is false");
});
it("refuses changed core bytes before startup without editing the worktree source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "maya-provenance-negative-"));
  try {
    await mkdir(join(dir, "src/lib"), { recursive: true });
    await copyFile("src/lib/maya-call-seams.ts", join(dir, "src/lib/maya-call-seams.ts"));
    await writeFile(join(dir, "src/lib/maya-call.ts"), "changed core");
    const result = child(`import { verifySource } from ${JSON.stringify(launcher)};
      import assert from 'node:assert/strict';
      await assert.rejects(verifySource(['src/lib/maya-call.ts'], ${JSON.stringify(dir)}), /Source differs/);
      console.log('changed core refused');`);
    expect(result).toContain("changed core refused");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it("clears inherited environment and blocks fetch, HTTP, TCP and UDP before any request", () => {
  const result = child(`import { blockOutbound } from ${JSON.stringify(launcher)};
    import assert from 'node:assert/strict';
    import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import dgram from 'node:dgram';
    assert.deepEqual(Object.keys(process.env), []);
    blockOutbound();
    for (const send of [() => fetch('https://example.invalid'), () => http.request('http://example.invalid'), () => https.get('https://example.invalid'), () => new net.Socket().connect(443, 'example.invalid')]) assert.throws(send, /requests are disabled/);
    const socket = dgram.createSocket('udp4'); assert.throws(() => socket.send('x', 1, 'example.invalid'), /requests are disabled/); socket.close();
    console.log('all outbound attempts refused');`);
  expect(result).toContain("all outbound attempts refused");
});
