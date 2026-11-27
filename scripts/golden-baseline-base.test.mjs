import assert from "node:assert/strict";
import test from "node:test";
import { compareGoldenBaselines } from "./golden-baseline-base.mjs";

const H1 = "1".repeat(64);
const H2 = "2".repeat(64);
const H3 = "3".repeat(64);
const H4 = "4".repeat(64);

const baseline = (pages = [{ page: 1, modelSha256: H1, imageSha256: H2 }], renderer = "typst@0.15.1") => ({
  format: 1,
  renderer,
  books: [{ book: "invented-a/strong", inputHash: H1, pdfSha256: H2, pages }],
});

test("unchanged Typst baselines pass with an empty accepted list", () => {
  const base = { "invented-a.json": baseline() };
  assert.deepEqual(compareGoldenBaselines(base, base, []), []);
});

test("replacing a baseline page without approval fails; savar accepts model-only, cedric accepts pixel changes", () => {
  const base = { "invented-a.json": baseline() };
  const modelOnly = { "invented-a.json": baseline([{ page: 1, modelSha256: H3, imageSha256: H2 }]) };
  const pixelChanged = { "invented-a.json": baseline([{ page: 1, modelSha256: H3, imageSha256: H4 }]) };

  assert.equal(compareGoldenBaselines(base, modelOnly, []).length, 1);
  assert.deepEqual(compareGoldenBaselines(base, modelOnly, [{ book: "invented-a/strong", page: 1, approver: "savar", reason: "metadata", modelSha256: H3, imageSha256: H2 }]), []);

  assert.equal(compareGoldenBaselines(base, pixelChanged, [{ book: "invented-a/strong", page: 1, approver: "savar", reason: "wrong approver", modelSha256: H3, imageSha256: H4 }]).length, 1);
  assert.deepEqual(compareGoldenBaselines(base, pixelChanged, [{ book: "invented-a/strong", page: 1, approver: "cedric", reason: "approved pixels", modelSha256: H3, imageSha256: H4 }]), []);
});

test("removing a baseline file, removing a book, or downgrading renderer to fake fails", () => {
  const base = { "invented-a.json": baseline() };
  assert.match(compareGoldenBaselines(base, {}, []).join("\n"), /was removed/);
  assert.match(compareGoldenBaselines(base, { "invented-a.json": { format: 1, renderer: "typst@0.15.1", books: [] } }, []).join("\n"), /book invented-a\/strong was removed/);
  assert.match(compareGoldenBaselines({}, { "invented-a.json": baseline(undefined, "fake") }, []).join("\n"), /must use pinned Typst/);
});
