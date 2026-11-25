// The fit checks of the harness: the form of each question, and the templates that hold it. They use the function of the bank.
import type { Answer, Face } from "../contract";
import { fitProblem, needsOf, type Needs, type PageTemplate } from "../layout/templates";
import type { Shape } from "../shapes";
import { formsOf } from "../shapes/shape";
import type { Limits, Rows } from "./shape-registration";

/** A question as the fit check sees it: `form` is where its blanks stand. */
export interface Formed { face: Face; answer: Answer; form: string; needs: Needs }

const formOf = (face: Face): string => (face.kind === "equation" || face.kind === "sequence" ? face.tokens.reduce((form, t) => form + ("blank" in t ? "_" : "t"), `${face.kind} `) : face.kind);
export const formed = (face: Face, answer: Answer): Formed => ({ face, answer, form: formOf(face), needs: needsOf(face, answer) });

interface Space { limits: Limits; json: string }

/** The fit checks of one shape in one run of the harness. Each result is found one time. */
export class FitChecks {
  private readonly known = new Map<string, boolean>();
  private readonly knownForms = new Map<string, ReadonlyMap<string, Formed>>();

  constructor(private readonly shape: Shape, private readonly tell: (detail: string) => null) {}

  /** The fit check of the bank, for all questions of one form and size. */
  fits(template: PageTemplate, { face, answer, form, needs }: Formed): boolean {
    const key = `${template.id} ${form} ${Object.values(needs).join()}`;
    const known = this.known.get(key);
    if (known !== undefined) return known;
    const fits = fitProblem(template, face, answer) === null;
    this.known.set(key, fits);
    return fits;
  }

  /** The widest question of each form of some limits, as the shape says it. */
  forms({ limits, json }: Space): ReadonlyMap<string, Formed> {
    const known = this.knownForms.get(json);
    if (known) return known;
    const found = new Map<string, Formed>();
    for (const { question, answer } of formsOf(this.shape, limits)) {
      const one = formed(this.shape.face(question), answer);
      if (found.has(one.form)) this.tell(`the forms of ${json} have "${one.form}" twice`);
      found.set(one.form, one);
    }
    this.knownForms.set(json, found);
    return found;
  }

  /** A question has one of the forms of its limits, and is no larger than the widest one of that form. */
  check({ rows, form, needs }: { rows: Rows; form: string; needs: Needs }, space: Space, at: () => string): void {
    const gave = () => `${at()} gave ${JSON.stringify(rows)}`;
    const widest = this.forms(space).get(form)?.needs;
    if (!widest) return void this.tell(`${gave()}, and the form "${form}" is not one of the forms of ${space.json}`);
    // With one form, the worst case is the widest question, and its own checks say so.
    const large = this.shape.forms && Object.keys(needs).find((name) => !(needs[name] <= widest[name]));
    if (large) this.tell(`${gave()}, which needs ${needs[large]} ${large}, and the widest of its form ${widest[large]}`);
  }
}
