# Preview from marks

The admin child page links to a saved preview for one skill and step in a delivered Book 1. The admin chooses a cutoff date in Vancouver time and Days 1 to 7 or all available days. For the current date, the cutoff is the time of the request. For an earlier date, it is the end of that date. The saved record keeps the exact cutoff and consumed mark versions. The page compares two saved previews for the same child, book and skill. It lists added, removed and moved plan steps and changed pages. New and changed marks are evidence, not proof that a particular mark caused a plan change.

The page calls `saveAdminWorkbookPreview` with the server-only `workbookPreviewRepository`. This reads the delivered book, its saved Book 1 starting record and the correction ledger. It saves a version 2 preview and reads it back. It does not queue, render or approve a workbook.

The admin preview applies one skill decision and stays on version 2. There is no version 3 preview migration.

For #476 and D-308, call the single pure entry point in `src/lib/workbook-next-book-snapshot.ts`:

```ts
planNextBookFromSnapshot(input: {
  sources: FrozenWorkbookSourcesV2;
  snapshot: NextBookSnapshot;
}): NextBookSnapshotResult
```

`NextBookSnapshot` holds `id`, `workbookId`, `cutoff`, `scope` (`day7`, `later-book`, or `backstop`), and the complete `issuedSkills` list. The caller must capture all source rows atomically and freeze these fields. A successful `NextBookSnapshotResult` holds `planHash`, `planningInput`, `plan`, `consumed`, and `held`; a refusal holds `reason`. `ConsumedItem` identifies the mark versions and any correction IDs used. `HeldItem` identifies later or unused marks and corrections, or a review with no printed question. This function does not queue, render, approve, read a store or call a provider. The caller stores its output with the frozen capture and owns queue admission.

Current-level teaching skills use the existing progress decision. Skills printed only as review never enter the mastery decision. A review passes only when all its printed questions are marked right without help. A wrong answer enters missed reviews with its question reference. An unmarked, blank, pending or assisted question is held. A scheduled review with no printed question is held and keeps its stored review.

Lead decision: when a printed review has no stored interval and all its questions are marked right, start the first interval, two practice days after the review. Code uses the planner's `SPACED_INTERVALS[0]`. An unmarked or assisted unscheduled review remains held. Lead decision: count printed practice days through the source book's Day 10, even when a day has no scan. Five printed practice days follow a Day 5 review before Book 2. Use the same count for a pre-approval refresh.

The comparison only identifies changed plan pages and evidence. It does not redraw pages or preserve edits.
