import Stripe from "stripe";
import {createClient} from "@supabase/supabase-js";
import {beforeEach,expect,it,vi} from "vitest";
import type {Database} from "@/lib/database";
const f=vi.hoisted(()=>({db:null as unknown,client:null as unknown}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/referral-server",()=>({liveReferralStarts:()=>undefined}));
vi.mock("@/lib/supabase-auth",()=>({adminClient:()=>f.db}));
vi.mock("@/lib/stripe",async original=>({...await original<typeof import("@/lib/stripe")>(),stripe:()=>f.client}));
import {checkCardRow} from "@/lib/card-reconcile";
import {supabaseCardRows} from "@/lib/card-reconcile-server";
import {endStuckPlanStart} from "@/lib/stripe";
import {adjustedPlan,restartFamilyPlan} from "@/lib/plan-controls-server";
import {sweepPlanReads} from "@/lib/card-reconcile";
import {stripePlanProvider,supabasePlanReads,supabasePlanStore} from "@/lib/plan-state-server";
const card="11111111-1111-4111-8111-111111111111";
function fixture(){
 let price=99,generation=0,state="none",revision="",blocked=false,cancelled=false;
 const pauses: unknown[] = [];
 const holds = new Set<string>();
 let loseCreate=false, failRead=false, startKey="", firstCharge: string | null = null;
 const providerWrites:URLSearchParams[]=[],rpcs:{name:string;body:Record<string,unknown>}[]=[];
 const items={data:[{current_period_end:1_900_000_000,price:{unit_amount:7999}}]};
 const plans:Record<string,unknown>[]=[{id:"old",status:"canceled",customer:"cus",metadata:{},cancel_at_period_end:false,created:1,ended_at:1_700_000_000,items}];
 let planRow:Record<string,unknown>|null={kind:"ended",next_charge_at:null,ends_at:"2026-11-01T00:00:00Z",monthly_cents:null,ending_free:false,event_at:"2026-11-01T00:00:00Z",event_id:"evt_end"},takes=0,saveFails=false,subscriptionReads=0;
 const client=new Stripe("sk_test_restart_server",{maxNetworkRetries:0,httpClient:Stripe.createFetchHttpClient(async(input,init)=>{
  const u=new URL(String(input)),method=init?.method??"GET",body=new URLSearchParams(String(init?.body??""));
  if(method==="GET"&&u.pathname==="/v1/subscriptions"){subscriptionReads++;if(failRead)throw Error("Synthetic read failure");return Response.json({data:plans,has_more:false});}
    if (u.pathname === "/v1/prices") return Response.json({data:[{id:"price_7999",active:true,currency:"cad",product:"unica_math",unit_amount:7999,recurring:{interval:"month",interval_count:1,usage_type:"licensed"}}],has_more:false});
  if(method==="GET"&&u.pathname.startsWith("/v1/products/"))return Response.json({id:"unica_math"});
  if(method==="GET"&&u.pathname==="/v1/customers/cus")return Response.json({id:"cus",invoice_settings:{default_payment_method:{id:"pm",type:"card"}}});
  if(method==="POST"&&u.pathname==="/v1/subscriptions"){providerWrites.push(body);if(loseCreate)throw Error('Synthetic lost response');const made={id:"new",status:"active",default_payment_method:"pm",trial_end:null,cancel_at_period_end:false,created:2,ended_at:null,items,metadata:{start_key:body.get("metadata[start_key]")}};plans.push(made);return Response.json(made);}
  throw Error('Unexpected provider request '+u.pathname);
 })});
 const db=createClient<Database>("https://synthetic.invalid","synthetic",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const u=new URL(String(input)),name=u.pathname.split('/').at(-1)!,body=JSON.parse(String(init?.body??'{}'));
  if(u.pathname.includes('/rpc/')){
   rpcs.push({name,body});
   if(name==='family_plan_price')return Response.json(Math.min(Number(body.p_agreed_cents),7999));
   if(name==='take_plan_read_order')return Response.json(++takes);
   if(name==='save_child_plan_state'){if(saveFails)return Response.json({message:'database down'},{status:500});planRow={kind:body.p_kind,event_at:body.p_event_at,event_id:body.p_event_id};return Response.json('stored');}
   if(name==='plan_control_context')return Response.json({revision,blocked,cancelled,pauses,child:'child'});
   if(name==='card_recovery_rows')return Response.json(generation?[{card_id:card,customer:'cus',session_id:null,payment_method_id:null,needs_repair:false,start_generation:generation,start_key:startKey,start_card:'pm',start_at:new Date().toISOString(),start_state:state,start_subscription:state==='started'?'new':null,start_first_charge:null,start_finished_at:state==='started'?new Date().toISOString():null,start_email:'none',start_alert:null}]:[]);
   if(name==='admit_family_plan_start'){generation=Number(body.p_generation);startKey=String(body.p_key);state='open';return Response.json({generation,key:body.p_key,card:'pm',at:new Date().toISOString(),state,family_terms:true,trial_end:null,purpose:'restart',monthly_cents:body.p_monthly_cents,subscription:null,first_charge:null,finished_at:null,email:'none',alert:null});}
   if(name==='finish_plan_start'){state='started';return Response.json(true);}
   if(name==='team_end_plan_start'){state='team_ended';return Response.json(true);}
   if(name==='begin_family_card_operation'){holds.add(String(body.token));return Response.json(null);}
   if(name==='end_family_card_operation'){holds.delete(String(body.token));return Response.json(null);}
   if(name==='family_plan_start_terms')return Response.json({family_terms:true,trial_end:null,purpose:'restart',monthly_cents:7999});
   // The rule of due_plan_start_reads for this one family: a started start the ended row does not show yet.
   if(name==='due_plan_start_reads')return Response.json(state==='started'&&planRow&&['ended','not_started'].includes(String(planRow.kind))?[{child_id:'child',parent_id:'parent',customer:'cus',kind:planRow.kind,event_at:planRow.event_at}]:[]);
   if(name==='due_plan_reads')return Response.json([]);
   if(name==='note_plan_read_tried'||name==='note_plan_start_read_tried')return Response.json(null);
   throw Error('Unexpected RPC '+name);
  }
  if(name==='plan_starts')return Response.json(firstCharge ? {first_charge_at:firstCharge} : null);
  if(name==='child_plan_states')return Response.json(planRow);
  if(name==='card_setups'&&u.searchParams.get('stripe_customer_id')==='eq.cus')return Response.json({parent_id:'parent',child_id:'child',stripe_customer_id:'cus',card_saved_at:'2026-10-01'});
  if(name==='card_setups')return Response.json(u.searchParams.get('parent_id')==='eq.parent'?{id:card,child_id:'child',stripe_customer_id:'cus',card_saved_at:'2026-10-01',price,plan:'one'}:null);
  throw Error('Unexpected database read '+u.pathname);
 }}});
 f.db=db;f.client=client;
 return {db,client,pauses,holds,providerWrites,rpcs,plans,firstCharge:(at:string)=>{firstCharge=at;},startState:()=>state, startKey:()=>startKey,planState:()=>planRow,subscriptionReads:()=>subscriptionReads,failSave:()=>{saveFails=true;},saveWorks:()=>{saveFails=false;},loseCreate:()=>{loseCreate=true;},failRead:()=>{failRead=true;},cancel:()=>{cancelled=true;},price:(p:number)=>{price=p;},revision:(r:string)=>{revision=r;},block:()=>{blocked=true;},end:()=>{plans[1].status='canceled';}};
}
beforeEach(()=>vi.restoreAllMocks());
it("reads the saved price and owner, starts without a trial and releases only the route hold",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);expect(q).toMatchObject({ok:true,state:'preview',price:79.99});
 if(!q.ok||!('token'in q))throw Error('missing quote');
 expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:true,state:'started'});
 expect(b.providerWrites[0].get('items[0][price]')).toBe('price_7999');expect(b.providerWrites[0].has('trial_period_days')).toBe(false);
 expect(b.rpcs.some(r=>r.name==='admit_family_plan_start'&&r.body.p_purpose==='restart')).toBe(true);expect(b.rpcs.some(r=>r.name==='end_family_card_operation')).toBe(true);
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
 // The start read's try time is noted before its Stripe read (#748 review).
 const order=b.rpcs.map(r=>r.name);expect(order).toContain('note_plan_start_read_tried');
 expect(order.indexOf('note_plan_start_read_tried')).toBeLessThan(order.lastIndexOf('take_plan_read_order'));
 expect(b.rpcs.find(r=>r.name==='note_plan_start_read_tried')!.body).toEqual({p_child:'child'});
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
 // An applied Cancel of a paid plan ends it at the period end, which a scheduled pause does not move: the schedule is released first.
 b.cancel();expect(await adjustedPlan(b.db,"parent",card,plan)).toEqual({kind:"ending",endsOn:"2026-12-01T18:00:00.000Z",free:false});
 expect(await adjustedPlan(b.db,"parent",card,{...plan,nextCharge:"2026-12-15T18:00:00.000Z"})).toEqual({kind:"ending",endsOn:"2026-12-01T18:00:00.000Z",free:false});
 b.block();expect(await adjustedPlan(b.db,"parent",card,plan)).toEqual({kind:"unknown"});
});

it("a paid plan cancelled after its pause began shows no date rather than a past one (#750 review)",async()=>{
 // The pause ran from previousCharge to chargeAt, both now past; after a paid resume the period ends later than the stored plan says.
 const day=86_400_000,iso=(t:number)=>new Date(t).toISOString(),start=Date.now()-20*day,end=Date.now()-6*day;
 const b=fixture();
 b.pauses.push({state:"applied",retired:true,quote:{weeks:2,year:2026,used:0,subscription:"sub",kind:"paid",previousCharge:iso(start),chargeAt:iso(end),bookId:"book",targetNumber:2,late:false,earliest:null,latest:null,shippedAt:"2026-11-01",deliveredAt:"2026-11-03",today:"2026-11-05"}});
 b.cancel();
 expect(await adjustedPlan(b.db,"parent",card,{kind:"paying",nextCharge:iso(end).replace(".000Z","+00:00"),monthly:79.99})).toEqual({kind:"unknown"});
 // A stored plan that already shows another renewal is not a paused one, and ends there.
 const later=iso(Date.now()+25*day);
 expect(await adjustedPlan(b.db,"parent",card,{kind:"paying",nextCharge:later,monthly:79.99})).toEqual({kind:"ending",endsOn:later,free:false});
});

const trialPause=(retired=false)=>({state:"applied",retired,quote:{weeks:2,year:2026,used:0,subscription:"sub",kind:"trial",previousCharge:"2026-12-08T20:42:20.000Z",chargeAt:"2026-12-22T20:42:20.000Z",bookId:"book",targetNumber:2,late:false,earliest:null,latest:null,shippedAt:"2026-11-01",deliveredAt:"2026-11-03",today:"2026-11-08"}});
const freeMonth={kind:"free_month" as const,firstCharge:"2026-12-08T20:42:20+00:00",monthly:79.99};
it("moves a stored first charge written in the database's form to the free-month pause's new date",async()=>{
 const b=fixture();b.pauses.push(trialPause());
 expect(await adjustedPlan(b.db,"parent",card,freeMonth)).toEqual({...freeMonth,firstCharge:"2026-12-22T20:42:20.000Z"});
 expect(await adjustedPlan(b.db,"parent",card,{...freeMonth,firstCharge:"2026-12-09T20:42:20+00:00"})).toEqual({...freeMonth,firstCharge:"2026-12-09T20:42:20+00:00"});
});
it("shows a free month cancelled after its pause as ending on the paused trial end",async()=>{
 // The applied Cancel retires the pause's mailing effect, but the trial end it moved in Stripe stays.
 const b=fixture();b.pauses.push(trialPause(true));b.cancel();
 expect(await adjustedPlan(b.db,"parent",card,freeMonth)).toEqual({kind:"ending",endsOn:"2026-12-22T20:42:20.000Z",free:true});
 const plain=fixture();plain.cancel();
 expect(await adjustedPlan(plain.db,"parent",card,freeMonth)).toEqual({kind:"ending",endsOn:"2026-12-08T20:42:20+00:00",free:true});
 plain.block();expect(await adjustedPlan(plain.db,"parent",card,freeMonth)).toEqual({kind:"unknown"});
});

it("releases the route hold when the provider read fails before admission",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
 b.failRead();await expect(restartFamilyPlan('parent',card,q.token)).rejects.toThrow();
 expect(b.rpcs.some(r=>r.name==='begin_family_card_operation')).toBe(true);
 expect(b.providerWrites).toHaveLength(0);expect(b.rpcs.some(r=>r.name==='admit_family_plan_start')).toBe(false);
 expect(b.holds.size).toBe(0);expect(b.startState()).toBe('none');
});
it("releases the route hold when creation is uncertain",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
 b.loseCreate();expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:false,error:'unconfirmed'});
 expect(b.rpcs.some(r=>r.name==='admit_family_plan_start')).toBe(true);
 // The open start record, not the route hold, keeps the family's deletion refused.
 expect(b.holds.size).toBe(0);expect(b.startState()).toBe('open');
});

for (const resolution of ["background", "team"] as const) {
 it(`releases the route hold before ${resolution} closes an uncertain start`,async()=>{
  const b=fixture();const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
  b.loseCreate();expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:false,error:'unconfirmed'});
  expect(b.holds.size).toBe(0);expect(b.startState()).toBe('open');
  const rows=supabaseCardRows(b.db);
  if(resolution==='background') {
   const row=await rows.cardRow(card);if(!row)throw Error('missing row');
   row.deletionQueued=true;
   const plan={id:'new',status:'active',defaultCard:'pm',startKey:b.startKey(),firstCharge:null};
   const result=await checkCardRow(row,{rows,stripe:{cardState:async()=>({gone:false,customerDefault:'pm',plans:[plan]}),setCustomerCard:async()=>{},setSubscriptionCard:async()=>{}},canWrite:()=>true,announcePlan:async()=>({status:'sent',emailId:'x'}),planEmailClaim:async()=> 'sent',alertTeam:async()=>({status:'sent',emailId:'x'})},Date.now()+120000);
   expect(result.plan).toBe('started');expect(b.startState()).toBe('started');
  } else {
   vi.spyOn(Date,'now').mockReturnValue(Date.now()+26*60*60*1000);
   expect(await endStuckPlanStart(b.client,{cardSetup:card,customer:'cus',generation:1,admin:'admin'},rows)).toEqual({ok:true});
   expect(b.startState()).toBe('team_ended');
  }
 });
}
it("clears a hold that an earlier request left behind",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
 b.holds.add(card);b.failRead();await expect(restartFamilyPlan('parent',card,q.token)).rejects.toThrow();
 expect(b.holds.size).toBe(0);
});

it("adds the durable first charge date to the Account tab's stored paid plan", async () => {
 const b=fixture();b.firstCharge("2026-12-13T18:00:00Z");
 expect(await adjustedPlan(b.db,"parent",card,{kind:"paying",nextCharge:"2027-01-13T18:00:00Z",monthly:59.99})).toMatchObject({monthly:59.99,firstCharge:"2026-12-13T18:00:00Z"});
});

it.each([
  [-86_400_000, false], [-600_000, false], [0, false], [120_000, false], [600_000, false], [600_001, true], [86_400_000, true],
])("uses a ten minute safety margin for a cancelled paid pause at offset %i", async (offset, future) => {
 const now=Date.parse("2026-11-09T00:00:00Z");
 const clock=vi.spyOn(Date,"now").mockReturnValue(now);
 try {
  const start=new Date(now+offset).toISOString(), end=new Date(now+offset+14*86_400_000).toISOString(), b=fixture();
  b.pauses.push({state:"applied",quote:{weeks:2,year:2026,used:0,subscription:"sub",kind:"paid",previousCharge:start,chargeAt:end,bookId:"book",targetNumber:2,late:false,earliest:null,latest:null,shippedAt:"2026-11-01",deliveredAt:"2026-11-03",today:"2026-11-05"}});
  b.cancel();
  expect(await adjustedPlan(b.db,"parent",card,{kind:"paying",nextCharge:end,monthly:79.99})).toEqual(future ? {kind:"ending",endsOn:start,free:false} : {kind:"unknown"});
 } finally { clock.mockRestore(); }
});

it("keeps a confirmed end from the provider plan", async () => {
 const b=fixture(); b.cancel();
 const ending={kind:"ending" as const,endsOn:"2026-11-09T00:01:00Z",free:false};
 const ended={kind:"ended" as const,endedOn:"2026-11-09T00:01:00Z"};
 expect(await adjustedPlan(b.db,"parent",card,ending)).toEqual(ending);
 expect(await adjustedPlan(b.db,"parent",card,ended)).toEqual(ended);
});
