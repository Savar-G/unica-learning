# Next-book curriculum compatibility: missing proof

Implementation stopped at the brief's required missing-proof check. No compatibility rule was added. The existing digest refusal remains in place.

The required rule permits current curriculum data only if all referenced units, skills and steps retain their identity, order, numbers and levels. Template changes are permitted. This includes the frozen placement facts, not only the printed questions.

## Missing stored structure

- `src/lib/workbook-teaching-frame.ts:9` stores a map from skill ID to unit code. It does not store unit order, skill order or step identity. The frame declares this map in `src/lib/workbook-job.ts:261`. JSON object key order cannot prove curriculum order after storage as jsonb.
- `src/lib/workbook-plan.ts:168` stores ordered units and skills for the selected level only. Its `skillLevels` map at line 178 stores other skills' levels, but no order. Its `codeReviewSteps` map at line 179 stores step numbers for earlier template-bearing steps, but no unit or skill order.
- `src/lib/workbook-book1-baseline.ts:165` captures full skill and step records only for skills issued by the printed book. The baseline type at line 76 has no full frozen level or unit table.
- `src/lib/child-profile.ts:104` defines a placement standard without workbook unit order. The profile's standards use assessment curriculum order, not workbook level order.

Thus a placement unit outside the selected level and outside the issued skill records has no frozen workbook order. For example, the first customer's placement references unit `5.2`, but the baseline and frame do not store its position within U18. Inferring it from today's curriculum would assume the fact the check must prove.

## Public-interface proof

`src/lib/workbook-next-book-snapshot.test.ts` uses the existing U16 Book 1 fixture. It moves independent unit `5.16` before `5.2` in U18. It updates the affected skill orders and skill and step position codes.

The source curriculum validator checks both versions. The test requires different unit and skill orders, but equal saved structural fields: the U16 `planLevel`, the full `skillUnits` map and all issued skill records. An implementation that checks only these fields cannot detect this order change.

The existing U16 snapshot case also runs. It proves the existing unchanged-curriculum path, including review marks, missing work and stable plan output. It does not prove template-change compatibility.

## Read-only customer check, 2026-11-09

The check read baseline `d018b981-dea5-49f8-9fd8-792ad0ae80e5` and its run frame with SELECT queries only. The baseline reader accepted the payload and hash. The frame hash matched the baseline binding.

- Frozen curriculum digest: `0c03a54a51742c070ffff230599f`.
- Current curriculum digest at base commit `561911a3`: `1678b48028b416061d0bccb39c22`.
- Existing `book2Planning` result: `curriculum-version-changed`, at `src/lib/workbook-book1-baseline.ts:263`.
- The frozen placement has 30 standard references. Thirteen lack unit-order proof in the saved level and issued skill records: `4.1`, `4.10`, `4.11`, `4.13`, `5.2`, `5.3`, `5.4`, `5.6`, `5.7`, `5.11`, `5.13`, `5.16`, `5.19`.

The customer cannot be approved under the requested compatibility rule from these stored structural fields alone. This finding does not show that the curriculum is incompatible. It shows that the stored evidence cannot prove compatibility.

## Required input before implementation

Provide trusted frozen unit order for every placement-referenced unit outside the captured level and issued skill records. A complete frozen curriculum structure would also supply skill order and step identities where needed. The brief prohibits changes to existing baseline records and requires new-book planning without old code, so reconstructing that structure requires a separate authorized source.

Exact replay and the baseline recovery verifier retain their current behavior. There were no production code changes, database writes or pushes.

## Checks

- `gate-slot.sh npx vitest run src/lib/workbook-next-book-snapshot.test.ts --maxWorkers=2 --testTimeout=1200000`: exit 0, two tests passed.
- `npx eslint src/lib/workbook-next-book-snapshot.test.ts`: exit 0.
- `gate-slot.sh sh -c 'npx next typegen && npx tsc --noEmit'`: exit 0. Route type generation and TypeScript checking finished.

The new test proves missing structural evidence. The existing test proves unchanged-curriculum U16 snapshot behavior. Neither proves the requested template-change acceptance. No implementation claim is made for that blocked requirement.
