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

    // A record that a person edited or checked is kept: wording does not claim reader A's words are kept.
    for (const keptPage of [
      { ...report.pages[1], edited_by_person: true },
      { ...report.pages[1], status: "human_checked" as const },
    ]) {
      const keptMd = formatCompareReportMarkdown({
        ...report,
        pages: [keptPage],
      });
      expect(keptMd).toContain(
        "- Wording differences: the readers describe the same thing in other words; the edited record is kept; no action needed",
      );
      expect(keptMd).not.toContain("reader A's words are kept");
      expect(keptMd).toContain(
        "`sections[0].scaffolds[b:1]`: only reader b has it; found in the kept final record at `sections[0].scaffolds[]`",
      );
      expect(keptMd).toContain(
        '`sections[0].scaffolds[b:2]`: only reader b has it; a person changed the final record, so find the place in that record: {"kind":"arrow","applies_to":[1]}',
      );
    }

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

  it("omits review instructions on agreement_accepted and double_read pages while keeping them on machine_read pages", () => {
    const caption = { kind: "caption", applies_to: "all", text: "Practice" };
    const step = { n: 2, shows: "partial_sum", printed: "= 5/6" };
    const mark = { kind: "box", step: 2, description: "Box around sum" };
    const sharedEntries = {
      photo: "666666666666.jpg",
      original_name: "06.jpg",
      photo_sha256: "6".repeat(64),
      only_in_reader: null,
      digest_mismatch: null,
      differences: [{ path: "topic.title", a: "Sums", b: "Totals", kind: "value" as const }],
      once_read: [
        {
          path: "sections[0].scaffolds[b:0]",
          a: null,
          b: caption,
          kind: "once_read" as const,
          reader: "b" as const,
          final_path: "sections[0].scaffolds[]",
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
      one_unclear: [],
      needs_person_read: false,
      unnamed_teaching_marks: [],
      reader_notes: { a: [], b: [] },
    };

    const makeReport = (
      pages: CompareWorkReport["pages"],
    ): CompareWorkReport => ({
      reader_a: { family: "codex", model: "x1" },
      reader_b: { family: "claude", model: "c1" },
      pages,
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
    });

    for (const status of ["agreement_accepted", "double_read"] as const) {
      const md = formatCompareReportMarkdown(
        makeReport([
          {
            ...sharedEntries,
            source_ref: "sample:M:6a",
            status,
            agreement: { agreed: 19, compared: 20, percent: 95 },
            result: status === "double_read" ? "double read" : "accepted by the 90% rule",
            result_reason: null,
          },
        ]),
      );
      expect(md).toContain("`sections[0].scaffolds[b:0]`");
      expect(md).toContain("`sections[0].scaffolds[]`");
      expect(md).toContain(JSON.stringify(caption));
      expect(md).toContain("`examples[0].steps[1]`");
      expect(md).toContain(JSON.stringify(step));
      expect(md).toContain("`examples[0].marks[]`");
      expect(md).toContain("`topic.number`");
      expect(md).not.toContain("look at the photo");
      expect(md).not.toContain("copy an entry");
      expect(md).not.toContain("belongs in the final");
      expect(md).not.toContain("insert before");
      expect(md).not.toContain("must be added first");
      expect(md).not.toContain("write the value");
      expect(md).not.toContain("mark the page checked");
    }

    const personMd = formatCompareReportMarkdown(
      makeReport([
        {
          ...sharedEntries,
          source_ref: "sample:M:7a",
          status: "machine_read",
          agreement: { agreed: 17, compared: 20, percent: 85 },
          result: "sent to a person",
          result_reason: "below 90% agreement",
        },
      ]),
    );
    expect(personMd).toContain("look at the photo");
    expect(personMd).toContain("copy an entry");
    expect(personMd).toContain("belongs in the final record at `sections[0].scaffolds[]`");
    expect(personMd).toContain("insert before `examples[0].steps[1]`");
    expect(personMd).toContain("must be added first");
    expect(personMd).toContain("write the value");
  });

  it("renders insertion locations for missing items and contents topics with instructions only on machine_read pages", () => {
    const missingItem = { n: 1, printed: "Read aloud", form: null, expr: null, responses: [] };
    const missingTopic = { n: 4, title: "Topic 4", sheets: [4, 4], std_time_min: [1, 2] };
    const makePageReport = (status: "agreement_accepted" | "machine_read") => ({
      source_ref: status === "machine_read" ? "sample:M:8a" : "sample:M:9a",
      photo: "888888888888.jpg",
      original_name: "08.jpg",
      photo_sha256: "8".repeat(64),
      status,
      agreement: { agreed: 19, compared: 20, percent: 95 },
      result: (status === "machine_read" ? "sent to a person" : "accepted by the 90% rule") as
        | "sent to a person"
        | "accepted by the 90% rule",
      result_reason: status === "machine_read" ? "below 90% agreement" : null,
      only_in_reader: null,
      digest_mismatch: null,
      differences: [
        {
          path: "sections[0].items[n=1]",
          a: null,
          b: missingItem,
          kind: "value" as const,
          reader: "b" as const,
          insert_before: 0,
          final_path: "sections[0].items[0]",
        },
        {
          path: "topics[n=4]",
          a: null,
          b: missingTopic,
          kind: "value" as const,
          reader: "b" as const,
          final_path: "topics[]",
        },
      ],
      once_read: [],
      both_unclear: [],
      one_unclear: [],
      needs_person_read: false,
      unnamed_teaching_marks: [],
      reader_notes: { a: [], b: [] },
    });

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

    const acceptedMd = formatCompareReportMarkdown({ ...base, pages: [makePageReport("agreement_accepted")] });
    expect(acceptedMd).toContain(
      `\`sections[0].items[n=1]\` (value): only reader b; location in final record before \`sections[0].items[0]\`: ${JSON.stringify(missingItem)}`,
    );
    expect(acceptedMd).toContain(
      `\`topics[n=4]\` (value): only reader b; location in final record \`topics[]\`: ${JSON.stringify(missingTopic)}`,
    );
    expect(acceptedMd).not.toContain("insert before");
    expect(acceptedMd).not.toContain("belongs in the final");

    const personMd = formatCompareReportMarkdown({ ...base, pages: [makePageReport("machine_read")] });
    expect(personMd).toContain(
      `\`sections[0].items[n=1]\` (value): only reader b has it; insert before \`sections[0].items[0]\`: ${JSON.stringify(missingItem)}`,
    );
    expect(personMd).toContain(
      `\`topics[n=4]\` (value): only reader b has it; belongs in the final record at \`topics[]\`: ${JSON.stringify(missingTopic)}`,
    );
  });
});
