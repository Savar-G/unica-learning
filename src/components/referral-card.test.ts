// @vitest-environment happy-dom
import { createElement, createRef, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { ReferralCard,type ReferralEntryHandle } from "@/components/referral-card";
import { keepReferralDraft } from "@/lib/referral-draft";
const overview={code:"U-OWNOWN1",shareUrl:"https://unica.test/start?referral=U-OWNOWN1",rewardsEarned:2,rewardsRemaining:1,pendingReferrals:3,appliedCode:null as string|null,canApply:true};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;keepReferralDraft("",localStorage);host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function render(result:unknown){vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json(result)));await act(async()=>root.render(createElement(ReferralCard)));}
it("shows accurate counts and a visible input label",async()=>{await render({ok:true,overview});expect(host.textContent).toContain("3 pending referrals. 2 rewards earned. 1 rewards remaining.");const input=host.querySelector("input")!;expect(host.querySelector(`label[for="${input.id}"]`)?.textContent).toBe("Referral code");});
it("shows no invented counts after a read failure",async()=>{await render({ok:false,error:"unavailable"});expect(host.textContent).toContain("could not confirm");expect(host.textContent).not.toContain("0 rewards");expect(host.querySelector("input")).toBeNull();});
it("retains an invalid code and stops card navigation until confirmation",async()=>{
 keepReferralDraft("U-TYPED11",localStorage);const ref=createRef<ReferralEntryHandle>();
 const fetch=vi.fn().mockResolvedValueOnce(Response.json({ok:true,overview})).mockResolvedValue(Response.json({ok:false,error:"invalid"}));vi.stubGlobal("fetch",fetch);
 await act(async()=>root.render(createElement(ReferralCard,{entryOnly:true,ref})));let confirmed=true;await act(async()=>{confirmed=await ref.current!.confirm();});expect(confirmed).toBe(false);expect(host.querySelector("input")!.value).toBe("U-TYPED11");expect(host.textContent).toContain("could not use this referral code");
});
it("does not overwrite a confirmed code with a new share draft",async()=>{
 keepReferralDraft("U-NEWNEW1",localStorage);await render({ok:true,overview:{...overview,appliedCode:"U-CONFIRM1",canApply:false}});expect(host.textContent).toContain("Referral code confirmed: U-CONFIRM1");expect(host.querySelector("input")).toBeNull();
});
it("reports copy failure and keeps a selectable code",async()=>{await render({ok:true,overview});Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw Error("Denied");}}});const button=[...host.querySelectorAll("button")].find(b=>b.textContent==="Copy code")!;await act(async()=>button.click());expect(host.textContent).toContain("We could not copy it");expect(host.textContent).toContain("U-OWNOWN1");});
