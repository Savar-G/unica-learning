import { describe, expect, it } from "vitest";
import { FAQ } from "@/lib/faq";
import { llmsTxt, pricingMarkdown } from "@/lib/ai-summary";
import { SITE_DESCRIPTION } from "@/lib/metadata";
import { PARENT_LEAD, PARENT_NOT_YOURS, PARENT_NOTE, PARENT_TITLE, PARENT_YOURS } from "@/lib/parent";
import { renderToStaticMarkup } from "react-dom/server";
import Terms from "@/app/(site)/terms/page";
import Privacy from "@/app/(site)/privacy/page";

// Public launch (#82): the free assessment is online, math only, and comes before any plan or card. These are the
// shared texts behind the FAQ section, the FAQPage data, /llms.txt, /pricing.md and the page metadata.

const answer = (question: RegExp) => {
  const item = FAQ.find((f) => question.test(f.question));
  if (!item) throw new Error(`No FAQ question matches ${question}`);
  return item.answer;
};

describe("the FAQ describes the online math assessment", () => {
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
    expect(a).toMatch(/After the report, BC families can choose a plan and add a card\./);
    expect(a).toMatch(/first workbook ships/);
    expect(a).not.toMatch(/when you sign up/);
  });

  it("opens the assessment to every family in Canada; other curricula join the workbook waitlist after the report", () => {
    const a = answer(/curriculum/);
    expect(a).toMatch(/Every family in Canada can take the free math assessment\./);
    expect(a).toMatch(/waitlist after the report/);
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
  });

  it("/pricing.md: no card at signup; plan and card after the report", () => {
    const text = pricingMarkdown();
    expect(text).not.toMatch(/at signup/);
    expect(text).toMatch(/after the report/);
    expect(text).toMatch(/Every family in Canada can take the free online math assessment\./);
  });
});

describe("a space follows every full stop and colon in public copy", () => {
  // A word, then "." or ":", then a letter: "Canada.The", "for you:scan". Web and email addresses are removed first.
  const glued = /[a-z][.:][A-Za-z]/;
  const words = (text: string) => text.replace(/https?:\/\/\S+/g, " ").replace(/\S+@\S+/g, " ");

  it("in the FAQ (also the FAQPage data), the parent section and the plain-text summaries", () => {
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
    expect(SITE_DESCRIPTION).toMatch(/CAD 99\/month/);
  });
});
