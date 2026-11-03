import { describe, expect, it } from "vitest";
import { buildQuestion } from "@/lib/workbook-generator-items";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { scheduledItemProblem } from "@/lib/workbook-feedback-check";
import { rangeProblem } from "@/lib/workbook-book";
import { checkQuestionPackage, coinGiven, packageItem, operationResult, workedSteps, type CoinGiven, type Item, type Operation, type QuestionPackage } from "@/lib/question-package";

const bc = curriculumFor("bc")!;
const workbookId = "11111111-1111-4111-8111-111111111111";
const num = (value: number) => ({type:"number" as const,value});
function arithmetic(level: number, skill: string, operands: [number,number]): QuestionPackage {
  const operation: Operation={kind:"add",operands};
  const easier: Operation={kind:"add",operands:[1,2]};
  return {id:"schedule",ref:{source:"workbook",workbookId,page:3,question:1},templateId:null,
    text:`${operands[0]} + ${operands[1]} = ?`,operation,level,difficulty:1,
    skill:{standard:bc.skill(skill)!.unit,skills:[skill]},steps:workedSteps(operation),
    answer:{value:operationResult(operation),accepted:[],unit:null},
    wrongAnswers:[{value:num(0),cause:"careless",description:"A different answer",step:null}],
    easierExample:{text:"1 + 2 = ?",operation:easier,answer:operationResult(easier),steps:workedSteps(easier)}};
}
function built(format: string, over: Record<string,unknown> = {}, skill="1.1-compare-order-20", level=4): QuestionPackage {
  const result=buildQuestion({slot:"1.1",skill,difficulty:1,text:"Compare 19 and 20.",format,
    operation:null,wrongAnswers:[],easier:null,shownWrong:null,figure:null,numbers:[num(19),num(20)],
    places:null,direction:null,sequence:null,pattern:null,relation:null,figureShows:null,...over},
  {id:"schedule",workbookId,page:3,question:1,level,skills:[skill]});
  expect(result.check).toEqual({status:"checked"});
  expect(checkQuestionPackage(result.package).status).toBe("checked");
  return result.package!;
}
function moneyItem(text: string, givens?: CoinGiven[]): QuestionPackage {
  return {...built("compare",{text:"Compare 5 and 6.",numbers:[num(5),num(6)]},"1.11-coin-values",6),text,
    item:{format:"written-reason",scorable:false,parentChecked:true,error:null,regions:[{id:"reason",kind:"lines",label:"How do you know?"}],checks:[],givens}};
}
function moneySum(a: number, b: number): QuestionPackage {
  const quantity=(value:number)=>({type:"quantity" as const,value,unit:"¢" as const});
  const operation:Operation={kind:"quantity-add",operands:[quantity(a),quantity(b)]};
  const easier:Operation={kind:"quantity-add",operands:[quantity(1),quantity(1)]};
  return {...arithmetic(6,"1.11-count-one-coin-type",[a,b]),text:`Ava has ${a}¢. Ava gets ${b}¢ more. How much money?`,operation,
    answer:{value:operationResult(operation),accepted:[],unit:null},steps:workedSteps(operation),
    easierExample:{text:"1¢ + 1¢ = ?",operation:easier,answer:operationResult(easier),steps:workedSteps(easier)}};
}

describe("the daily bound for every readable item format", () => {
  it.each([
    [4,"1.1-count-to-20",[7,8],8],
    [14,"4.4-add-within-10000",[4000,5000],4000],
  ] as const)("rejects an oversized U%s addition on Day 1 and accepts it on Day 10",(level,skill,operands,max)=>{
    const p=arithmetic(level,skill,[...operands]);
    expect(checkQuestionPackage(p).status).toBe("checked");
    expect(scheduledItemProblem(p,bc,1,"practice")).toBe(`Day 1 uses numbers up to ${max}.`);
    expect(scheduledItemProblem(p,bc,10,"practice")).toBeNull();
  });
  it.each(["compare","order","places","sequence"])("checks a %s item with no operation",format=>{
    const p=built(format,format==="order"?{text:"Write the numbers in order, least first.",direction:"up"}
      :format==="places"?{text:"Write the tens and ones.",numbers:[num(19)]}
        :format==="sequence"?{text:"Fill in the missing numbers.",numbers:[],sequence:{start:num(6),step:num(1),terms:4,blanks:[3]}}:{});
    expect(p.operation).toBeNull();
    expect(scheduledItemProblem(p,bc,1,"practice")).toMatch(/up to 8/);
    expect(scheduledItemProblem(p,bc,10,"practice")).toBeNull();
  });
  it("checks picture counts and the count in an unscored colouring item",()=>{
    const p=built("count",{text:"How many?",figure:"ten-frame",numbers:[num(9)]},"1.1-count-objects-20");
    expect(scheduledItemProblem(p,bc,1,"practice")).toMatch(/up to 8/);
    expect(scheduledItemProblem(p,bc,3,"practice")).toBeNull();
    const item: Item={format:"colour-or-shade",scorable:false,parentChecked:true,error:null,
      regions:[{id:"colour",kind:"picture",label:null}],checks:[],figure:{kind:"ten-frame",counters:[9]}};
    const unscored={...p,text:"Colour the spaces.",answer:null,item};
    expect(checkQuestionPackage(unscored).status).toBe("unsupported");
    expect(scheduledItemProblem(unscored,bc,1,"practice")).toMatch(/up to 8/);
  });
  it("keeps a taught benchmark reference without exempting the compared number",()=>{
    const relation=(n:number,skill="1.2-benchmarks-10-20")=>built("relation",{text:"",numbers:[num(n)],relation:{kind:"closer",to:[0,20],labels:[]}},skill);
    expect(scheduledItemProblem(relation(3),bc,1,"practice")).toBeNull();
    expect(scheduledItemProblem(relation(19),bc,1,"practice")).toMatch(/up to 8/);
    expect(scheduledItemProblem(relation(20),bc,1,"practice")).toMatch(/up to 8/);
    expect(scheduledItemProblem(relation(3,"1.1-compare-order-20"),bc,1,"practice")).toMatch(/up to 8/);
  });
  it("accepts actual fraction denominators without exempting other quantities",()=>{
    const fractions=(denominator:number)=>built("compare",{text:`Compare 1/${denominator} and 2/${denominator}.`,
      numbers:[{type:"fraction",numerator:1,denominator},{type:"fraction",numerator:2,denominator}]},"4.3-same-denominator",14);
    expect(scheduledItemProblem(fractions(100),bc,1,"practice")).toBeNull();
    expect(scheduledItemProblem(fractions(9000),bc,1,"practice")).toMatch(/up to 4000/);
  });
  it("exempts a real coin denomination only on its money skill",()=>{
    const coins=moneyItem("A dime is 10¢. A quarter is 25¢. Describe the coins.",[
      coinGiven("dime",{kind:"text",index:0}),coinGiven("quarter",{kind:"text",index:1})]);
    expect(checkQuestionPackage(coins).status).toBe("not-checked");
    expect(scheduledItemProblem(coins,bc,1,"practice")).toBeNull();
    expect(scheduledItemProblem({...coins,skill:{standard:"1.1",skills:["1.1-compare-order-20"]}},bc,1,"practice")).not.toBeNull();
    const oversized=arithmetic(6,"1.11-count-one-coin-type",[7,8]);
    expect(scheduledItemProblem(oversized,bc,1,"practice")).toMatch(/up to 8/);
  });
  it.each([[10,0],[11,0],[20,5],[5,5]])("bounds the checked money sum %s¢ + %s¢ even at a coin denomination",(a,b)=>{
    const p=moneySum(a,b);
    expect(checkQuestionPackage(p).status).toBe("checked");
    if(a+b>20) expect(rangeProblem(p,bc,6)).toMatch(/at most 20/);
    else expect(rangeProblem(p,bc,6)).toBeNull();
    expect(scheduledItemProblem(p,bc,1,"practice")).toBe("Day 1 uses numbers up to 8.");
    // No amount appears in this text. The typed operands and computed total must still be checked.
    expect(scheduledItemProblem({...p,text:"How much money?"},bc,1,"practice")).toMatch(/up to 8/);
    // A named given with the same denomination cannot exempt the computed total.
    const withGivens={...p,text:"A dime is 10¢. A quarter is 25¢. How much money?",item:{...packageItem(p),givens:[
      coinGiven("dime",{kind:"text",index:0}),coinGiven("quarter",{kind:"text",index:1})]}};
    expect(checkQuestionPackage(withGivens).status).toBe("checked");
    expect(scheduledItemProblem(withGivens,bc,1,"practice")).toMatch(/up to 8/);
  });
  it("bounds a computed 25¢ total when the typed operands are both below the daily limit",()=>{
    const operation:Operation={kind:"quantity-add",operands:[{type:"quantity",value:.1,unit:"$"},{type:"quantity",value:.15,unit:"$"}],unit:"¢"};
    const p:QuestionPackage={...moneySum(10,0),text:"How much money?",operation,steps:workedSteps(operation),
      answer:{value:operationResult(operation),accepted:[],unit:"¢"}};
    expect(checkQuestionPackage(p).status).toBe("checked");
    expect(rangeProblem(p,bc,6)).toMatch(/at most 20/);
    expect(p.answer?.value).toEqual({type:"quantity",value:25,unit:"¢"});
    expect(scheduledItemProblem(p,bc,1,"practice")).toMatch(/up to 8/);
  });
  it("bounds each amount in an unscored story without exempting matching denominations",()=>{
    for(const amount of [9,10,25]) {
      const p=moneyItem(`A dime is 10¢. Ava has ${amount}¢. Can Ava buy a 5¢ sticker? Explain.`,[coinGiven("dime",{kind:"text",index:0})]);
      expect(checkQuestionPackage(p).status).toBe("not-checked");
      if(amount>20) expect(rangeProblem(p,bc,6)).toMatch(/at most 20/);
      else expect(rangeProblem(p,bc,6)).toBeNull();
      expect(scheduledItemProblem(p,bc,1,"practice")).toMatch(/up to 8/);
    }
    expect(scheduledItemProblem(moneyItem("Ava has 6¢. Can Ava buy a 5¢ sticker? Explain."),bc,1,"practice")).toBeNull();
    expect(scheduledItemProblem(moneySum(10,0),bc,10,"practice")).toBeNull();
  });
  it("requires a typed coin given instead of inferring a reference from the wording",()=>{
    expect(scheduledItemProblem(moneyItem("Circle the 25¢ coin.",[coinGiven("quarter",{kind:"text",index:0})]),bc,1,"practice")).toBeNull();
    expect(scheduledItemProblem(moneyItem("Circle the 25¢ coin."),bc,1,"practice")).toMatch(/up to 8/);
    expect(scheduledItemProblem(moneyItem("Describe 25¢ and 5¢ coins."),bc,1,"practice")).toMatch(/up to 8/);
  });
  it("fails closed for unknown formats, unknown data and absent skills",()=>{
    const p=built("compare");
    const unknown=structuredClone(p);
    unknown.item!.format="unreadable" as Item["format"];
    expect(scheduledItemProblem(unknown,bc,1,"practice")).toMatch(/cannot read/);
    const figure=structuredClone(p);
    figure.item!.figure={kind:"unreadable"} as unknown as Item["figure"];
    expect(scheduledItemProblem(figure,bc,1,"practice")).toMatch(/cannot read/);
    expect(scheduledItemProblem({...p,skill:{standard:"1.1",skills:[]}},bc,1,"practice")).not.toBeNull();
    const unreadable=arithmetic(14,"4.4-add-within-10000",[3,5]);
    unreadable.operation={kind:"evaluate",operands:["9 ^ 9"]};
    unreadable.text="Colour the graph.";
    unreadable.item={format:"colour-or-shade",scorable:false,parentChecked:true,error:null,checks:[],regions:[{id:"picture",kind:"picture",label:null}]};
    expect(checkQuestionPackage(unreadable).status).toBe("unsupported");
    expect(scheduledItemProblem(unreadable,bc,1,"practice")).toMatch(/cannot read/);
    for (const text of ["Compare nineteen and twenty.","Compare /12 and 3."])
      expect(scheduledItemProblem({...p,text},bc,1,"practice")).toMatch(/cannot read/);
  });
});
