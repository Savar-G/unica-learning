import { beforeEach,expect,it,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/lib/database";
import { memoryReferrals } from "@/lib/referrals-memory";
import type { ReferralInvoice,ReferralProvider,ReferralStore } from "@/lib/referrals";
const f=vi.hoisted(()=>({store:null as ReferralStore|null,provider:null as ReferralProvider|null}));
vi.mock("server-only",()=>({}));vi.mock("@/lib/referral-store",()=>({referralStore:()=>f.store}));vi.mock("@/lib/referral-stripe",()=>({stripeReferrals:()=>f.provider}));
import{preserveReferralBeforeDeletion}from"@/lib/referral-deletion";
beforeEach(()=>vi.stubEnv("STRIPE_REFERRAL_MODE","test"));
it("records a missed first payment before the source family can be removed",async()=>{
 const m=memoryReferrals(()=>1000);m.addFamily("source","U-SOURCE1",["a"]);m.addFamily("new","U-NEWNEW1",["c"]);f.store=m.store;
 await m.store.command({action:"apply",parent:"new",code:"U-SOURCE1"});
 const invoice:ReferralInvoice={id:"missed",customer:"cus-c",subscription:"sub-c",status:"paid",cents:5999,paidCents:3000,paidAt:2000,actualPayment:true,modeMatches:true,program:true,monthly:true,renewal:true,risk:"clear",couponIds:[],otherDiscount:false};
 f.provider={familyCustomers:async()=>["cus-c"],invoices:async()=>[invoice]} as unknown as ReferralProvider;
 await preserveReferralBeforeDeletion({} as SupabaseClient<Database>,"new",{} as Stripe);m.deleteFamily("new");
 expect(m.snapshot().rewards.filter(r=>r.parent==="source"&&r.kind==="earned")).toHaveLength(1);
});
it("fails closed on unreadable history before Auth removal is permitted",async()=>{
 const m=memoryReferrals();m.addFamily("source","U-SOURCE1",["a"]);m.addFamily("new","U-NEWNEW1",["c"]);f.store=m.store;await m.store.command({action:"apply",parent:"new",code:"U-SOURCE1"});
 f.provider={familyCustomers:async()=>["cus-c"],invoices:async()=>{throw Error("Provider history unreadable");}} as unknown as ReferralProvider;
 await expect(preserveReferralBeforeDeletion({} as SupabaseClient<Database>,"new",{} as Stripe)).rejects.toThrow("history unreadable");
});
