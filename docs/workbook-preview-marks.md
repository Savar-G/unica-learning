# Preview from marks

The admin child page links to a saved preview for one skill and step in a delivered Book 1. The admin chooses a cutoff date in Vancouver time and Days 1 to 7 or all available days. For the current date, the cutoff is the time of the request. For an earlier date, it is the end of that date. The saved record keeps the exact cutoff and consumed mark versions. The page compares two saved previews for the same child, book and skill. New and changed marks are evidence, not proof that a particular mark caused a plan change.

The page calls `saveAdminWorkbookPreview` with the server-only `workbookPreviewRepository`. This reads the delivered book, its saved Book 1 starting record and the correction ledger. It saves a version 2 preview and reads it back. It does not queue, render or approve a workbook.

The preview applies one skill decision. Multi-skill planning needs one validated decision per issued skill, a single planner pass that holds each unfinished prerequisite, and a versioned saved outcome that replays the frozen inputs. Review timing, missed-review calculation, the full spaced schedule and later-book starting records are not implemented here. The draft version 3 migration refuses version 3 saves until that work is complete. Do not apply it for this slice.

For #476 and D-308, use the same authenticated source capture and saved-preview boundary, with a frozen cutoff and scope. The current single-skill output is not a full next-book snapshot. Do not use it to queue or refresh a real multi-skill draft. The comparison only identifies changed plan pages and evidence; it does not redraw pages or preserve edits.
