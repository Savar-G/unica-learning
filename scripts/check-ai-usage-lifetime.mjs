// Production Next bundle-boundary regression. Uses fake writes; no credentials or provider calls.
// Optional --source-ref COMMIT runs the same assertion with prior recorder/instrumentation source.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const ref = process.argv[2] === '--source-ref' ? process.argv[3] : null;
const source = path => ref ? execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' }) : readFileSync(path, 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'unica-usage-lifetime-'));
const next = resolve('node_modules/next/dist/bin/next');
let server;
try {
  mkdirSync(join(dir, 'src/lib'), { recursive: true });
  mkdirSync(join(dir, 'src/app/api/probe'), { recursive: true });
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  for (const name of ['ai-usage.ts', 'ai-usage-context.ts', 'supabase-public.ts']) writeFileSync(join(dir, 'src/lib', name), source(`src/lib/${name}`));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'usage-lifetime-proof', private: true }));
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'esnext'], strict: true, skipLibCheck: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', jsx: 'react-jsx', paths: { '@/*': ['./src/*'] } } }));
  writeFileSync(join(dir, 'next.config.mjs'), 'export default { turbopack: { root: "/" } };');
  writeFileSync(join(dir, 'src/app/layout.tsx'), 'export default function Layout({children}: {children: React.ReactNode}) {return <html><body>{children}</body></html>}');
  const instrumentation = source('src/instrumentation.ts');
  const setup = instrumentation.slice(instrumentation.indexOf('  if (process.env.NEXT_RUNTIME'), instrumentation.indexOf('  const runtime ='));
  assert.ok(setup.includes('configureAiUsageLifetime'));
  writeFileSync(join(dir, 'src/instrumentation.ts'), `export async function register() {\n(globalThis as any).retainedWrites = 0;\n${setup.replace('after(() => write)', '(after(() => write), (globalThis as any).retainedWrites++)')}\n}`);
  writeFileSync(join(dir, 'src/app/api/probe/route.ts'), `import {recordAiUsage} from '@/lib/ai-usage';
export async function GET() {
  recordAiUsage({feature:'other'}, {provider:'openrouter',model:'synthetic'}, async () => {});
  return Response.json({retainedWrites:(globalThis as any).retainedWrites});
}`);
  // Explicit minimal environment: never load project credentials into the test server.
  const env = { PATH: process.env.PATH, HOME: tmpdir(), VITEST: '1', NEXT_TELEMETRY_DISABLED: '1' };
  execFileSync(process.execPath, [next, 'build'], { cwd: dir, env, stdio: 'pipe', timeout: 180000 });
  server = spawn(process.execPath, [next, 'start', '-p', '0', '-H', '127.0.0.1'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = once(server, 'exit');
  let log = '';
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 20000);
    const read = b => { log += b; const match = log.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match && log.includes('Ready')) { clearTimeout(timer); resolve(match[0]); } };
    server.stdout.on('data', read); server.stderr.on('data', read);
    server.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited before ready')); });
  });
  const response = await fetch(`${origin}/api/probe`);
  const body = await response.text();
  console.log(JSON.stringify({ source: ref ?? 'working tree', status: response.status, bytes: Buffer.byteLength(body), ...JSON.parse(body) }));
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(body).retainedWrites, 1, 'Instrumentation must retain the request recorder write across separate production bundles');
  server.kill('SIGTERM'); await exit; server = null;
  console.log('PASS: production request registers its write with after. No hosted persistence claim.');
} finally {
  if (server && server.exitCode === null) { const ended = once(server, 'exit'); server.kill('SIGTERM'); await ended; }
  rmSync(dir, { recursive: true, force: true });
}
