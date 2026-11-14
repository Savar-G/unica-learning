// Public domain functions with the actual command SQL. No service or provider connection.
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { referralSqlFixture } from './referral-sql-fixture.mjs';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const bundle = await build({ entryPoints: ['src/lib/referrals.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const filename = process.cwd() + '/referral-sql-control.cjs';
const entry = new Module(filename);
entry.paths = Module._nodeModulePaths(process.cwd());
entry._compile(bundle.outputFiles[0].text, filename);
const { applyReferral, referralStarts, recordReferralInvoice, reconcileReferralInvoice } = entry.exports;
const p='00000000-0000-4000-8000-000000000001',q='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003';
const c='00000000-0000-4000-8000-000000000011',d='00000000-0000-4000-8000-000000000012',e='00000000-0000-4000-8000-000000000013';
async function fixture() {
 const db=await referralSqlFixture();
 await db.exec(`insert into auth.users values('${p}'),('${q}'),('${r}');
 insert into parents(id,email) values('${p}','p@referral.invalid'),('${q}','q@referral.invalid'),('${r}','r@referral.invalid');
 insert into children(id,parent_id) values('${c}','${p}'),('${d}','${q}'),('${e}','${r}');
 insert into card_setups(parent_id,child_id,stripe_customer_id) values('${p}','${c}','cus-p'),('${q}','${d}','cus-q'),('${r}','${e}','cus-r');
 insert into child_plan_states values('${c}','paying'),('${d}','paying'),('${e}','paying');`);
 const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const command=async cmd => (await rows('select public.referral_command($1::jsonb) as reply',[JSON.stringify(cmd)]))[0].reply;
 const store={command,async owner(customer){const [row]=await rows('select parent_id as parent,child_id as child,stripe_customer_id as customer from card_setups where stripe_customer_id=$1',[customer]);return row??null;},async customers(parent){await command({action:'overview',parent});return(await rows('select customer from referral_customers where account_id=(select id from referral_accounts where parent_id=$1)',[parent])).map(x=>x.customer);},async readOrder(){return Number((await rows('select public.referral_next_read() as n'))[0].n);}};
 const invoices=new Map();
 const provider={async invoices(customer){return[...invoices.values()].filter(x=>x.customer===customer);},async invoice(id){assert(invoices.has(id));return invoices.get(id);},async coupon(){return{id:'half',product:'unica_math'};},async apply(invoice){invoice.couponIds=['half'];},async enrolled(){return true;},async startAllowed(){return true;}};
 const services={store,provider};
 const add=(id,customer,over={})=>{const i={id,customer,subscription:'sub-'+customer,status:'draft',cents:7999,paidCents:0,paidAt:null,actualPayment:false,modeMatches:true,program:true,monthly:true,renewal:true,risk:'clear',couponIds:[],otherDiscount:false,...over};invoices.set(id,i);return i;};
 const code=async parent=>(await command({action:'overview',parent})).overview.code;
 const redeem=async(parent,source)=>assert.equal((await applyReferral(parent,await code(source),services,'https://local.invalid')).ok,true);
 const operations=()=>rows('select invoice,state,start_key from referral_operations order by created_at,id');
 return{db,rows,command,services,add,code,redeem,operations};
}
async function run(name,check){let f;try{f=await fixture();await check(f);console.log('PASS '+name);}catch(e){console.error('FAIL '+name+': '+e.message);process.exitCode=1;}finally{await f?.db.close();}}
await run('late zero replay after entitlement reuse still records the next payment',async f=>{
 await f.redeem(q,p);
 await referralStarts(f.services).reserve({card:'card-q',customer:'cus-q',key:'original-start',cents:7999});
 const zero=f.add('zero','cus-q',{status:'paid',renewal:false,startKey:'original-start',couponIds:['half']});
 await recordReferralInvoice(zero,f.services);await recordReferralInvoice(zero,f.services);
 const next=f.add('next','cus-q',{startKey:'original-start'});await reconcileReferralInvoice(next.id,f.services);
 await recordReferralInvoice(zero,f.services);
 Object.assign(next,{status:'paid',paidCents:3999,paidAt:Date.now()+1000,actualPayment:true});await reconcileReferralInvoice(next.id,f.services);
 assert.deepEqual((await f.operations()).map(o=>[o.invoice,o.state]),[['zero','absent'],['next','used']]);
 assert.equal(Number((await f.rows("select count(*) n from referral_rewards where kind='earned'"))[0].n),1);
 assert.equal((await f.rows('select first_invoice from referral_accounts where parent_id=$1',[q]))[0].first_invoice,'next');
});
await run('retained creation key cannot strand a later full-price renewal',async f=>{
 await f.redeem(q,p);
 await referralStarts(f.services).reserve({card:'card-q',customer:'cus-q',key:'original-start',cents:7999});
 const initial=f.add('initial','cus-q',{status:'paid',renewal:false,startKey:'original-start',couponIds:['half'],paidCents:3999,paidAt:Date.now()+1000,actualPayment:true});await recordReferralInvoice(initial,f.services);
 await f.redeem(r,q);await recordReferralInvoice(f.add('qualifying','cus-r',{status:'paid',paidCents:7999,paidAt:Date.now()+2000,actualPayment:true}),f.services);
 const renewal=f.add('race','cus-q',{startKey:'original-start'});const apply=f.services.provider.apply;f.services.provider.apply=async()=>{throw Error('Invoice finalized before write');};
 await assert.rejects(reconcileReferralInvoice(renewal.id,f.services),/finalized/);
 Object.assign(renewal,{status:'paid',paidCents:7999,paidAt:Date.now()+3000,actualPayment:true});await reconcileReferralInvoice(renewal.id,f.services);
 assert.deepEqual((await f.operations()).map(o=>[o.invoice,o.state]),[['initial','used'],['race','absent']]);
 assert.equal(Number((await f.rows('select count(*) n from family_card_operations'))[0].n),0);
 f.services.provider.apply=apply;await reconcileReferralInvoice(f.add('later','cus-q',{startKey:'original-start'}).id,f.services);
 assert.equal((await f.operations()).find(o=>o.invoice==='later').state,'applied');
});
await run('email queue filters deleted and deleting owners before its limit',async f=>{
 await f.db.exec(`do $$ declare owner uuid; a uuid; n integer; begin
 for n in 1..60 loop
 owner:=gen_random_uuid();insert into auth.users values(owner);insert into parents(id,email) values(owner,'old@referral.invalid');a:=public.referral_account(owner);
 insert into referral_rewards(account_id,source_id,kind) values(a,a,'earned');
 if n<=20 then delete from parents where id=owner;
 elsif n<=40 then update parents set deletion_requested_at=now() where id=owner;
 else insert into family_deletions values(owner);end if;
 end loop; end $$;`);
 await f.command({action:'overview',parent:p});
 await f.db.query("insert into referral_rewards(account_id,source_id,kind) select id,id,'earned' from referral_accounts where parent_id=$1",[p]);
 for(let n=0;n<2;n++){
  const due=await f.command({action:'due',operation:'email',limit:20});assert.equal(due.due.emails.length,1);assert.equal(due.due.emails[0].parent,p);
 }
});
