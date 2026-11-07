import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { sampleBook } from "@/lib/workbook-sample-book";
import { commaNumbers, workbookTemplate } from "@/lib/workbook-template";
import type { DraftPage, WorkbookDraft } from "@/lib/workbook-render";

const sample = (number = 1) => sampleBook({level:"U16",workbookId:"55555555-5555-4555-8555-000000000002",childId:"22222222-2222-4222-8222-222222222222",child:"MILA",number}).draft;
const html = (p: DraftPage, book: WorkbookDraft) => workbookTemplate().page(p,{qr:"",qrUrl:""},book)!;
function parsed(value: string) {const el=new Window().document.createElement("div");el.innerHTML=value;return el;}

describe("stored workbook comment corrections", () => {
  it("uses the stored plan to fill the cover without changing names, questions, schedule or QR identities", () => {
    const book=sample(), before=structuredClone(book);
    const cover=book.pages.find(p=>p.content?.kind==="cover")!;
    const plan=book.pages.find(p=>p.content?.kind==="how-plan")!.content;
    if(plan?.kind!=="how-plan")throw new Error("missing plan");
    const root=parsed(html(cover,book));
    expect(root.querySelector('[data-measure="slot-made-for"]')?.textContent).toContain("Made for Mila");
    expect([...root.querySelectorAll(".cover-plan li")].map(x=>x.textContent)).toEqual([...new Set(plan.rows.map(x=>x.topic))].slice(0,3).map(commaNumbers));
    expect(book).toEqual(before);
    if(cover.content?.kind!=="cover")throw new Error("missing cover");
    cover.content.child="McKay";
    expect(parsed(html(cover,book)).querySelector('[data-measure="slot-made-for"]')?.textContent).toContain("McKay");
  });

  it("gives a usable scan path and first-book correction guidance while retaining the exact table and Maya line", () => {
    const first=sample(), second=sample(2);
    const page=first.pages.find(p=>p.content?.kind==="how-plan")!;
    const saved=structuredClone(page.content);
    const root=parsed(html(page,first));
    expect(root.textContent).toContain("select your child, then Scan pages.");
    expect(root.textContent).toContain("unicalearning.com/account");
    expect(root.textContent).toContain("Ask for help using Maya, the AI Teaching Assistant.");
    expect(root.textContent).not.toContain("previous workbook");
    const later=second.pages.find(p=>p.content?.kind==="how-plan")!;
    expect(parsed(html(later,second)).textContent).toContain("previous workbook");
    expect(page.content).toEqual(saved);
  });

  it.each(["752 × 8 = 6016. Answer: [6016]","50 × 680 = 34 000. Answer: [34000]"])("prints one answer and no empty explanation for %s", line => {
    const book=sample(), page=book.pages.find(p=>p.content?.kind==="day")!;
    if(page.content?.kind!=="day")throw new Error("missing day");
    page.content.blocks=[{slot:"reminder",items:[],lines:[line]}];page.questions=[];
    const saved=structuredClone(page);
    const root=parsed(html(page,book));
    expect(root.querySelectorAll(".blue")).toHaveLength(1);
    expect(root.querySelector(".wk")?.textContent).not.toContain("Answer:");
    expect(root.querySelector(".why")).toBeNull();
    expect(page).toEqual(saved);
    page.content.blocks[0].explain="Split the number into parts.";
    expect(parsed(html(page,book)).querySelector(".why")?.textContent).toContain("Split the number into parts.");
  });

  it("retains distinct answers and nonnumeric worked text", () => {
    const book=sample(), page=book.pages.find(p=>p.content?.kind==="day")!;
    if(page.content?.kind!=="day")throw new Error("missing day");
    page.content.blocks=[{slot:"reminder",items:[],lines:["3 + 2 = 5. Answer: [6]","The answer is [always]."]}];page.questions=[];
    const root=parsed(html(page,book));
    expect(root.querySelector(".wk")?.textContent).toContain("3 + 2 = 5. Answer: 6");
    expect(root.querySelector(".wk")?.textContent).toContain("The answer is always.");
  });
});
