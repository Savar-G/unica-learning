// @vitest-environment happy-dom
import {act,createElement} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {CancelPlan,PlanControl} from "@/components/account-plan";
const f=vi.hoisted(()=>({refresh:vi.fn(),fetch:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:f.refresh})}));
let container:HTMLDivElement,root:Root;
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("fetch",f.fetch);container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
async function click(text:string){const button=[...container.querySelectorAll('button')].find(b=>b.textContent===text);if(!button)throw Error('Button missing: '+text);await act(async()=>button.click());}
const preview={ok:true,state:'preview',token:'a'.repeat(64),weeks:1,remaining:5,year:2026,charge:'December 15, 2026',earliest:'November 20, 2026',latest:'December 2, 2026',late:false,targetNumber:2};
it('shows server dates before confirmation and retains the exact token after an uncertain answer',async()=>{
 f.fetch.mockResolvedValueOnce(Response.json(preview)).mockResolvedValueOnce(Response.json({ok:false,error:'pending'},{status:409})).mockResolvedValueOnce(Response.json({...preview,state:'applied'}));
 await act(async()=>root.render(createElement(PlanControl,{cardId:'card',name:'Leah',mode:'pause'})));
 await click('Pause plan');expect(f.fetch).not.toHaveBeenCalled();await click('Review new dates');
 expect(container.textContent).toContain('Next charge: December 15, 2026.');expect(container.textContent).toContain('November 20, 2026 to December 2, 2026');expect(container.textContent).toContain('5 weeks remain in 2026');
 await click('Confirm pause');expect(container.querySelector('[role="alert"]')?.textContent).toContain('cannot confirm');expect(f.refresh).not.toHaveBeenCalled();
 await click('Confirm pause');expect(f.refresh).toHaveBeenCalledTimes(1);
 const calls=f.fetch.mock.calls.map(c=>JSON.parse(c[1].body));expect(calls.map(c=>c.action)).toEqual(['preview','confirm','confirm']);expect(calls[1].token).toBe(calls[2].token);
});
it('states the late cutoff without assigning dates to the later workbook',async()=>{
 f.fetch.mockResolvedValue(Response.json({...preview,late:true,targetNumber:3}));
 await act(async()=>root.render(createElement(PlanControl,{cardId:'card',name:'Leah',mode:'pause'})));await click('Pause plan');await click('Review new dates');
 expect(container.textContent).toContain('The next workbook keeps its mailing range.');expect(container.textContent).toContain('applies from workbook 3');
});
it('reviews immediate paid Restart and never adds a free month or delay',async()=>{
 f.fetch.mockResolvedValueOnce(Response.json({ok:true,state:'preview',price:49,token:'b'.repeat(64)})).mockResolvedValueOnce(Response.json({ok:true,state:'started',price:49}));
 await act(async()=>root.render(createElement(PlanControl,{cardId:'card',name:'Leah',mode:'restart'})));await click('Restart plan');await click('Review price');
 expect(container.textContent).toContain('We charge CAD 49.00 immediately');expect(container.textContent).toContain('There is no second free month.');
 await click('Confirm restart');expect(f.refresh).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('We will prepare');
});
it('keeps cancellation visibly unresolved for a pending command',async()=>{
 f.fetch.mockResolvedValue(Response.json({ok:false,error:'pending'},{status:409}));
 await act(async()=>root.render(createElement(CancelPlan,{cardId:'card',name:'Leah',consequence:'The plan ends.'})));await click('Cancel plan');await click('Yes, cancel plan');
 expect(f.refresh).not.toHaveBeenCalled();expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not confirm cancellation');
});
it('checks a pending pause after a reload without sending a new confirmation',async()=>{
 f.fetch.mockResolvedValue(Response.json({...preview,state:'applied'}));
 await act(async()=>root.render(createElement(PlanControl,{cardId:'card',name:'Leah',mode:'pause',pending:true})));
 await click('Check pause');expect(f.fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(f.fetch.mock.calls[0][1].body).action).toBe('preview');expect(f.refresh).toHaveBeenCalledTimes(1);
});
it('shows Update card after a confirmed payment refusal and asks for a new price review',async()=>{
 f.fetch.mockResolvedValueOnce(Response.json({ok:true,state:'preview',price:49,token:'b'.repeat(64)}))
  .mockResolvedValueOnce(Response.json({ok:false,error:'payment_refused'},{status:409}));
 await act(async()=>root.render(createElement(PlanControl,{cardId:'card',name:'Leah',mode:'restart'})));
 await click('Restart plan');await click('Review price');await click('Confirm restart');
 expect(container.querySelector('[role="alert"]')?.textContent).toContain('Your payment did not go through');
 expect([...container.querySelectorAll('button')].map(b=>b.textContent)).toContain('Update card');
 expect([...container.querySelectorAll('button')].map(b=>b.textContent)).toContain('Review price');
 expect(f.refresh).not.toHaveBeenCalled();
});
it('keeps the restart confirmation after the refresh turns the control into Pause',async()=>{
 f.fetch.mockResolvedValueOnce(Response.json({ok:true,state:'preview',price:49,token:'b'.repeat(64)})).mockResolvedValueOnce(Response.json({ok:true,state:'started',price:49}));
 await act(async()=>root.render(createElement(PlanControl,{cardId:'card',name:'Leah',mode:'restart'})));await click('Restart plan');await click('Review price');await click('Confirm restart');
 // The refreshed page reads the plan as paying and renders the same control in pause mode.
 await act(async()=>root.render(createElement(PlanControl,{cardId:'card',name:'Leah',mode:'pause'})));
 expect(container.querySelector('[role="status"]')?.textContent).toBe('The paid plan has restarted. We will prepare the next workbook from the current learning profile.');
 expect(container.textContent).not.toContain('The pause is saved.');
});
it('says the pause is saved after a confirmed pause',async()=>{
 f.fetch.mockResolvedValueOnce(Response.json(preview)).mockResolvedValueOnce(Response.json({...preview,state:'applied'}));
 await act(async()=>root.render(createElement(PlanControl,{cardId:'card',name:'Leah',mode:'pause'})));await click('Pause plan');await click('Review new dates');await click('Confirm pause');
 expect(container.querySelector('[role="status"]')?.textContent).toBe('The pause is saved. Your mailing and charge dates have changed.');
});
