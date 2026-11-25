# Issue tracker: Linear

Issues and specs for this repo live in **Linear** (`https://linear.app/unica-learning`, team **Unica Learning** / key `UNI`). Linear is the sole source of truth for issues—do **not** file new GitHub Issues in `Savar-G/unica-learning` (use GitHub only for pull requests and CI).

## Workspace IDs & auth

- **Workspace:** `unica-learning` (`https://linear.app/unica-learning`)
- **Team:** `Unica Learning` — key `UNI`, ID `41baea33-ebb0-4169-9d76-778f4cdb52d5`
- **Auth:** Prefer Linear/T3 issue tools if configured for `unica-learning`; otherwise query Linear's GraphQL API (`https://api.linear.app/graphql`) with the Personal API key stored in macOS Keychain under service `linear-unica` (or `LINEAR_API_KEY` env var):

```sh
LINEAR_KEY="${LINEAR_API_KEY:-$(security find-generic-password -s linear-unica -w)}"
```

## Product boards (`Area` label group)

Every issue should carry one mutually exclusive **`Area`** label so it appears on the corresponding pinned Kanban board view under `UNI` → Views:

| Area label | Product board scope |
| --- | --- |
| `Maya (AI Tutor)` | Chat, voice, shared whiteboard, Maya rebuild, practice suite |
| `AI Marking & Scanning` | Page scan capture, photo/QR checks, crops, AI marking & review queue |
| `Workbook Generator` | Layout, question builders, Book 1/2 planning, print & PDF |
| `Parent Dashboard & Platform` | `/account` parent dashboard, onboarding, billing, first-customer launch, shared DB/CI/ops |
| `Website & Growth` | Landing page, marketing site, blog/resources, referrals & social |
| `Assessment & Report` | Placement assessment bank, child test flow & diagnostic report |

Use **Linear Projects** for cross-issue specs and initiatives (for example, *First Customer Release*, *Maya Teaching & Whiteboard Rebuild*, *Web Scanning & AI Marking*).

## Workflow statuses & PR linking

- **Statuses:** `Triage` → `Backlog` → `Todo` → `In Progress` → `In Review` → `Done` / `Canceled` / `Duplicate`.
- **PR linking:** Include the Linear identifier (`UNI-123`) in the branch name or PR body (`Fixes UNI-123` / `Refs UNI-123`) so Linear's GitHub integration auto-links PRs and advances status on open/merge.
- **GitHub number disambiguation:** Linear issues use `UNI-###`. Bare `#42` references in git history or older docs refer to GitHub PRs or legacy imported GitHub issues (each imported Linear issue links back to its original GitHub `#N` at the top of its description).

## GraphQL conventions

Helper pattern (all examples assume `$LINEAR_KEY` is loaded):

```sh
linear_gql() {
  local payload
  payload=$(jq -n --arg query "$1" --argjson variables "${2:-{}}" '{query: $query, variables: $variables}')
  curl -sS -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_KEY" \
    -d "$payload"
}
```

- **Create an issue:** `mutation { issueCreate(input: { teamId: "41baea33-ebb0-4169-9d76-778f4cdb52d5", title: "...", description: "...", labelIds: ["<area-label-id>", ...], stateId: "<state-id>", parentId: "<optional-parent-uuid>", projectId: "<optional-project-uuid>" }) { success issue { id identifier url } } }`
- **Read an issue:** `query { issue(id: "UNI-123") { id identifier title description state { name type } priority assignee { name email } labels { nodes { name } } project { name } parent { identifier title } children(includeArchived: true) { nodes { identifier title state { name type } } } relations(includeArchived: true) { nodes { type relatedIssue { identifier title state { name type } } } } inverseRelations(includeArchived: true) { nodes { type issue { identifier title state { name type } } } } comments { nodes { body createdAt user { name } } } } }`
- **More than 50:** Linear gives 50 entries of a connection by default. Ask for `pageInfo { hasNextPage endCursor }` and read the next page with `after`, also for `children`.
- **List open issues (optionally filtered by Area or triage label):** `query { issues(filter: { team: { key: { eq: "UNI" } }, state: { type: { nin: ["completed", "canceled"] } }, labels: { name: { eq: "ready-for-agent" } } }, first: 100) { nodes { id identifier title state { name } labels { nodes { name } } assignee { name } } } }`
- **Make an issue a sub-issue of a parent:** Pass `parentId: "<parent-uuid>"` on `issueCreate`, or call `issueUpdate(id: "<child-uuid>", input: { parentId: "<parent-uuid>" })`.
- **Blocking (native Linear relations):** Add an edge with `mutation { issueRelationCreate(input: { type: blocks, issueId: "<blocker-uuid>", relatedIssueId: "<blocked-uuid>" }) { success } }`.
- **Count open blockers:** Read `inverseRelations` on the target issue where `type == "blocks"` and `issue.state.type` is not `"completed"` or `"canceled"`. Zero open blockers means the ticket is startable.
- **Comment on an issue:** `mutation { commentCreate(input: { issueId: "<issue-uuid>", body: "..." }) { success } }`
- **Apply / remove labels:** `mutation { issueUpdate(id: "<issue-uuid>", input: { addedLabelIds: ["..."], removedLabelIds: ["..."] }) { success } }`
- **Close / change state:** Post a summary comment with `commentCreate`, then call `issueUpdate(id: "<issue-uuid>", input: { stateId: "<done-or-canceled-state-id>" })`.
- **Archive when closed:** The free plan limits the number of issues. When an issue is `Done`, `Canceled` or `Duplicate` and its last comment is posted, wait 3 minutes (Linear posts the status to Slack about 30 seconds later, and posts nothing for an issue that is archived before), then call `mutation { issueArchive(id: "<issue-uuid>") { success } }`. Linear archives the sub-issues of a parent too. So archive a parent only when it has no open sub-issue and each sub-issue that is not archived yet was also closed (with its last comment) at least 3 minutes ago. An archived issue keeps its links and can still be read by its id. A list hides it without `includeArchived: true` (the read query above has it for the children and the relations). Before you edit or reopen an archived issue, restore it with `mutation { issueUnarchive(id: "<issue-uuid>") { success } }`. When it is closed again, archive it again.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a Linear issue in team `UNI` with the matching `Area` label and triage label.

## When a skill says "fetch the relevant ticket"

Fetch `UNI-<number>` from Linear including its description, labels, relations, and comments.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent Linear issue with **child** sub-issues as tickets.

- **Map:** A Linear issue labelled `wayfinder:map` (create the label if absent) holding the Notes / Decisions-so-far / Fog body.
- **Child ticket:** A sub-issue linked via `parentId: "<map-uuid>"`, labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`) plus its `Area` label. Once claimed, assign it to the driving user.
- **Blocking:** Linear's native `blocks` relation (`issueRelationCreate` with `type: blocks`, `issueId: <blocker-uuid>`, `relatedIssueId: <child-uuid>`). A ticket is unblocked when every blocker's `state.type` is `completed` or `canceled`.
- **Frontier query:** List the map's open `children`, drop any with an open blocker in `inverseRelations` (where `type == "blocks"`) or an `assignee`; first in map order wins.
- **Claim:** Assign the issue (`assigneeId`) and move its state to `In Progress` as the session's first write.
- **Resolve:** Post a resolution comment (`commentCreate`), move the state to `Done`, and append a context pointer (gist + `UNI-###` link) to the map's Decisions-so-far.
