import type {
  ArithOp,
  BorrowKind,
  CarryKind,
  ExampleMarkKind,
  ExamplePosition,
  ExampleRelation,
  ExampleStepKind,
  ExprKind,
  IntRange,
  ItemForm,
  NotStated,
  ScaffoldKind,
  TranscriptStatus,
} from "@/lib/reference-record";

// The check on bank_reference_topic_methods.status holds the same list (src/lib/state-lists.test.ts).
export const TOPIC_METHOD_STATUSES = ["drafted", "approved"] as const;
export type TopicMethodStatus = (typeof TOPIC_METHOD_STATUSES)[number];

export const SENTENCE_KINDS = ["introduces", "procedure", "progression"] as const;
export type SentenceKind = (typeof SENTENCE_KINDS)[number];

// A sheet has a front (a) and a back (b).
export const PAGE_SIDES = ["a", "b"] as const;

// The scaffolds that show a child how to do a step. An answer box only holds an answer, and code
// cannot know what an "other" scaffold shows, so neither counts.
export const TEACHING_SCAFFOLD_KINDS: readonly ScaffoldKind[] = [
  "number_strip",
  "table_read_aloud",
  "equation_frame",
  "arrow",
  "caption",
  "helper_digit",
  "partial_working",
  "worked_item",
];

export const TOPIC_METHOD_TABLE = "bank_reference_topic_methods" as const;

export interface MethodKey {
  source: string;
  level: string;
  topic: number;
}

// Present only when a fact rests on a machine_read record: the refs of those records.
export interface MachineReadMark {
  machine_read?: string[];
}

export interface StepFeatures {
  expr_kind: ExprKind;
  form: ItemForm;
  operation?: ArithOp;
  operand_digits?: number[];
  // Add and multiply only.
  carries?: CarryKind[];
  // Subtract only.
  borrows?: BorrowKind[];
  // Divide only.
  remainder?: boolean;
  // Chains only.
  chain_step?: number;
  // Linked pairs only.
  parts?: [StepFeatures, StepFeatures];
}

export interface SheetStep {
  id: string;
  questions: number;
}

export interface SheetFact extends MachineReadMark {
  page: string;
  questions: number | NotStated;
  steps: SheetStep[];
}

export interface StepFact extends MachineReadMark {
  id: string;
  // not_stated: code cannot tell the step of these questions (notation, an unclear value, a decimal).
  features: StepFeatures | NotStated;
  pages: string[];
  // Pages with an example of this step or a teaching scaffold on its questions.
  shown_on: string[];
}

export interface ExampleFact extends MachineReadMark {
  page: string;
  position: ExamplePosition | NotStated;
  relation: ExampleRelation | NotStated;
  forms: Array<ItemForm | NotStated>;
  expr_kinds: Array<ExprKind | NotStated>;
  steps_shown: Array<ExampleStepKind | NotStated> | NotStated;
  marks: Array<ExampleMarkKind | NotStated> | NotStated;
}

export interface ScaffoldFact extends MachineReadMark {
  kind: ScaffoldKind;
  pages: string[];
  last_page: string;
  // Later pages of the topic whose scaffolds are not known. When not empty, the last page may be later.
  not_known_after: string[];
}

export interface FormatChangeFact extends MachineReadMark {
  from: string;
  to: string;
  before: string[];
  after: string[];
  // Pages between the two whose question format is not known.
  not_known_between: string[];
}

export interface TopicGap extends MachineReadMark {
  step: string;
  // no_method: the pages show the step and no method for it. step_not_known: code cannot tell the step.
  kind: "no_method" | "step_not_known";
  pages: string[];
  // Pages of the step with an example or scaffold that code cannot match to a step.
  check_pages: string[];
}

export interface TopicPage {
  ref: string;
  status: TranscriptStatus;
  // SHA-256 of the canonical JSON of the whole page record.
  sha256: string;
  facts: "used" | "withheld";
  // The printed title of the page is not the title in the contents chart.
  printed_title_differs?: true;
}

export interface TopicEvidence {
  include_machine_read: boolean;
  contents: { ref: string; status: TranscriptStatus; sha256: string };
  topic: {
    title: string | NotStated;
    sheet_range: IntRange | NotStated;
    std_time_min: IntRange | NotStated;
  } & MachineReadMark;
  pages: TopicPage[];
  pages_without_photo: string[] | NotStated;
  // Only when the sheet range is not stated: pages of the level that code cannot put in any topic.
  unplaced_pages: string[];
  sheets: SheetFact[];
  steps: StepFact[];
  examples: ExampleFact[];
  examples_not_known: string[];
  scaffolds: ScaffoldFact[];
  format_changes: FormatChangeFact[];
  gaps: TopicGap[];
}

export interface MethodSentence {
  kind: SentenceKind;
  text: string;
  cites: string[];
  guess?: true;
  // Procedure only: the ids of the steps it is about, when its cited pages hold other steps too.
  steps?: string[];
}

export interface MethodApproval {
  by: string;
  at: string;
  content_sha256: string;
}

export interface TopicMethodRecord extends MethodKey {
  kind: "topic_method";
  evidence: TopicEvidence;
  summary: MethodSentence[];
  // What the model wrote: a summary with another digest was changed by a person. Null: no model ran.
  summary_draft: { model: string; sha256: string } | null;
  status: TopicMethodStatus;
  approvals: MethodApproval[];
}
