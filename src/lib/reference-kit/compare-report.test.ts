import { describe, expect, it } from "vitest";
import { formatCompareReportMarkdown, type CompareWorkReport } from "./compare-report";

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
      "| Page | Photo | Status | Differences | Wording | Once-read | Both unclear | Empty answers | Person read |",
    );
    expect(md).toContain("| sample:M:3a | IMG_0001.jpg | double_read | 0 | 0 | 0 | 0 | 0 | no |");
    expect(md).toContain("| sample:M:4a | IMG_0002.jpg | machine_read | 1 | 1 | 4 | 1 | 1 | yes |");
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
    expect(md).toContain("A person must read the prose on this page");
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
    expect(wordingOnly).toContain("| sample:M:3a | IMG_0001.jpg | double_read | 0 | 1 | 0 | 0 | 0 | no |");
    expect(wordingOnly).toContain(
      "- Wording differences: the readers describe the same thing in other words; reader A's words are kept; no action needed",
    );
    expect(wordingOnly).not.toContain("Exact match across both readers.");
  });
});
