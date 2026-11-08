import Stripe from "stripe";
import {createClient} from "@supabase/supabase-js";
import {beforeEach,expect,it,vi} from "vitest";
import type {Database} from "@/lib/database";
const f=vi.hoisted(()=>({db:null as unknown,client:null as unknown}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase-auth",()=>({adminClient:()=>f.db}));
vi.mock("@/lib/stripe",async original=>({...await original<typeof import("@/lib/stripe")>(),stripe:()=>f.client}));
import {adjustedPlan,restartFamilyPlan} from "@/lib/plan-controls-server";
import {sweepPlanReads} from "@/lib/card-reconcile";
import {stripePlanProvider,supabasePlanReads,supabasePlanStore} from "@/lib/plan-state-server";
const card="11111111-1111-4111-8111-111111111111";
function fixture(){
 let price=99,generation=0,state="none",revision="",blocked=false,cancelled=false;
 const pauses: unknown[] = [];
 let loseCreate=false;
 const providerWrites:URLSearchParams[]=[],rpcs:{name:string;body:Record<string,unknown>}[]=[];
 const items={data:[{current_period_end:1_900_000_000,price:{unit_amount:7999}}]};
 const plans:Record<string,unknown>[]=[{id:"old",status:"canceled",customer:"cus",metadata:{},cancel_at_period_end:false,created:1,ended_at:1_700_000_000,items}];
 let planRow:Record<string,unknown>|null={kind:"ended",next_charge_at:null,ends_at:"2026-11-01T00:00:00Z",monthly_cents:null,ending_free:false,event_at:"2026-11-01T00:00:00Z",event_id:"evt_end"},takes=0,saveFails=false,subscriptionReads=0;
 const client=new Stripe("sk_test_restart_server",{maxNetworkRetries:0,httpClient:Stripe.createFetchHttpClient(async(input,init)=>{
  const u=new URL(String(input)),method=init?.method??"GET",body=new URLSearchParams(String(init?.body??""));
  if(method==="GET"&&u.pathname==="/v1/subscriptions"){subscriptionReads++;return Response.json({data:plans,has_more:false});}
  if(method==="GET"&&u.pathname.startsWith("/v1/products/"))return Response.json({id:"unica_math"});
  if(method==="GET"&&u.pathname==="/v1/customers/cus")return Response.json({id:"cus",invoice_settings:{default_payment_method:{id:"pm",type:"card"}}});
  if(method==="POST"&&u.pathname==="/v1/subscriptions"){providerWrites.push(body);if(loseCreate)throw Error('Synthetic lost response');const made={id:"new",status:"active",default_payment_method:"pm",trial_end:null,cancel_at_period_end:false,created:2,ended_at:null,items,metadata:{start_key:body.get("metadata[start_key]")}};plans.push(made);return Response.json(made);}
  throw Error('Unexpected provider request '+u.pathname);
 })});
 const db=createClient<Database>("https://synthetic.invalid","synthetic",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const u=new URL(String(input)),name=u.pathname.split('/').at(-1)!,body=JSON.parse(String(init?.body??'{}'));
  if(u.pathname.includes('/rpc/')){
   rpcs.push({name,body});
   if(name==='take_plan_read_order')return Response.json(++takes);
   if(name==='save_child_plan_state'){if(saveFails)return Response.json({message:'database down'},{status:500});planRow={kind:body.p_kind,event_at:body.p_event_at,event_id:body.p_event_id};return Response.json('stored');}
   if(name==='plan_control_context')return Response.json({revision,blocked,cancelled,pauses,child:'child'});
   if(name==='card_recovery_rows')return Response.json(generation?[{card_id:card,customer:'cus',session_id:null,payment_method_id:null,needs_repair:false,start_generation:generation,start_key:'key',start_card:'pm',start_at:new Date().toISOString(),start_state:state,start_subscription:state==='started'?'new':null,start_first_charge:null,start_finished_at:state==='started'?new Date().toISOString():null,start_email:'none',start_alert:null}]:[]);
   if(name==='admit_plan_start_terms'){generation=Number(body.p_generation);state='open';return Response.json({generation,key:body.p_key,card:'pm',at:new Date().toISOString(),state,purpose:'restart',monthly_cents:body.p_monthly_cents,subscription:null,first_charge:null,finished_at:null,email:'none',alert:null});}
   if(name==='finish_plan_start'){state='started';return Response.json(true);}
   if(name==='begin_family_card_operation'||name==='end_family_card_operation')return Response.json(null);
   if(name==='plan_start_terms')return Response.json({purpose:'restart',monthly_cents:7999});
   // The rule of due_plan_start_reads for this one family: a started start the ended row does not show yet.
   if(name==='due_plan_start_reads')return Response.json(state==='started'&&planRow&&['ended','not_started'].includes(String(planRow.kind))?[{child_id:'child',parent_id:'parent',customer:'cus',kind:planRow.kind,event_at:planRow.event_at}]:[]);
   if(name==='due_plan_reads')return Response.json([]);
   if(name==='note_plan_read_tried')return Response.json(null);
   throw Error('Unexpected RPC '+name);
  }
  if(name==='child_plan_states')return Response.json(planRow);
  if(name==='card_setups'&&u.searchParams.get('stripe_customer_id')==='eq.cus')return Response.json({parent_id:'parent',child_id:'child',stripe_customer_id:'cus',card_saved_at:'2026-10-01'});
  if(name==='card_setups')return Response.json(u.searchParams.get('parent_id')==='eq.parent'?{id:card,child_id:'child',stripe_customer_id:'cus',card_saved_at:'2026-10-01',price,plan:'one'}:null);
  throw Error('Unexpected database read '+u.pathname);
 }}});
 f.db=db;f.client=client;
 return {db,pauses,providerWrites,rpcs,plans,planState:()=>planRow,subscriptionReads:()=>subscriptionReads,failSave:()=>{saveFails=true;},saveWorks:()=>{saveFails=false;},loseCreate:()=>{loseCreate=true;},cancel:()=>{cancelled=true;},price:(p:number)=>{price=p;},revision:(r:string)=>{revision=r;},block:()=>{blocked=true;},end:()=>{plans[1].status='canceled';}};
}
beforeEach(()=>vi.restoreAllMocks());
it("reads the saved price and owner, starts without a trial and releases only the route hold",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);expect(q).toMatchObject({ok:true,state:'preview',price:79.99});
 if(!q.ok||!('token'in q))throw Error('missing quote');
 expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:true,state:'started'});
 expect(b.providerWrites[0].get('items[0][price_data][unit_amount]')).toBe('7999');expect(b.providerWrites[0].has('trial_period_days')).toBe(false);
 expect(b.rpcs.some(r=>r.name==='admit_plan_start_terms'&&r.body.p_purpose==='restart')).toBe(true);expect(b.rpcs.some(r=>r.name==='end_family_card_operation')).toBe(true);
 b.end();expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:false,error:'stale'});expect(b.providerWrites).toHaveLength(1);
});
it("a started restart writes the plan state at once, so access reopens with no webhook",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
 const before=Date.now();expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:true,state:'started',access:'open'});
 const saved=b.rpcs.filter(r=>r.name==='save_child_plan_state');expect(saved).toHaveLength(1);
 expect(saved[0].body).toMatchObject({p_customer:'cus',p_kind:'paying',p_event_id:`plan-start:${card}:1`});
 expect(b.planState()).toMatchObject({kind:'paying'});
 // Its take comes before the Stripe read that follows the create, and its time before the subscription existed.
 const names=b.rpcs.map(r=>r.name);expect(names.indexOf('take_plan_read_order')).toBeLessThan(names.indexOf('save_child_plan_state'));
 expect(Date.parse(String(saved[0].body.p_event_at))).toBeLessThanOrEqual(before);
 expect(b.rpcs.filter(r=>/email/.test(r.name))).toEqual([]);
});
it("a failed plan state write does not read as a failed restart",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
 vi.spyOn(console,'error').mockImplementation(()=>{});
 b.failSave();
 expect(await restartFamilyPlan('parent',card,q.token)).toEqual({ok:true,state:'started',price:79.99,access:'pending'});
 expect(b.providerWrites).toHaveLength(1);expect(b.rpcs.some(r=>r.name==='end_family_card_operation')).toBe(true);
 expect(b.planState()).toMatchObject({kind:'ended'});
});
it("a failed plan state write and a lost webhook: the next daily re-read reopens access (#713)",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
 vi.spyOn(console,'error').mockImplementation(()=>{});
 b.failSave();
 expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:true,state:'started',access:'pending'});
 expect(b.planState()).toMatchObject({kind:'ended'});
 b.saveWorks();
 const sweep=await sweepPlanReads(supabasePlanReads(b.db),{store:supabasePlanStore(b.db),provider:stripePlanProvider(f.client as Stripe)},{now:Date.now,startBy:Date.now()+60_000});
 expect(sweep).toMatchObject({due:1,read:1,changed:1,failed:0});
 const saved=b.rpcs.filter(r=>r.name==='save_child_plan_state').at(-1)!;
 // The row's own event time, a new event id, and the take before the Stripe read.
 expect(saved.body).toMatchObject({p_customer:'cus',p_kind:'paying',p_event_at:'2026-11-01T00:00:00Z'});
 expect(String(saved.body.p_event_id)).toMatch(/^plan-read:/);
 expect(b.planState()).toMatchObject({kind:'paying'});
 expect(b.providerWrites).toHaveLength(1);
});
it("a restart with no confirmed plan writes no plan state",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
 vi.spyOn(console,'error').mockImplementation(()=>{});
 b.loseCreate();
 expect(await restartFamilyPlan('parent',card,q.token)).toEqual({ok:false,error:'unconfirmed'});
 expect(b.rpcs.filter(r=>r.name==='take_plan_read_order'||r.name==='save_child_plan_state')).toEqual([]);
 expect(b.planState()).toMatchObject({kind:'ended'});
});
it("refuses foreign ownership, changed price, changed cancellation revision and pending controls before creating",async()=>{
 const b=fixture();expect(await restartFamilyPlan('foreign',card)).toMatchObject({ok:false,error:'not_found'});
 const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
 b.price(40);expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:false,error:'stale'});
 b.price(99);b.revision('cancelled');expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:false,error:'stale'});
 b.block();expect(await restartFamilyPlan('parent',card)).toMatchObject({ok:false,error:'pending'});expect(b.providerWrites).toHaveLength(0);
});

it("shows confirmed pause dates beside a stored plan, without moving a later renewal or a cancelled plan",async()=>{
 const b=fixture();
 b.pauses.push({state:"applied",quote:{weeks:2,year:2026,used:0,subscription:"sub",kind:"paid",previousCharge:"2026-12-01T18:00:00.000Z",chargeAt:"2026-12-15T18:00:00.000Z",bookId:"book",targetNumber:2,late:false,earliest:null,latest:null,shippedAt:"2026-11-01",deliveredAt:"2026-11-03",today:"2026-11-05"}});
 const plan={kind:"paying" as const,nextCharge:"2026-12-01T18:00:00.000Z",monthly:79.99};
 expect(await adjustedPlan(b.db,"parent",card,plan)).toMatchObject({nextCharge:"2026-12-15T18:00:00.000Z"});
 expect(await adjustedPlan(b.db,"parent",card,{...plan,nextCharge:"2027-01-15T18:00:00.000Z"})).toMatchObject({nextCharge:"2027-01-15T18:00:00.000Z"});
 b.cancel();expect(await adjustedPlan(b.db,"parent",card,plan)).toEqual({kind:"unknown"});
});
