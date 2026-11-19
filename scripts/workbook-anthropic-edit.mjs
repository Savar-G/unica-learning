// The same server-only bundling seam as workbook-worker.mjs. --help needs no credentials or network.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({ absWorkingDir: root, entryPoints: ['scripts/workbook-anthropic-edit.ts'], outfile: '.workbook-worker/anthropic-edit.mjs',
  bundle: true, platform: 'node', target: 'node22', format: 'esm', packages: 'external',
  plugins: [{ name: 'server-only', setup(b) {
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
  } }],
});
const child = spawn(process.execPath, [resolve(root, '.workbook-worker/anthropic-edit.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
