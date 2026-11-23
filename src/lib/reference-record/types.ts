export const UNCLEAR = "unclear" as const;
export const NOT_STATED = "not_stated" as const;

export type Unclear = typeof UNCLEAR;
export type NotStated = typeof NOT_STATED;
export type ReaderSentinel = Unclear | NotStated;

export type ReaderValue<T> = T | ReaderSentinel;
export type ReaderNullable<T> = T | null | ReaderSentinel;

export const ITEM_FORMS = ["horizontal", "vertical", "bracket"] as const;
export type ItemForm = (typeof ITEM_FORMS)[number];

export const ARITH_OPS = ["add", "sub", "mul", "div"] as const;
export type ArithOp = (typeof ARITH_OPS)[number];

export const EXPR_KINDS = [
  "arith",
  "chain",
  "missing",
  "linked",
  "word",
  "notation",
] as const;
export type ExprKind = (typeof EXPR_KINDS)[number];

export const RESPONSE_POSITIONS = [
  "after_equals",
  "under_line",
  "box",
  "above_bracket",
  "line_with_unit",
  "work_area",
  "checkbox",
] as const;
export type ResponsePosition = (typeof RESPONSE_POSITIONS)[number];

export const ANSWER_SOURCES = ["computed", "reader", "unchecked"] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

export const SCAFFOLD_KINDS = [
  "answer_boxes",
  "number_strip",
  "table_read_aloud",
  "equation_frame",
  "arrow",
  "caption",
] as const;
export type ScaffoldKind = (typeof SCAFFOLD_KINDS)[number];

export const EXAMPLE_POSITIONS = ["top", "foot", "inline"] as const;
export type ExamplePosition = (typeof EXAMPLE_POSITIONS)[number];

export const EXAMPLE_RELATIONS = ["compare", "sequence", "table"] as const;
export type ExampleRelation = (typeof EXAMPLE_RELATIONS)[number];

export interface ArithExpr {
  kind: "arith";
  op: ReaderValue<ArithOp>;
  operands: ReaderValue<number>[];
}

export interface ChainExpr {
  kind: "chain";
  terms: ReaderNullable<number>[];
  step?: ReaderValue<number>;
}

export interface MissingExpr {
  kind: "missing";
  op: ReaderValue<ArithOp>;
  operands: ReaderNullable<number>[];
  result: ReaderNullable<number>;
}

export interface WordExpr {
  kind: "word";
  text: ReaderValue<string>;
  expr: SimpleExpr | null | ReaderSentinel;
  unit?: ReaderNullable<string>;
}

export interface NotationExpr {
  kind: "notation";
  latex: ReaderValue<string>;
  figure?: ReaderNullable<string>;
}

export type SimpleExpr =
  | ArithExpr
  | ChainExpr
  | MissingExpr
  | WordExpr
  | NotationExpr;

export interface LinkedExpr {
  kind: "linked";
  pair: [SimpleExpr, SimpleExpr];
  connector?: ReaderNullable<string>;
}

export type Expr = SimpleExpr | LinkedExpr;

export interface ItemResponse {
  position: ReaderValue<ResponsePosition>;
  cue: ReaderNullable<string>;
  answer: ReaderNullable<string>;
  answer_source: AnswerSource;
  unit?: ReaderNullable<string>;
  place?: ReaderNullable<string>;
}

export type ScaffoldAppliesTo = number[] | "all" | ReaderSentinel;

export interface AnswerBoxesScaffold {
  kind: "answer_boxes";
  applies_to: ScaffoldAppliesTo;
  box_count?: ReaderValue<number>;
  places?: ReaderValue<string>[] | ReaderSentinel;
}

export interface NumberStripScaffold {
  kind: "number_strip";
  applies_to: ScaffoldAppliesTo;
  values: ReaderValue<number>[] | ReaderSentinel;
  highlighted?: ReaderValue<number>[] | null | ReaderSentinel;
}

export interface TableReadAloudScaffold {
  kind: "table_read_aloud";
  applies_to: ScaffoldAppliesTo;
  has_checkbox?: ReaderValue<boolean>;
  caption_style?: ReaderNullable<string>;
}

export interface EquationFrameScaffold {
  kind: "equation_frame";
  applies_to: ScaffoldAppliesTo;
  template: ReaderValue<string>;
}

export interface ArrowScaffold {
  kind: "arrow";
  applies_to: ScaffoldAppliesTo;
  from?: ReaderNullable<string>;
  to?: ReaderNullable<string>;
  label?: ReaderNullable<string>;
}

export interface CaptionScaffold {
  kind: "caption";
  applies_to: ScaffoldAppliesTo;
  text: ReaderValue<string>;
  target?: ReaderNullable<string>;
}

export type Scaffold =
  | AnswerBoxesScaffold
  | NumberStripScaffold
  | TableReadAloudScaffold
  | EquationFrameScaffold
  | ArrowScaffold
  | CaptionScaffold;

export interface ExamplePart {
  caption?: ReaderNullable<string>;
  form: ReaderValue<ItemForm>;
  expr: Expr | null;
  shown_answer?: ReaderNullable<string>;
}

export interface Example {
  position: ReaderValue<ExamplePosition>;
  relation: ReaderValue<ExampleRelation>;
  label?: ReaderNullable<string>;
  parts: ExamplePart[];
  text?: ReaderNullable<string>;
  cross_ref?: ReaderNullable<string>;
}

export type ScoreBandLow = ReaderValue<number>;
export type ScoreBandHigh = ReaderValue<number | "open">;
export type ClosedScoreBand = [number, number];
export type OpenScoreBand = [number, "open"];
export type ScoreBandRange = [ScoreBandLow, ScoreBandHigh];
export type ScoreBand = ScoreBandRange | null | ReaderSentinel;
export type ScoreBands = [ScoreBand, ScoreBand, ScoreBand, ScoreBand, ScoreBand];

export interface PageTopic {
  title: ReaderNullable<string>;
  number?: ReaderNullable<number>;
}

export interface PageItem {
  n: number;
  printed: ReaderValue<string>;
  form: ReaderNullable<ItemForm>;
  expr: Expr | null;
  responses: ItemResponse[];
}

export interface PageSection {
  instruction: ReaderNullable<string>;
  scaffolds: Scaffold[] | ReaderSentinel;
  items: PageItem[];
}

export interface PageRecord {
  kind: "page";
  source_ref: string;
  topic: PageTopic;
  sections: PageSection[];
  examples: Example[] | ReaderSentinel;
  score_bands: ScoreBands | ReaderSentinel;
  readers?: string[];
}

export type IntRange = [number, number];

export interface ContentsTopic {
  n: number;
  title: ReaderValue<string>;
  sheets: ReaderValue<IntRange>;
  std_time_min: ReaderNullable<IntRange>;
}

export interface ContentsRecord {
  kind: "contents";
  source_ref: string;
  topics: ContentsTopic[];
  readers?: string[];
}

export type ReferenceRecord = PageRecord | ContentsRecord;

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; record: ReferenceRecord }
  | { ok: false; errors: ValidationError[] };
