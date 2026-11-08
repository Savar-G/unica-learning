import { describe, expect, it } from "vitest";
import { buildQuestion } from "@/lib/workbook-generator-items";
import { checkQuestionPackage, coinGiven, type CoinGiven, type CoinName, type QuestionPackage } from "@/lib/question-package";
import { scheduledItemProblem } from "@/lib/workbook-feedback-check";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { rangeProblem } from "@/lib/workbook-book";

const bc=curriculumFor("bc")!;
const place={id:"coin-given",workbookId:"11111111-1111-4111-8111-111111111111",page:3,question:1,level:6,skills:["1.11-coin-values"]};
const raw=(text:string)=>({slot:"1.1",skill:"1.11-coin-values",difficulty:1,text,format:"written-reason",operation:null,
  wrongAnswers:[],easier:null,shownWrong:null,figure:null});

function build(text:string,givens?:readonly CoinGiven[]):QuestionPackage {
  const result=buildQuestion(raw(text),{...place,givens});
  expect(result.check.status).toBe("not-checked");
  expect(checkQuestionPackage(result.package).status).toBe("not-checked");
  return result.package!;
}

describe("code-declared coin givens",()=>{
  it.each([
    ["How many nickels make a dime (10¢)? Explain.","dime"],
    ["A dime (10¢) is shown. Describe the coin.","dime"],
    ["A dime equals 10¢. Describe the coin.","dime"],
    ["Look at the 10¢ coins. Describe the coins.","dime"],
    ["25¢ coins. Describe the coins.","quarter"],
  ] as const)("accepts the declared given in %s and bounds the same text without it",(text,coin)=>{
    const p=build(text,[coinGiven(coin,{kind:"text",index:0})]);
    expect(rangeProblem(p,bc,6)).toBeNull();
    expect(scheduledItemProblem(p,bc,1,"practice")).toBeNull();
    const without={...p,item:{...p.item!,givens:undefined}};
    expect(checkQuestionPackage(without).status).toBe("not-checked");
    expect(scheduledItemProblem(without,bc,1,"practice")).toBe("Day 1 uses numbers up to 8.");
  });

  it("accepts declared values in a list of named coins",()=>{
    const p=build("Dime: 10¢. Quarter: 25¢. Describe the coins.",[
      coinGiven("dime",{kind:"text",index:0}),coinGiven("quarter",{kind:"text",index:1})]);
    expect(scheduledItemProblem(p,bc,1,"practice")).toBeNull();
  });

  it("accepts a declared plural region label without inferring its role from the label",()=>{
    const base=build("Describe these coins.");
    const p:QuestionPackage={...base,item:{...base.item!,regions:[{id:"reason",kind:"lines",label:"25¢ coins"}],
      givens:[coinGiven("quarter",{kind:"region-label",region:"reason",index:0})]}};
    expect(checkQuestionPackage(p).status).toBe("not-checked");
    expect(scheduledItemProblem(p,bc,1,"practice")).toBeNull();
    expect(scheduledItemProblem({...p,item:{...p.item!,givens:undefined}},bc,1,"practice")).toMatch(/up to 8/);
  });

  it("ignores givens supplied in AI output and copies the declarations supplied by code",()=>{
    const text="How many nickels make a dime (10¢)? Explain.";
    const given=coinGiven("dime",{kind:"text",index:0});
    const untrusted=buildQuestion({...raw(text),givens:[given],item:{givens:[given]}},place);
    expect(untrusted.package?.item?.givens).toBeUndefined();
    expect(scheduledItemProblem(untrusted.package!,bc,1,"practice")).toMatch(/up to 8/);
    const trusted=build(text,[given]);
    given.source.index=99;
    expect(trusted.item?.givens?.[0].source.index).toBe(0);
    expect(scheduledItemProblem(trusted,bc,1,"practice")).toBeNull();
  });

  it("does not exempt a second amount with the same value or an unrelated count",()=>{
    const p=build("A dime (10¢) is shown. Ava has 10¢. Explain.",[coinGiven("dime",{kind:"text",index:0})]);
    expect(scheduledItemProblem(p,bc,1,"practice")).toMatch(/up to 8/);
    const count=build("A dime (10¢) is shown beside 10 stickers. Explain.",[coinGiven("dime",{kind:"text",index:0})]);
    expect(scheduledItemProblem(count,bc,1,"practice")).toMatch(/up to 8/);
  });

  const dime=coinGiven("dime",{kind:"text",index:0});
  it.each([
    null,
    [{...dime,kind:"amount"}],
    [{...dime,coin:"unknown"}],
    [{...dime,value:25}],
    [{...dime,unit:"$"}],
    [{...dime,source:{kind:"operand",index:0}}],
    [{...dime,source:{kind:"answer",index:0}}],
    [{...dime,source:{kind:"text",index:-1}}],
    [{...dime,source:{kind:"text",index:99}}],
    [{...dime,source:{kind:"text",index:.5}}],
    [{...dime,source:{kind:"region-label",region:"absent",index:0}}],
    [dime,dime],
    [coinGiven("quarter",{kind:"text",index:0})],
  ].map(givens=>({givens})))("fails closed for an invalid declaration %j",({givens})=>{
    const base=build("A dime (10¢) is shown. Describe it.");
    const p={...base,item:{...base.item!,givens:givens as CoinGiven[]}};
    expect(checkQuestionPackage(p).status).toBe("failed");
    expect(rangeProblem(p,bc,6)).not.toBeNull();
    expect(scheduledItemProblem(p,bc,1,"practice")).not.toBeNull();
  });

  it("checks currency and refuses a future or unknown coin",()=>{
    const base=build("A dime ($10) is shown. Describe it.");
    const p={...base,item:{...base.item!,givens:[dime]}};
    expect(checkQuestionPackage(p).status).toBe("failed");
    expect(scheduledItemProblem(p,bc,1,"practice")).not.toBeNull();
    expect(()=>coinGiven("unknown" as CoinName,{kind:"text",index:0})).toThrow();
  });
});
