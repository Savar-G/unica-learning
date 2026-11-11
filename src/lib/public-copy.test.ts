import { describe, expect, it } from "vitest";
import { FAQ } from "@/lib/faq";
import { llmsTxt, pricingMarkdown } from "@/lib/ai-summary";
import { SITE_DESCRIPTION } from "@/lib/metadata";
import { homeJsonLd } from "@/lib/structured-data";
import { PARENT_LEAD, PARENT_NOT_YOURS, PARENT_NOTE, PARENT_TITLE, PARENT_YOURS } from "@/lib/parent";
import { renderToStaticMarkup } from "react-dom/server";
import Terms from "@/app/(site)/terms/page";
import Privacy from "@/app/(site)/privacy/page";

// Public launch (#82): the free assessment is online, math only, and comes before any plan or card. These are the
// shared texts behind the FAQ section, /llms.txt, /pricing.md and the page metadata.

const answer = (question: RegExp) => {
  const item = FAQ.find((f) => question.test(f.question));
  if (!item) throw new Error(`No FAQ question matches ${question}`);
  return item.answer;
};

describe("the FAQ describes the online math assessment", () => {
  it("states the sibling price and what each child receives", () => {
    const a = answer(/sibling discount/);
    expect(a).toMatch(/first child is CAD 79\.99 a month/);
    expect(a).toMatch(/additional child is CAD 59\.99 a month/);
    expect(a).toMatch(/own assessment/);
    expect(a).toMatch(/own progress report/);
  });

  it("describes Maya chat and its limits on the public FAQ and summaries", () => {
    const how = answer(/How does the AI Teaching Assistant work/);
    expect(how).toMatch(/Grade 3 and up/);
    expect(how).toMatch(/type to Maya/);
    expect(how).toMatch(/cannot teach a question yet/);
    expect(how).toMatch(/60 messages a day/);
    expect(how).toMatch(/Weekly limits/);
    for (const text of [how, answer(/screen time/), llmsTxt(), pricingMarkdown(), PARENT_NOTE]) {
      expect(text).toMatch(/Grade 3 and up/);
      expect(text).not.toMatch(/voice call|talk with the Teaching Assistant/i);
    }
  });

  it("answers the AI accuracy question beside the Teaching Assistant explanation", () => {
    const how = FAQ.findIndex((item) => /How does the AI Teaching Assistant work\?/.test(item.question));
    const accuracy = FAQ.findIndex((item) => /What if the AI Teaching Assistant gets something wrong\?/.test(item.question));
    expect(accuracy).toBe(how + 1);
    const a = FAQ[accuracy].answer;
    expect(a).toMatch(/answer key/);
    expect(a).toMatch(/common wrong-answer patterns/);
    expect(a).toMatch(/AI can still make a mistake/);
    expect(a).toMatch(/After the page is marked.*worked solution/);
    expect(a).toMatch(/send us the page and question.*investigate/);
  });

  it("says how the assessment works: online, on a laptop or tablet, math, then the report", () => {
    const a = answer(/free assessment work/);
    expect(a).toMatch(/online/);
    expect(a).toMatch(/laptop or tablet/);
    expect(a).toMatch(/math/);
    expect(a).toMatch(/report/);
    expect(a).not.toMatch(/on paper|photo/);
  });

  it("says no card is needed for the assessment, and the card comes after the report", () => {
    const a = answer(/card/);
    expect(a).toMatch(/You do not need a card for the assessment\./);
    expect(a).toMatch(/After the report, BC-curriculum families can choose a plan and add a card\./);
    expect(a).toMatch(/Other curricula can join the workbook waitlist without a card\./);
    expect(a).toMatch(/first workbook arrives at your home/);
    expect(a).not.toMatch(/when you sign up/);
  });

  it("separates the Canada-wide assessment from current BC plan availability", () => {
    const a = answer(/curriculum/);
    expect(a).toMatch(/Workbooks follow the British Columbia curriculum today\./);
    expect(a).toMatch(/free assessment is available across Canada/);
    expect(a).toMatch(/Other curricula can join the workbook waitlist/);
    expect(a).toMatch(/province-specific curriculum alignment/);
    expect(answer(/Where do you deliver/)).toMatch(/deliver workbooks across Canada/);
  });

  it("separates the online assessment from daily practice on paper", () => {
    const a = answer(/screen time/);
    expect(a).toMatch(/Daily workbook practice is on paper\./);
    expect(a).toMatch(/The free math assessment is online, on a laptop or tablet\./);
  });

  it("never claims the assessment measures reading", () => {
    for (const { answer: a } of FAQ) expect(a).not.toMatch(/assess\w* (math and )?reading|reading (level|assessment|result)/i);
  });
});

describe("the plain-text summaries for AI assistants", () => {
  it("/llms.txt: the online math assessment comes first, with its start page", () => {
    const text = llmsTxt();
    expect(text).toMatch(/free online math assessment/);
    expect(text).toMatch(/\/start\)/);
    expect(text).toMatch(/Assess: your child takes the free math assessment online, on a laptop or tablet\./);
    expect(text).not.toMatch(/assessment on paper|card at signup/);
    expect(text).toMatch(/BC-curriculum families can choose a plan after the report/);
    expect(text).toMatch(/Other curricula can join the workbook waitlist without a card/);
  });

  it("/pricing.md: no card at signup; plan and card after the report", () => {
    const text = pricingMarkdown();
    expect(text).not.toMatch(/at signup/);
    expect(text).toMatch(/after the report/i);
    expect(text).toMatch(/Every family in Canada can take the free online math assessment\./);
    expect(text).toMatch(/After the report, BC-curriculum families can choose the plan and add a card\./);
    expect(text).toMatch(/Other curricula can join the workbook waitlist without a card/);
  });
});

describe("a space follows every full stop and colon in public copy", () => {
  // A word, then "." or ":", then a letter: "Canada.The", "for you:scan". Web and email addresses are removed first.
  const glued = /[a-z][.:][A-Za-z]/;
  const words = (text: string) => text.replace(/https?:\/\/\S+/g, " ").replace(/\S+@\S+/g, " ");

  it("in the FAQ, the parent section and the plain-text summaries", () => {
    const texts = [...FAQ.flatMap((f) => [f.question, f.answer]), PARENT_TITLE, PARENT_LEAD, ...PARENT_NOT_YOURS.flat(), ...PARENT_YOURS, PARENT_NOTE, llmsTxt(), pricingMarkdown()];
    for (const text of texts) expect(words(text)).not.toMatch(glued);
  });

  it("on the terms and privacy pages", () => {
    for (const page of [Terms, Privacy]) {
      const text = renderToStaticMarkup(page()).replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'");
      expect(words(text)).not.toMatch(glued);
    }
  });
});

describe("page metadata", () => {
  it("the site description names the free online math assessment and keeps the price", () => {
    expect(SITE_DESCRIPTION).toMatch(/Free online math assessment\./);
    expect(SITE_DESCRIPTION).toMatch(/CAD 79\.99\/month/);
  });

  it("distinguishes nationwide assessment access from the BC curriculum plan", () => {
    expect(SITE_DESCRIPTION).toMatch(/assessment.*across Canada/i);
    expect(SITE_DESCRIPTION).toMatch(/BC curriculum/i);
    const service = homeJsonLd()["@graph"].find((item) => item["@type"] === "Service");
    expect(service).toBeDefined();
    if (!service || !("offers" in service) || !service.offers?.length) throw new Error("Missing program offer");
    expect(service.offers[0].description).toMatch(/BC curriculum/i);
    expect(service.offers[0]).not.toHaveProperty("eligibleRegion");
  });
});
