// The fixture intentionally stays outside the normal test/typecheck set: it needs the disposable SQL server.
import {execFileSync,spawnSync} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
if(process.env.PD559_SOCKET!=='/tmp/pd-controls-bf76-pg')throw Error('Disposable repair socket required');
const root=process.cwd(),prefix='/tmp/pd-controls-bf76';
// Exact unchanged deployed caller from the review's pre-controls base. Do not substitute the new caller.
writeFileSync(prefix+'-old-stripe.ts',execFileSync('git',['show','89ecf73965eccbf0f59e49401b69cf09a4e12579:src/lib/stripe.ts']));
writeFileSync(prefix+'-public.test.ts',readFileSync('supabase/tests/plan_controls_public.test.fixture'));
writeFileSync(prefix+'-empty.mjs','');
writeFileSync(prefix+'-public.config.mjs','export default '+JSON.stringify({root:'/tmp',cacheDir:prefix+'-cache',resolve:{alias:{'@':root+'/src','server-only':prefix+'-empty.mjs',stripe:resolve('node_modules/stripe/esm/stripe.esm.node.js'),vitest:resolve('node_modules/vitest/dist/index.js'),pg:resolve('node_modules/pg/lib/index.js')}},test:{include:['pd-controls-bf76-public.test.ts'],testTimeout:15000}}));
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--config',prefix+'-public.config.mjs','--configLoader','runner','--no-cache','--maxWorkers','1','--reporter','verbose'],{stdio:'inherit'});
process.exitCode=result.status??1;
