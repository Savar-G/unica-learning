import type { Example } from "@/lib/reference-record";
import { formatExample } from "@/lib/reference-record/render-markdown";
import { methodRef } from "./identity";
import { contentSha256, settleStatus } from "./record";
import { plainSentence } from "./sentence-text";
import type { MachineReadMark, MethodSentence, TopicEvidence, TopicGap, TopicMethodRecord } from "./types";

export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function list(values: readonly unknown[] | string): string {
  if (typeof values === "string") return values;
  return values.length > 0 ? values.join(", ") : "none";
}

function marked(fact: MachineReadMark): string {
  return fact.machine_read ? ` [machine_read: ${fact.machine_read.join(", ")}]` : "";
}

export function gapLines(gap: TopicGap): string[] {
  const what = gap.kind === "no_method" ? `no method: ${gap.step}` : `step not known: ${gap.step}`;
  return [
    `  ${what} (${list(gap.pages)})${marked(gap)}`,
    ...gap.hints.map((hint) => `    look at ${hint.page} ${hint.at} (${hint.kind})`),
  ];
}

function factLines(e: TopicEvidence): string[] {
  return [
    `title: ${e.topic.title}`,
    `sheets: ${typeof e.topic.sheet_range === "string" ? e.topic.sheet_range : e.topic.sheet_range.join(" to ")}`,
    `standard time in minutes: ${typeof e.topic.std_time_min === "string" ? e.topic.std_time_min : e.topic.std_time_min.join(" to ")}${marked(e.topic)}`,
    `contents record: ${e.contents.ref} (${e.contents.status}, sha256 ${e.contents.sha256})`,
    `facts from machine_read records: ${e.include_machine_read ? "included and marked" : "left out"}`,
    "pages:",
    ...e.pages.map(
      (p) =>
        `  ${p.ref}: ${p.status}, facts ${p.facts}${p.printed_title_differs ? ", its printed title differs" : ""}, sha256 ${p.sha256}${marked(p)}`,
    ),
    `pages with no photo: ${list(e.pages_without_photo.pages)}${marked(e.pages_without_photo)}`,
    `pages in no topic: ${list(e.unplaced_pages.pages)}${marked(e.unplaced_pages)}`,
    "questions on each page:",
    ...e.sheets.map((s) => `  ${s.page}: ${s.questions} (${list(s.steps.map((step) => `${step.id}: ${step.questions}`))})${marked(s)}`),
    "steps:",
    ...e.steps.flatMap((s) => [
      `  ${s.id}: on ${list(s.pages)}; worked examples: ${list(s.methods.map((m) => `${m.page} examples[${m.example}]`))}${marked(s)}`,
      ...(s.partly_known ?? []).map((k) => `    question: ${k.expr_kind}, operation ${k.operation}, form ${k.form}`),
    ]),
    "examples:",
    ...e.examples.map(
      (x) =>
        `  ${x.page}: ${x.position}, ${x.relation}, forms ${list(x.forms)}, kinds ${list(x.expr_kinds)}, shows ${list(x.steps_shown)}, marks ${list(x.marks)}${marked(x)}`,
    ),
    `examples not known on: ${list(e.examples_not_known)}`,
    "scaffolds:",
    ...e.scaffolds.map(
      (s) => `  ${s.kind}: on ${list(s.pages)}; last on ${s.last_page}; not known after that: ${list(s.not_known_after)}${marked(s)}`,
    ),
    "format changes:",
    ...e.format_changes.map(
      (c) => `  ${c.from} (${list(c.before)}) to ${c.to} (${list(c.after)}); not known between: ${list(c.not_known_between)}${marked(c)}`,
    ),
    "gaps:",
    ...e.gaps.flatMap(gapLines),
  ];
}

// The exact examples that a procedure rests on.
function exampleLines(sentence: MethodSentence, e: TopicEvidence, views: ReadonlyMap<string, Record<string, unknown>>): string[] {
  const methods = (sentence.steps ?? []).flatMap((id) => e.steps.find((s) => s.id === id)?.methods ?? []);
  return methods
    .filter((m) => sentence.cites.includes(m.page))
    .flatMap((m) => {
      const examples = views.get(m.page)?.examples as Example[];
      return [`    rests on ${m.page} examples[${m.example}]:`, ...formatExample(examples[m.example], m.example).map((l) => `      ${l}`)];
    });
}

// The whole record in plain words, and the digest that approves exactly this content.
export function showLines(record: TopicMethodRecord, views: ReadonlyMap<string, Record<string, unknown>>): string[] {
  const { status, approvals } = settleStatus(record);
  const e = record.evidence;
  return [
    `topic method record ${methodRef(record)}: ${status}`,
    `approved by: ${list(approvals.map((a) => `${a.by} (${a.at})`))}`,
    ...factLines(e),
    `summary (${record.summary_draft ? `drafted by ${record.summary_draft.model}, sha256 ${record.summary_draft.sha256}` : "no model ran"}):`,
    ...record.summary.flatMap((s, i) => [
      `  ${i + 1}. ${s.kind}${s.guess ? " (guess)" : ""}: ${plainSentence(s.text, record)}`,
      `    cites: ${list(s.cites)}`,
      ...(s.steps ? [`    steps: ${list(s.steps)}`] : []),
      ...exampleLines(s, e, views),
    ]),
    `digest: ${contentSha256(record)}`,
  ];
}

// The gaps of one topic.
export function topicLines(topic: number, e: TopicEvidence): string[] {
  const pages = (facts: string): string => list(e.pages.filter((p) => p.facts === facts).map((p) => p.ref));
  return [
    `topic ${topic}: ${e.topic.title}${marked(e.topic)}`,
    ...e.gaps.flatMap(gapLines),
    `  gaps: ${e.gaps.length}; pages with facts: ${pages("used")}; no facts (machine_read): ${pages("withheld")}`,
    `  no photo: ${list(e.pages_without_photo.pages)}; in no topic: ${list(e.unplaced_pages.pages)}`,
  ];
}
