import {
  computeExprAnswer,
  NOT_STATED,
  UNCLEAR,
  type ItemResponse,
  type PageItem,
  type PageRecord,
  type ReferenceRecord,
} from "@/lib/reference-record";

const NON_ANSWER_POSITIONS = new Set<string>(["work_area", "checkbox"]);

export const KIT_REF_SEGMENT_RE = /^[A-Za-z0-9]+$/;

export function fileSlugFromRef(sourceRef: string): string {
  return sourceRef.replace(/:/g, "-");
}

function normalizeAnswerCompare(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[rR]\s*(\d+)/g, "R$1");
}

function isConcreteAnswer(answer: ItemResponse["answer"]): answer is string {
  return (
    typeof answer === "string" &&
    answer !== UNCLEAR &&
    answer !== NOT_STATED &&
    answer.trim().length > 0
  );
}

function isAnswerBearingResponse(resp: ItemResponse): boolean {
  return !NON_ANSWER_POSITIONS.has(resp.position);
}

function noteIfReaderDiffers(
  notes: string[],
  path: string,
  readerAnswer: ItemResponse["answer"],
  computedValue: string,
): void {
  if (!isConcreteAnswer(readerAnswer)) return;
  if (normalizeAnswerCompare(readerAnswer) !== normalizeAnswerCompare(computedValue)) {
    notes.push(`${path}: reader gave "${readerAnswer}", computed "${computedValue}"`);
  }
}

function processItemAnswers(
  item: PageItem,
  sectionIndex: number,
  notes: string[],
): PageItem {
  const computed = computeExprAnswer(item.expr);
  const itemPath = `sections[${sectionIndex}].items[n=${item.n}]`;

  if (!computed) {
    return item;
  }

  const answerIndices: number[] = [];
  item.responses.forEach((resp, idx) => {
    if (isAnswerBearingResponse(resp)) {
      answerIndices.push(idx);
    }
  });

  if (computed.kind === "single") {
    if (answerIndices.length === 1) {
      const targetIdx = answerIndices[0];
      const nextResponses = item.responses.map((resp, idx): ItemResponse => {
        if (idx !== targetIdx) return resp;
        noteIfReaderDiffers(notes, `${itemPath}.responses[${idx}]`, resp.answer, computed.value);
        return {
          ...resp,
          answer: computed.value,
          answer_source: "computed",
        };
      });
      return { ...item, responses: nextResponses };
    }

    notes.push(
      `${itemPath}: computed single answer "${computed.value}" but item has ${answerIndices.length} answer-bearing response(s); kept reader answers`,
    );
    return item;
  }

  // Multi-answer (chain blanks, linked pair parts)
  if (answerIndices.length === computed.values.length) {
    const slotByRespIndex = new Map<number, number>();
    answerIndices.forEach((respIdx, slotIdx) => {
      slotByRespIndex.set(respIdx, slotIdx);
    });

    const nextResponses = item.responses.map((resp, ri): ItemResponse => {
      const slotIdx = slotByRespIndex.get(ri);
      if (slotIdx === undefined) return resp;
      const val = computed.values[slotIdx];
      if (val === null) return resp;
      noteIfReaderDiffers(notes, `${itemPath}.responses[${ri}]`, resp.answer, val);
      return {
        ...resp,
        answer: val,
        answer_source: "computed",
      };
    });
    return { ...item, responses: nextResponses };
  }

  notes.push(
    `${itemPath}: computed ${computed.values.length} answer(s) but item has ${answerIndices.length} answer-bearing response(s); kept reader answers`,
  );
  return item;
}

export function applyComputedAnswers(record: ReferenceRecord): {
  record: ReferenceRecord;
  notes: string[];
} {
  if (record.kind !== "page") {
    return { record, notes: [] };
  }
  const notes: string[] = [];
  const nextPage: PageRecord = {
    ...record,
    sections: record.sections.map((section, si) => ({
      ...section,
      items: section.items.map((item) => processItemAnswers(item, si, notes)),
    })),
  };
  return { record: nextPage, notes };
}
