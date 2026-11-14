import { beforeEach, expect, it } from "vitest";
import { captureReferral, keepReferralDraft, referralDraft, type ReferralDraftStorage } from "@/lib/referral-draft";
import { redactUrlTokens } from "@/lib/url-tokens";
const storage=()=>{const m=new Map<string,string>();return{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);},removeItem:(k:string)=>{m.delete(k);}};};
beforeEach(()=>keepReferralDraft(""));
it("keeps the share code through signup and sign-in without replacing a manual draft",()=>{
 const s=storage();captureReferral("?referral=u-source1",s);expect(referralDraft(s)).toBe("U-SOURCE1");captureReferral("?referral=U-OTHER11",s);expect(referralDraft(s)).toBe("U-SOURCE1");
 keepReferralDraft("U-MANUAL1",s);captureReferral("?referral=U-OTHER11",s);expect(referralDraft(s)).toBe("U-MANUAL1");keepReferralDraft("",s);expect(referralDraft(s)).toBe("");
});
it("permits manual entry and removal when local storage is denied",()=>{
 const denied:ReferralDraftStorage={getItem(){throw Error("Denied");},setItem(){throw Error("Denied");},removeItem(){throw Error("Denied");}};
 captureReferral("?referral=U-SOURCE1",denied);expect(referralDraft(denied)).toBe("U-SOURCE1");keepReferralDraft("U-MANUAL1",denied);expect(referralDraft(denied)).toBe("U-MANUAL1");keepReferralDraft("",denied);expect(referralDraft(denied)).toBe("");
});
it("drops the referral query from analytics without changing the page or other tags",()=>{
 expect(redactUrlTokens("https://unica.test/start?referral=U-SOURCE1&utm_source=friend")).toBe("https://unica.test/start?utm_source=friend");
 expect(redactUrlTokens("https://unica.test/start?referral=U-SOURCE1")).toBe("https://unica.test/start");
});
