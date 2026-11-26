import { skill, type BcStandard } from "../../skill-map/kit";
import type { Strand, Wording } from "../../types";
import { keepMathTogether, speakUpperMath } from "../grades-6-7/helpers";
import { wrong, type TaggedTemplate } from "../kit";

type Item = readonly [id: string, prompt: string, answer: string, options?: readonly string[]];

// A variant has its own template ID so successive adaptive blocks can draw from the same skill.
export function placementFamily(
  level: 10 | 11 | 12, code: string, slug: string, strand: Strand, text: string,
  items: readonly Item[], wording: Wording = "bare-number",
) {
  const grades = { BC: level, AB: level, SK: level, MB: level, ON: level };
  const mainSkill = skill(`${code}-${slug}`, text);
  const standard: BcStandard = { code, grade: level, strand, text, skills: [mainSkill] };
  const templates = items.map(([id, prompt, answer, options]) => {
    const template: TaggedTemplate = {
      id, strand, grades, standard: code, format: options ? "choice" : "number", whiteboard: true,
      fill: () => ({
        values: {},
        prompt,
        readAloud: speakUpperMath(prompt),
        answer,
        wrong: (options ?? []).filter(option => option !== answer).map(option => wrong(option, "placement-distractor")),
        ...(options && { say: Object.fromEntries(options.map(option => [option, speakUpperMath(option)])) }),
      }),
    };
    return keepMathTogether(template);
  });
  return { standard, templates, mainSkill, wording };
}
