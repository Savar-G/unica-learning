import { describe, expect, it } from "vitest";
import {
  formatCompareReportMarkdown,
  formatPagesSentToPerson,
  type CompareWorkReport,
} from "./compare-report";

describe("formatCompareReportMarkdown", () => {
  it("renders summary table, kept human_checked, stale pages, failed photos, and per-page details", () => {
    const report: CompareWorkReport = {
      reader_a: { family: "claude", model: "c1" },
      reader_b: { family: "codex", model: "x1" },
      pages: [
        {
          source_ref: "sample:M:3a",
          photo: "111111111111.jpg",
          original_name: "IMG_0001.jpg",
          photo_sha256: "1".repeat(64),
          status: "double_read",
          only_in_reader: null,
          digest_mismatch: null,
          differences: [],
          once_read: [],
          both_unclear: [],
          one_unclear: [],
          needs_person_read: false,
          unnamed_teaching_marks: [],
          reader_notes: { a: [], b: [] },
        },
        {
          source_ref: "sample:M:4a",
          photo: "222222222222.jpg",
          original_name: "IMG_0002.jpg",
          photo_sha256: null,
          status: "machine_read",
          only_in_reader: null,
          digest_mismatch: { a: "1".repeat(64), b: "2".repeat(64) },
          differences: [{ path: "topic.title", a: "Add", b: "Sub", kind: "value" }],
          wording: [
            {
              path: "examples[0].marks[0].description",
              a: "Arrow to 3",
              b: "Points at 3",
              kind: "wording",
            },
          ],
          once_read: [
            { path: "examples[0]", a: {}, b: null, kind: "once_read" },
            {
              path: "sections[0].scaffolds[b:2]",
              a: null,
              b: { kind: "arrow", applies_to: [1] },
              kind: "once_read",
              reader: "b",
            },
            {
              path: "sections[0].scaffolds[b:1]",
              a: null,
              b: { kind: "arrow", applies_to: [2], label: "carry" },
              kind: "once_read",
              reader: "b",
              final_path: "sections[0].scaffolds[]",
            },
            {
              path: "examples[0].steps[b:1]",
              a: null,
              b: { n: 2, shows: "partial_sum", printed: "= 5/6" },
              kind: "once_read",
              reader: "b",
              insert_before: 1,
              final_path: "examples[0].steps[1]",
            },
            {
              path: "examples[0].marks[b:0]",
              a: null,
              b: { kind: "box", step: 2, description: "Box around sum" },
              kind: "once_read",
              reader: "b",
              final_path: "examples[0].marks[]",
              missing_step: true,
            },
          ],
          both_unclear: [{ path: "topic.number", a: "unclear", b: "unclear", kind: "both_unclear" }],
          one_unclear: [],
          empty_answer: [
            { path: "sections[0].items[n=2].responses[0]", a: null, b: "9", kind: "empty_answer" },
          ],
          needs_person_read: true,
          unnamed_teaching_marks: [
            { kind: "step", path: "examples[0].steps[n=1]", description: "split tens", reader: "both" },
            { kind: "mark", path: "examples[0].marks[0]", description: "dotted divider", reader: "a" },
            { kind: "scaffold", path: "sections[0].scaffolds[0]", description: "shaded column", reader: "both" },
          ],
          reader_notes: { a: ["note a"], b: ["note b"] },
        },
      ],
      single_reader_pages: [{ source_ref: "sample:M:5a", reader: "a" }],
      failed_photos: [{ slot: "b", photo: "333333333333.jpg", original_name: "IMG_0003.jpg", status: "cli_error", reason: "timeout" }],
      too_small_photos: [{ original_name: "IMG_0004.jpg", width: 800, height: 600 }],
      could_not_read_photos: [{ original_name: "IMG_0005.jpg", reason: "unreadable_image: corrupt JPEG" }],
      kept_human_checked: [
        {
          source_ref: "sample:M:2a",
          in_current_batch: true,
          differs_from_reader_a: true,
          differs_from_reader_b: false,
          diff_count_a: 2,
          diff_count_b: 0,
        },
      ],
      removed_stale_pages: ["sample:M:9a"],
      duplicate_photos: [
        { original_name: "IMG_0006.jpg", duplicate_of: "IMG_0001.jpg", photo_sha256: "1".repeat(64) },
      ],
      removed_photos: [
        { original_name: "IMG_OLD.jpg", photo: "999999999999.jpg", photo_sha256: "9".repeat(64), source_ref: "sample:M:8a", kept_human_checked: false },
        { original_name: "IMG_KEEP.jpg", photo: "888888888888.jpg", photo_sha256: "8".repeat(64), source_ref: "sample:M:2a", kept_human_checked: true },
      ],
      same_page_id_conflicts: [
        {
          source_ref: "sample:M:3a",
          winner_original_name: "IMG_0001.jpg",
          winner_photo: "111111111111.jpg",
          photo: "777777777777.jpg",
          original_name: "IMG_DUP_ID.jpg",
          photo_sha256: "7".repeat(64),
          reader_a_source_ref: "sample:M:3a",
          reader_b_source_ref: "sample:M:4a",
        },
      ],
    };

    const md = formatCompareReportMarkdown(report);
    expect(md).toContain(
      "| Page | Photo | Status | Agreement | Result | Differences | Wording | Once-read | Both unclear | Empty answers | Has prose |",
    );
    expect(md).toContain("| sample:M:3a | IMG_0001.jpg | double_read | - | double read | 0 | 0 | 0 | 0 | 0 | no |");
    expect(md).toContain("| sample:M:4a | IMG_0002.jpg | machine_read | - | sent to a person | 1 | 1 | 5 | 1 | 1 | yes |");
    expect(md).toContain(
      "- Wording differences: the readers describe the same thing in other words; reader A's words are kept; no action needed",
    );
    expect(md).toContain('`examples[0].marks[0].description`: a="Arrow to 3" | b="Points at 3"');
    expect(md).toContain("at least 1600 px on the long side and 600 px on the short side");
    expect(md).toContain(
      '`sections[0].scaffolds[b:1]`: only reader b has it; belongs in the final record at `sections[0].scaffolds[]`: {"kind":"arrow","applies_to":[2],"label":"carry"}',
    );
    expect(md).toContain(
      '`examples[0].steps[b:1]`: only reader b has it; insert before `examples[0].steps[1]`: {"n":2,"shows":"partial_sum","printed":"= 5/6"}',
    );
    expect(md).toContain(
      '`examples[0].marks[b:0]`: only reader b has it; belongs in the final record at `examples[0].marks[]`; its step is missing from reader A\'s record and must be added first: {"kind":"box","step":2,"description":"Box around sum"}',
    );
    expect(md).toContain('keep "unclear" and mark the page checked');
    expect(md).toContain('`sections[0].items[n=2].responses[0]`: a=null | b="9"');
    expect(md).toContain("## Too small to read");
    expect(md).toContain("IMG_0004.jpg");
    expect(md).toContain("800 x 600");
    expect(md).toContain("## Could not be read");
    expect(md).toContain("IMG_0005.jpg");
    expect(md).toContain("corrupt JPEG");
    expect(md).toContain("## Duplicate photos");
    expect(md).toContain("IMG_0006.jpg");
    expect(md).toContain("IMG_0001.jpg");
    expect(md).toContain("## Removed photos");
    expect(md).toContain("IMG_OLD.jpg");
    expect(md).toContain("IMG_KEEP.jpg");
    expect(md).toContain("## Same page id for two photos");
    expect(md).toContain("IMG_DUP_ID.jpg");
    expect(md).toContain("sample:M:3a");
    expect(md).toContain("sample:M:4a");
    expect(md).toContain("## Unnamed teaching marks");
    expect(md).toContain("split tens");
    expect(md).toContain("dotted divider");
    expect(md).toContain("shaded column");
    expect(md).toContain("## Kept: checked by a person");
    expect(md).toContain("reader a differs (2)");
    expect(md).toContain("## Removed stale pages");
    expect(md).toContain("- sample:M:9a");
    expect(md).toContain("Has worked examples or prose.");
    expect(md).not.toContain("A person must read");
    expect(md).toContain("Photo digest mismatch");
    expect(md).toContain("Exact match across both readers.");

    // A record that a person edited is kept: no final_path/insert_before is given, wording does not
    // claim reader A's words are kept, and machine_read keeps "find the place in that record".
    const editedPage = {
      ...report.pages[1],
      edited_by_person: true,
      once_read: [
        {
          path: "sections[0].scaffolds[b:2]",
          a: null,
          b: { kind: "arrow", applies_to: [1] },
          kind: "once_read" as const,
          reader: "b" as const,
        },
        {
          path: "examples[0].marks[b:0]",
          a: null,
          b: { kind: "box", step: 2, description: "Box around sum" },
          kind: "once_read" as const,
          reader: "b" as const,
          missing_step: true,
        },
      ],
    };
    const editedMd = formatCompareReportMarkdown({
      ...report,
      pages: [editedPage],
    });
    expect(editedMd).toContain(
      "- Wording differences: the readers describe the same thing in other words; the edited record is kept; no action needed",
    );
    expect(editedMd).not.toContain("reader A's words are kept");
    expect(editedMd).toContain(
      '`sections[0].scaffolds[b:2]`: only reader b has it; a person changed the final record, so find the place in that record: {"kind":"arrow","applies_to":[1]}',
    );
    expect(editedMd).toContain(
      '`examples[0].marks[b:0]`: only reader b has it; a person changed the final record, so find the place in that record; step absent from reader A\'s record: {"kind":"box","step":2,"description":"Box around sum"}',
    );
    expect(editedMd).not.toContain("must be added first");

    // A human_checked page keeps wording neutral and omits review instructions and locations.
    const checkedMd = formatCompareReportMarkdown({
      ...report,
      pages: [{ ...editedPage, edited_by_person: undefined, status: "human_checked" as const }],
    });
    expect(checkedMd).toContain(
      "- Wording differences: the readers describe the same thing in other words; the edited record is kept; no action needed",
    );
    expect(checkedMd).not.toContain("reader A's words are kept");
    expect(checkedMd).toContain(
      '`sections[0].scaffolds[b:2]`: only reader b: {"kind":"arrow","applies_to":[1]}',
    );
    expect(checkedMd).toContain(
      '`examples[0].marks[b:0]`: only reader b; step absent from reader A\'s record: {"kind":"box","step":2,"description":"Box around sum"}',
    );
    expect(checkedMd).not.toContain("find the place in that record");
    expect(checkedMd).not.toContain("not in kept final record");
    expect(checkedMd).not.toContain("must be added");
    expect(checkedMd).not.toContain("insert before");
    expect(checkedMd).not.toContain("belongs in the final");
    expect(checkedMd).not.toContain("look at the photo");

    // A double_read page with only wording differences lists them and does not say "Exact match".
    const wordingOnly = formatCompareReportMarkdown({
      ...report,
      pages: [
        {
          ...report.pages[0],
          wording: [
            { path: "sections[0].items[n=1].expr.figure", a: "Two circles", b: "Pair of circles", kind: "wording" },
          ],
        },
      ],
    });
    expect(wordingOnly).toContain("| sample:M:3a | IMG_0001.jpg | double_read | - | double read | 0 | 1 | 0 | 0 | 0 | no |");
    expect(wordingOnly).toContain(
      "- Wording differences: the readers describe the same thing in other words; reader A's words are kept; no action needed",
    );
    expect(wordingOnly).not.toContain("Exact match across both readers.");
  });

  it("renders agreement percentage, result labels, differences on accepted pages, and the end-of-run list", () => {
    const baseReport: CompareWorkReport = {
      reader_a: { family: "codex", model: "x1" },
      reader_b: { family: "claude", model: "c1" },
      pages: [
        {
          source_ref: "sample:M:1a",
          photo: "111111111111.jpg",
          original_name: "01.jpg",
          photo_sha256: "1".repeat(64),
          status: "double_read",
          agreement: { agreed: 20, compared: 20, percent: 100 },
          result: "double read",
          result_reason: null,
          only_in_reader: null,
          digest_mismatch: null,
          differences: [],
          once_read: [],
          both_unclear: [],
          one_unclear: [],
          needs_person_read: false,
          unnamed_teaching_marks: [],
          reader_notes: { a: [], b: [] },
        },
        {
          source_ref: "sample:M:2a",
          photo: "222222222222.jpg",
          original_name: "02.jpg",
          photo_sha256: "2".repeat(64),
          status: "agreement_accepted",
          agreement: { agreed: 18, compared: 20, percent: 90 },
          result: "accepted by the 90% rule",
          result_reason: null,
          only_in_reader: null,
          digest_mismatch: null,
          differences: [
            { path: "topic.title", a: "Adding", b: "Addition", kind: "value" },
            { path: "sections[0].items[n=1].printed", a: "1 + 2 =", b: "1 + 3 =", kind: "value" },
          ],
          once_read: [],
          both_unclear: [],
          one_unclear: [],
          needs_person_read: false,
          unnamed_teaching_marks: [],
          reader_notes: { a: [], b: [] },
        },
        {
          source_ref: "sample:M:3a",
          photo: "333333333333.jpg",
          original_name: "03.jpg",
          photo_sha256: "3".repeat(64),
          status: "machine_read",
          agreement: { agreed: 89, compared: 100, percent: 89 },
          result: "sent to a person",
          result_reason: "below 90% agreement",
          only_in_reader: null,
          digest_mismatch: null,
          differences: Array.from({ length: 11 }, (_, i) => ({
            path: `sections[0].items[n=${i + 1}].printed`,
            a: "1 + 1 =",
            b: "1 + 2 =",
            kind: "value" as const,
          })),
          once_read: [],
          both_unclear: [],
          one_unclear: [],
          needs_person_read: false,
          unnamed_teaching_marks: [],
          reader_notes: { a: [], b: [] },
        },
        {
          source_ref: "sample:M:4a",
          photo: "444444444444.jpg",
          original_name: "04.jpg",
          photo_sha256: "4".repeat(64),
          status: "machine_read",
          agreement: { agreed: 19, compared: 20, percent: 95 },
          result: "sent to a person",
          result_reason: "stored answer conflicts with computed answer",
          answer_conflicts: ['sections[0].items[n=1].responses[0]: reader gave "6", computed "5"'],
          only_in_reader: null,
          digest_mismatch: null,
          differences: [{ path: "topic.title", a: "Sums", b: "Totals", kind: "value" }],
          once_read: [],
          both_unclear: [],
          one_unclear: [],
          needs_person_read: false,
          unnamed_teaching_marks: [],
          reader_notes: { a: [], b: [] },
        },
      ],
      pages_sent_to_person: [
        {
          source_ref: "sample:M:3a",
          agreement_percent: 89,
          agreed: 89,
          compared: 100,
          difference_count: 11,
          reason: null,
        },
        {
          source_ref: "sample:M:4a",
          agreement_percent: 95,
          agreed: 19,
          compared: 20,
          difference_count: 1,
          reason: "stored answer conflicts with computed answer",
        },
      ],
      single_reader_pages: [],
      failed_photos: [],
      too_small_photos: [],
      could_not_read_photos: [],
      kept_human_checked: [],
      removed_stale_pages: [],
      duplicate_photos: [],
      removed_photos: [],
      same_page_id_conflicts: [],
    };

    const md = formatCompareReportMarkdown(baseReport);
    expect(md).toContain("| sample:M:1a | 01.jpg | double_read | 100% (20/20) | double read | 0 | 0 | 0 | 0 | 0 | no |");
    expect(md).toContain("| sample:M:2a | 02.jpg | agreement_accepted | 90% (18/20) | accepted by the 90% rule | 2 | 0 | 0 | 0 | 0 | no |");
    expect(md).toContain("| sample:M:3a | 03.jpg | machine_read | 89% (89/100) | sent to a person (below 90% agreement) | 11 | 0 | 0 | 0 | 0 | no |");
    expect(md).toContain("| sample:M:4a | 04.jpg | machine_read | 95% (19/20) | sent to a person (stored answer conflicts with computed answer) | 1 | 0 | 0 | 0 | 0 | no |");
    // Differences are still listed on accepted pages
    expect(md).toContain("### sample:M:2a (agreement_accepted)");
    expect(md).toContain("- Result: accepted by the 90% rule");
    expect(md).toContain("- Agreement: 90% (18/20 compared fields)");
    expect(md).toContain('`topic.title` (value): a="Adding" | b="Addition"');
    // End-of-run list in report and console helper
    expect(md).toContain("## Pages sent to a person");
    expect(md).toContain("- sample:M:3a: 89% agreement, 11 differences");
    expect(md).toContain("- sample:M:4a: 95% agreement, 1 difference (stored answer conflicts with computed answer)");

    const consoleList = formatPagesSentToPerson(baseReport);
    expect(consoleList).toContain("Pages sent to a person (2):");
    expect(consoleList).toContain("sample:M:3a: 89% agreement, 11 differences");
    expect(consoleList).toContain("sample:M:4a: 95% agreement, 1 difference (stored answer conflicts with computed answer)");

    const emptyReport: CompareWorkReport = {
      ...baseReport,
      pages: [baseReport.pages[0], baseReport.pages[1]],
      pages_sent_to_person: [],
    };
    expect(formatPagesSentToPerson(emptyReport)).toBe("Pages sent to a person: none.");
    expect(formatCompareReportMarkdown(emptyReport)).toContain("## Pages sent to a person\n\nNo pages sent to a person.");

    // Prose on accepted and double_read pages is informational and never tells a person they must act.
    const proseReport = formatCompareReportMarkdown({
      ...emptyReport,
      pages: [
        { ...baseReport.pages[0], needs_person_read: true },
        { ...baseReport.pages[1], needs_person_read: true },
      ],
    });
    expect(proseReport).not.toContain("A person must read");
    expect(proseReport).toContain("Has worked examples or prose (both readers agreed).");
    expect(proseReport).toContain(
      "Has worked examples or prose. Differing fields are in single_read and show as not checked.",
    );
  });

  it("renders answer disagreement reason in summary, per-page details with answer paths, and end-of-run list", () => {
    const report: CompareWorkReport = {
      reader_a: { family: "codex", model: "x1" },
      reader_b: { family: "claude", model: "c1" },
      pages: [
        {
          source_ref: "sample:M:5a",
          photo: "555555555555.jpg",
          original_name: "05.jpg",
          photo_sha256: "5".repeat(64),
          status: "machine_read",
          agreement: { agreed: 19, compared: 20, percent: 95 },
          result: "sent to a person",
          result_reason: "readers disagree on an answer",
          answer_disagreements: [
            "sections[0].items[n=1].responses[0].answer",
            "examples[0].steps[n=2].printed",
          ],
          only_in_reader: null,
          digest_mismatch: null,
          differences: [
            { path: "sections[0].items[n=1].responses[0].answer", a: "42", b: "43", kind: "value" },
          ],
          once_read: [],
          both_unclear: [],
          one_unclear: [],
          needs_person_read: false,
          unnamed_teaching_marks: [],
          reader_notes: { a: [], b: [] },
        },
      ],
      pages_sent_to_person: [
        {
          source_ref: "sample:M:5a",
          agreement_percent: 95,
          agreed: 19,
          compared: 20,
          difference_count: 1,
          reason: "readers disagree on an answer",
        },
      ],
      single_reader_pages: [],
      failed_photos: [],
      too_small_photos: [],
      could_not_read_photos: [],
      kept_human_checked: [],
      removed_stale_pages: [],
      duplicate_photos: [],
      removed_photos: [],
      same_page_id_conflicts: [],
    };

    const md = formatCompareReportMarkdown(report);
    expect(md).toContain(
      "| sample:M:5a | 05.jpg | machine_read | 95% (19/20) | sent to a person (readers disagree on an answer) | 1 | 0 | 0 | 0 | 0 | no |",
    );
    expect(md).toContain("- Result: sent to a person (readers disagree on an answer)");
    expect(md).toContain("- Answer disagreements (readers disagree on an answer):");
    expect(md).toContain("  - `sections[0].items[n=1].responses[0].answer`");
    expect(md).toContain("  - `examples[0].steps[n=2].printed`");
    expect(md).toContain("- sample:M:5a: 95% agreement, 1 difference (readers disagree on an answer)");
    expect(formatPagesSentToPerson(report)).toContain(
      "sample:M:5a: 95% agreement, 1 difference (readers disagree on an answer)",
    );
  });

  it("renders expression disagreement reason in summary, per-page details with expression paths, and end-of-run list", () => {
    const report: CompareWorkReport = {
      reader_a: { family: "codex", model: "x1" },
      reader_b: { family: "claude", model: "c1" },
      pages: [
        {
          source_ref: "sample:M:5b",
          photo: "555555555556.jpg",
          original_name: "05b.jpg",
          photo_sha256: "5".repeat(63) + "6",
          status: "machine_read",
          agreement: { agreed: 19, compared: 20, percent: 95 },
          result: "sent to a person",
          result_reason: "readers disagree on an expression",
          expression_disagreements: [
            "sections[0].items[n=1].expr.op",
            "examples[0].parts[0].expr.operands[0]",
          ],
          only_in_reader: null,
          digest_mismatch: null,
          differences: [
            { path: "sections[0].items[n=1].expr.op", a: "mul", b: "add", kind: "value" },
          ],
          once_read: [],
          both_unclear: [],
          one_unclear: [],
          needs_person_read: false,
          unnamed_teaching_marks: [],
          reader_notes: { a: [], b: [] },
        },
      ],
      pages_sent_to_person: [
        {
          source_ref: "sample:M:5b",
          agreement_percent: 95,
          agreed: 19,
          compared: 20,
          difference_count: 1,
          reason: "readers disagree on an expression",
        },
      ],
      single_reader_pages: [],
      failed_photos: [],
      too_small_photos: [],
      could_not_read_photos: [],
      kept_human_checked: [],
      removed_stale_pages: [],
      duplicate_photos: [],
      removed_photos: [],
      same_page_id_conflicts: [],
    };

    const md = formatCompareReportMarkdown(report);
    expect(md).toContain(
      "| sample:M:5b | 05b.jpg | machine_read | 95% (19/20) | sent to a person (readers disagree on an expression) | 1 | 0 | 0 | 0 | 0 | no |",
    );
    expect(md).toContain("- Result: sent to a person (readers disagree on an expression)");
    expect(md).toContain("- Expression disagreements (readers disagree on an expression):");
    expect(md).toContain("  - `sections[0].items[n=1].expr.op`");
    expect(md).toContain("  - `examples[0].parts[0].expr.operands[0]`");
    expect(md).toContain("- sample:M:5b: 95% agreement, 1 difference (readers disagree on an expression)");
    expect(formatPagesSentToPerson(report)).toContain(
      "sample:M:5b: 95% agreement, 1 difference (readers disagree on an expression)",
    );

    // Does not print "Exact match" when expression_disagreements is present even with empty diff lists.
    const onlyExprList = formatCompareReportMarkdown({
      ...report,
      pages: [{ ...report.pages[0], differences: [] }],
    });
    expect(onlyExprList).not.toContain("Exact match across both readers.");
  });

  it("shows review instructions only on machine_read across the full grid of 4 statuses, all difference kinds, and all optional parts", () => {
    const caption = { kind: "caption", applies_to: "all", text: "Practice" };
    const missingCaption = { kind: "caption", applies_to: [1], text: "Hint" };
    const step = { n: 2, shows: "partial_sum", printed: "= 5/6" };
    const mark = { kind: "box", step: 2, description: "Box around sum" };
    const aOnlyItem = { n: 5, printed: "5 + 1 =", form: "horizontal", expr: null, responses: [] };
    const bOnlyItem = { n: 2, printed: "2 + 1 =", form: "horizontal", expr: null, responses: [] };

    const fullPageFields = {
      photo: "666666666666.jpg",
      original_name: "06.jpg",
      photo_sha256: "6".repeat(64),
      agreement: { agreed: 19, compared: 20, percent: 95 },
      result_reason: "readers disagree on an answer",
      only_in_reader: "a" as const,
      digest_mismatch: { a: "1".repeat(64), b: "2".repeat(64) },
      differences: [
        { path: "topic.title", a: "Sums", b: "Totals", kind: "value" as const },
        { path: "sections[0].items", a: [1, 2], b: [2, 1], kind: "order" as const },
        { path: "sections[0].items[n=1].printed", a: "1 + 2 =", b: "unclear", kind: "one_unclear" as const },
        {
          path: "sections[0].items[n=5]",
          a: aOnlyItem,
          b: null,
          kind: "value" as const,
          reader: "a" as const,
          final_path: "sections[0].items[2]",
        },
        {
          path: "sections[0].items[n=2]",
          a: null,
          b: bOnlyItem,
          kind: "value" as const,
          reader: "b" as const,
          reader_b_after: 1,
          reader_b_before: 3,
        },
      ],
      wording: [
        {
          path: "examples[0].marks[0].description",
          a: "Arrow to 3",
          b: "Points at 3",
          kind: "wording" as const,
        },
      ],
      once_read: [
        {
          path: "sections[0].scaffolds[0]",
          a: caption,
          b: null,
          kind: "once_read" as const,
          reader: "a" as const,
          final_path: "sections[0].scaffolds[0]",
        },
        {
          path: "sections[0].scaffolds[b:0]",
          a: null,
          b: caption,
          kind: "once_read" as const,
          reader: "b" as const,
          final_path: "sections[0].scaffolds[]",
        },
        {
          path: "sections[0].scaffolds[b:1]",
          a: null,
          b: missingCaption,
          kind: "once_read" as const,
          reader: "b" as const,
        },
        {
          path: "examples[0].steps[b:1]",
          a: null,
          b: step,
          kind: "once_read" as const,
          reader: "b" as const,
          insert_before: 1,
          final_path: "examples[0].steps[1]",
        },
        {
          path: "examples[0].marks[b:0]",
          a: null,
          b: mark,
          kind: "once_read" as const,
          reader: "b" as const,
          final_path: "examples[0].marks[]",
          missing_step: true,
        },
      ],
      both_unclear: [{ path: "topic.number", a: "unclear", b: "unclear", kind: "both_unclear" as const }],
      one_unclear: [
        { path: "sections[0].items[n=1].printed", a: "1 + 2 =", b: "unclear", kind: "one_unclear" as const },
      ],
      empty_answer: [
        { path: "sections[0].items[n=3].responses[0]", a: null, b: "9", kind: "empty_answer" as const },
      ],
      answer_conflicts: ['sections[0].items[n=1].responses[0]: reader gave "6", computed "5"'],
      reader_answer_conflicts: ["sections[0].items[n=2].responses[0]"],
      unproved_answers: ['final record: sections[0].items[n=1]: answer places hold "5", "6", computed "5"'],
      printed_conflicts: ['reader b: sections[0].items[n=2].printed: page prints "2 + 3 =", expression is "2 × 3"'],
      answer_disagreements: ["sections[0].items[n=1].responses[0].answer"],
      expression_disagreements: ["sections[0].items[n=1].expr.operands[0]"],
      needs_person_read: true,
      unnamed_teaching_marks: [
        { kind: "step" as const, path: "examples[0].steps[n=1]", description: "split tens", reader: "both" as const },
      ],
      reader_notes: { a: ["note a"], b: ["note b"] },
    };

    const validKeptChecked: CompareWorkReport["kept_human_checked"] = [
      {
        source_ref: "sample:M:1a",
        in_current_batch: true,
        differs_from_reader_a: false,
        differs_from_reader_b: false,
        diff_count_a: 0,
        diff_count_b: 0,
      },
      {
        source_ref: "sample:M:2a",
        in_current_batch: true,
        differs_from_reader_a: true,
        differs_from_reader_b: true,
        diff_count_a: 1,
        diff_count_b: 2,
      },
      {
        source_ref: "sample:M:3a",
        in_current_batch: false,
        differs_from_reader_a: false,
        differs_from_reader_b: false,
        diff_count_a: 0,
        diff_count_b: 0,
      },
    ];

    const makeReport = (
      pages: CompareWorkReport["pages"],
      keptHumanChecked: CompareWorkReport["kept_human_checked"] = validKeptChecked,
    ): CompareWorkReport => ({
      reader_a: { family: "codex", model: "x1" },
      reader_b: { family: "claude", model: "c1" },
      pages,
      pages_sent_to_person: [],
      single_reader_pages: [],
      failed_photos: [],
      too_small_photos: [],
      could_not_read_photos: [],
      kept_human_checked: keptHumanChecked,
      removed_stale_pages: [],
      duplicate_photos: [],
      removed_photos: [],
      same_page_id_conflicts: [],
    });

    const REVIEW_INSTRUCTION_PHRASES = [
      "look at the photo",
      "copy an entry",
      "belongs in the final",
      "already in the final",
      "insert before",
      "must be added first",
      "find the place",
      "write the value",
      "write the answer",
      "mark the page checked",
      "Run reference:check",
      "run reference:check",
      "Correct it",
      "then correct the",
      "A person must read",
    ];

    const grid: Array<{
      status: "machine_read" | "agreement_accepted" | "double_read" | "human_checked";
      edited: boolean;
    }> = [
      { status: "machine_read", edited: false },
      { status: "machine_read", edited: true },
      { status: "agreement_accepted", edited: false },
      { status: "agreement_accepted", edited: true },
      { status: "double_read", edited: false },
      { status: "double_read", edited: true },
      { status: "human_checked", edited: false },
      { status: "human_checked", edited: true },
    ];

    // A page whose check does not count now: its kept record is the one that a person checked. The
    // instruction to check it again stands only on machine_read.
    for (const status of ["machine_read", "agreement_accepted", "double_read", "human_checked"] as const) {
      const reason = "photo changed after the check" as const;
      const kept = { ...validKeptChecked[2], source_ref: "sample:M:6a", check_problems: [reason] };
      const md = formatCompareReportMarkdown(
        makeReport(
          [{ ...fullPageFields, source_ref: "sample:M:6a", status, check_problems: [reason] }],
          [...validKeptChecked, kept],
        ),
      );
      const keptLine =
        "- sample:M:6a: kept as it is (not in current batch), but the check does not count now (photo changed after the check). Compare the record with the photo, then run reference:check for this page.";
      expect(md, status).toContain(keptLine);
      const rest = md.replace(keptLine, "");
      expect(rest, status).toContain("the check does not count now: photo changed after the check. The file was kept.");
      expect(rest, status).not.toContain("a person changed the final record");
      expect(rest, status).not.toContain("`sections[0].scaffolds[]`");
      for (const phrase of REVIEW_INSTRUCTION_PHRASES) {
        const onKeptRecord = ["look at the photo", "then correct the", "find the place", "write the value", "write the answer", "mark the page checked", "run reference:check"];
        if (status === "machine_read" && onKeptRecord.includes(phrase)) expect(rest, phrase).toContain(phrase);
        else expect(rest, `${status} must not contain "${phrase}"`).not.toContain(phrase);
      }
    }

    for (const cell of grid) {
      const label = `${cell.status}${cell.edited ? "+edited" : ""}`;
      const md = formatCompareReportMarkdown(
        makeReport([
          {
            ...fullPageFields,
            source_ref: "sample:M:6a",
            status: cell.status,
            ...(cell.edited ? { edited_by_person: true } : {}),
            result:
              cell.status === "double_read"
                ? "double read"
                : cell.status === "human_checked"
                  ? "checked by a person"
                  : cell.status === "agreement_accepted"
                    ? "accepted by the 90% rule"
                    : "sent to a person",
          },
        ]),
      );

      // Factual content is printed on every status, including valid kept human_checked entries.
      expect(md, label).toContain("## Kept: checked by a person");
      expect(md, label).toContain("sample:M:1a: kept human_checked record (matches current readings)");
      expect(md, label).toContain("sample:M:2a: kept human_checked record; current readings differ");
      expect(md, label).toContain("sample:M:3a: stale human_checked page kept");
      expect(md, label).toContain("`topic.title` (value)");
      expect(md, label).toContain("`sections[0].items` (order)");
      expect(md, label).toContain("`sections[0].items[n=1].printed` (one_unclear)");
      expect(md, label).toContain("`sections[0].scaffolds[b:0]`");
      expect(md, label).toContain(JSON.stringify(caption));
      expect(md, label).toContain(JSON.stringify(missingCaption));
      expect(md, label).toContain(JSON.stringify(step));
      expect(md, label).toContain("`topic.number`");
      expect(md, label).toContain("`sections[0].items[n=3].responses[0]`");
      expect(md, label).toContain("Answer conflicts");
      expect(md, label).toContain('final record: `sections[0].items[n=1]`: answer places hold "5", "6", computed "5"');
      expect(md, label).toContain('reader b: `sections[0].items[n=2].printed`: page prints "2 + 3 =", expression is "2 × 3"');
      expect(md, label).toContain("Reader answer conflicts");
      expect(md, label).toContain("Answer disagreements");
      expect(md, label).toContain("Expression disagreements");
      expect(md, label).toContain("Reader answer notes");

      if (cell.status === "machine_read") {
        expect(md, label).toContain("then correct the answer or the expression");
        expect(md, label).toContain("then correct the expression, the answer places or the answers");
        expect(md, label).toContain("then correct the printed line or the expression");
        expect(md, label).toContain("look at the photo");
        expect(md, label).toContain("write the value");
        expect(md, label).toContain('write the answer from the photo, or "unclear"');
        expect(md, label).toContain("mark the page checked");
        if (cell.edited) {
          expect(md, label).toContain("find the place in that record");
          expect(md, label).toContain("Run reference:check for this page.");
          expect(md, label).toContain("; step absent from reader A's record");
          expect(md, label).not.toContain("must be added first");
        } else {
          expect(md, label).toContain("must be added first");
          expect(md, label).toContain("copy an entry");
          expect(md, label).toContain("already in the final record at `sections[0].scaffolds[0]`");
          expect(md, label).toContain("belongs in the final record at `sections[0].scaffolds[]`");
          expect(md, label).toContain("insert before `examples[0].steps[1]`");
        }
      } else {
        for (const phrase of REVIEW_INSTRUCTION_PHRASES) {
          expect(md, `${label} must not contain "${phrase}"`).not.toContain(phrase);
        }
        if (cell.status === "human_checked" || cell.edited) {
          expect(md, label).not.toContain("`sections[0].scaffolds[]`");
          expect(md, label).not.toContain("`examples[0].steps[1]`");
          expect(md, label).not.toContain("`examples[0].marks[]`");
          expect(md, label).not.toContain("Differing fields are in single_read");
        } else {
          expect(md, label).toContain("`sections[0].scaffolds[]`");
          expect(md, label).toContain("`examples[0].steps[1]`");
          expect(md, label).toContain("`examples[0].marks[]`");
        }
      }
    }

    // Documented exemption: an invalid kept human_checked file on disk cannot be read as a record,
    // so only that invalid kept entry asks the person to correct it and run reference:check.
    const invalidKeptMd = formatCompareReportMarkdown(
      makeReport(
        [
          {
            ...fullPageFields,
            source_ref: "sample:M:6a",
            status: "human_checked",
            result: "checked by a person",
          },
        ],
        [
          ...validKeptChecked,
          {
            source_ref: "sample:M:6a",
            in_current_batch: true,
            differs_from_reader_a: false,
            differs_from_reader_b: false,
            diff_count_a: 0,
            diff_count_b: 0,
            invalid: true,
          },
        ],
      ),
    );
    const invalidLine =
      "- sample:M:6a: kept as it is, but the file is not a valid record now. Correct it, then run reference:check for this page.";
    expect(invalidKeptMd).toContain(invalidLine);
    // Remove only the single documented exemption line; the rest of the report must contain no instruction.
    const withoutExemption = invalidKeptMd.replace(invalidLine, "");
    for (const phrase of REVIEW_INSTRUCTION_PHRASES) {
      expect(withoutExemption, `outside exemption must not contain "${phrase}"`).not.toContain(phrase);
    }
  });

  it("renders reader B neighbour positions for reader-B-only items and topics with the same text on every status", () => {
    const missingItem = { n: 2, printed: "Read aloud", form: null, expr: null, responses: [] };
    const missingTopic = { n: 11, title: "Topic 11", sheets: [11, 11], std_time_min: [1, 2] };
    const diffs = [
      {
        path: "sections[0].items[n=1]",
        a: null,
        b: { ...missingItem, n: 1 },
        kind: "value" as const,
        reader: "b" as const,
        reader_b_after: null,
        reader_b_before: 2,
      },
      {
        path: "sections[0].items[n=2]",
        a: null,
        b: missingItem,
        kind: "value" as const,
        reader: "b" as const,
        reader_b_after: 3,
        reader_b_before: 4,
      },
      {
        path: "sections[0].items[n=5]",
        a: null,
        b: { ...missingItem, n: 5 },
        kind: "value" as const,
        reader: "b" as const,
        reader_b_after: 4,
        reader_b_before: null,
      },
      {
        path: "sections[0].items[n=9]",
        a: null,
        b: { ...missingItem, n: 9 },
        kind: "value" as const,
        reader: "b" as const,
        reader_b_after: null,
        reader_b_before: null,
      },
      {
        path: "topics[n=11]",
        a: null,
        b: missingTopic,
        kind: "value" as const,
        reader: "b" as const,
        reader_b_after: 10,
        reader_b_before: 12,
      },
    ];

    const base = {
      reader_a: { family: "codex" as const, model: "x1" },
      reader_b: { family: "claude" as const, model: "c1" },
      pages_sent_to_person: [],
      single_reader_pages: [],
      failed_photos: [],
      too_small_photos: [],
      could_not_read_photos: [],
      kept_human_checked: [],
      removed_stale_pages: [],
      duplicate_photos: [],
      removed_photos: [],
      same_page_id_conflicts: [],
    };

    const statusConfigs: Array<{ status: "machine_read" | "agreement_accepted" | "double_read" | "human_checked"; edited?: boolean }> = [
      { status: "machine_read" },
      { status: "machine_read", edited: true },
      { status: "agreement_accepted" },
      { status: "double_read" },
      { status: "human_checked" },
    ];

    for (const cfg of statusConfigs) {
      const md = formatCompareReportMarkdown({
        ...base,
        pages: [
          {
            source_ref: "sample:M:8a",
            photo: "888888888888.jpg",
            original_name: "08.jpg",
            photo_sha256: "8".repeat(64),
            status: cfg.status,
            ...(cfg.edited ? { edited_by_person: true } : {}),
            agreement: { agreed: 19, compared: 20, percent: 95 },
            only_in_reader: null,
            digest_mismatch: null,
            differences: diffs,
            once_read: [],
            both_unclear: [],
            one_unclear: [],
            needs_person_read: false,
            unnamed_teaching_marks: [],
            reader_notes: { a: [], b: [] },
          },
        ],
      });
      const label = `${cfg.status}${cfg.edited ? "+edited" : ""}`;
      expect(md, label).toContain(
        `\`sections[0].items[n=1]\` (value): reader b has it first, before item 2: ${JSON.stringify({ ...missingItem, n: 1 })}`,
      );
      expect(md, label).toContain(
        `\`sections[0].items[n=2]\` (value): reader b has it after item 3 and before item 4: ${JSON.stringify(missingItem)}`,
      );
      expect(md, label).toContain(
        `\`sections[0].items[n=5]\` (value): reader b has it last, after item 4: ${JSON.stringify({ ...missingItem, n: 5 })}`,
      );
      expect(md, label).toContain(
        `\`sections[0].items[n=9]\` (value): reader b has it as the only item: ${JSON.stringify({ ...missingItem, n: 9 })}`,
      );
      expect(md, label).toContain(
        `\`topics[n=11]\` (value): reader b has it after topic 10 and before topic 12: ${JSON.stringify(missingTopic)}`,
      );
      expect(md, label).not.toContain("insert before");
      expect(md, label).not.toContain("belongs in the final");
      expect(md, label).not.toContain("location not known");
    }
  });
});
