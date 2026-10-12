# Offline template review

This tool reviews generated bank questions. It does not run on the site. It does not read assessment records, child records, drawings or environment files. Use only public curriculum notes with `--context`.

Run `npm run check:templates -- --help` first. The original default provider and cache version remain available. The Codex mode uses the installed CLI and its ChatGPT subscription login. It does not require a Platform API key. This work used only Codex.

```bash
codex login status
npm run check:templates -- --provider codex --band 3-5 --context scripts/template-check/curriculum-notes.md
npm run check:templates -- --provider codex --band 1-2 --context scripts/template-check/curriculum-notes.md
```

Codex defaults to `gpt-6.1-sol` with `medium` effort. Change these with `--model` and `--effort`. The process requires a ChatGPT login before each batch. It removes secret-like environment variables. It runs in an empty temporary directory, with a read-only sandbox, no shell tool and strict JSON output. It removes the temporary directory after each call.

Each batch samples eight distinct questions from 300 seeds. It sends the public template tags, generated answers, coded wrong choices, actual figure data and axis labels, ordered choice speech and curriculum notes. No child data is sent. The model check is a sample review. The public assessment tests cover more seeds and adaptive routes.

Codex keeps the sampled smallest and largest typed answers. If the chosen prompts miss a decimal magnitude boundary in the generated pool, it replaces an interior sample with the prompt at that boundary. This catches a small unknown input with a larger given output. The sample count stays fixed. With `--samples 1` or `2`, there is no interior slot; these small runs keep the requested answer samples and do not add a boundary example. Use the default eight for the full check. The number parser treats three-digit comma groups as thousands separators. Other commas separate numbers. Original default-provider payloads stay unchanged.

Codex also covers the smallest and largest number of decimal places in the generated typed answers, ignoring trailing zeros. For example, a pool containing tenths and hundredths must include a hundredths answer. A missed precision boundary replaces an unprotected interior sample with the first real generated example at that precision. Selection is deterministic. It preserves the answer extrema, the selected largest prompt value, distinctness and the requested sample count. With fewer interior slots, it keeps only the boundaries that fit. This rule applies only to Codex. It does not change default-provider payloads or existing verdicts. Changed payload hashes require new model results; preserve earlier results before that check.

Results keep the version 1 contract in `results.json`. The template ID and payload hash remain the cache key. Source notes change the hash. Figure data is part of the sample identity. Codex also checks the model and effort before it reuses a record. Earlier Codex records without an effort field used medium effort. The original default-provider reuse behavior stays unchanged.

The report covers the full selected bank, including with `--only` or `--limit`. Missing, outdated or invalid model output cannot count as a pass. The tool writes failures first to `report.md` and `report-<band>.md`. It writes the same filtered rows and exact counts to `summary-<band>.json`. It exits with status 1 if any template has failed, has an error or remains unchecked. Read every review item against sources before readiness. Do not change a model result by hand.

`band1-2-changed-ids.json` records the separate 45-template selection from the original checker dry run after #79. It is not a model result. Report the actual Codex results for that set separately from the grades 3-5 bank.

Run only one checker at a time. The bands share template IDs and the results file. Repeat the same command after a stop. Completed batches remain in the cache. Use `--fresh` or `--only` when a failed finding needs a new model review without a payload change.

For #76, select `--band 6-7`. No band 6-7 model review is claimed by this change.
