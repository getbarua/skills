# A reviewable setup proposal

Give the owner a readable proposal alongside the implementation PR and final
handoff. They should be able to judge which product facts become events, who
receives each play, and what the proposed emails say.

First complete [journey-review.md](journey-review.md), before proposing the
event plan. Its private Markdown and JSON files record the intended experience,
including missing implementation, external senders and deliberate exclusions.
Keep them beside this report in the handoff. The exported package describes
stored configuration; it cannot establish that the strategy covers the product.
Do not put the journey JSON into `--input-file`: that option has the separate
strict source-evidence schema below.

## Default path

With `BARUA_MANAGEMENT_KEY` loaded in the helper's environment, run:

```sh
node .agents/skills/barua-setup/scripts/manage.mjs review-package \
  --output-dir /private/authorized/barua-review-001 \
  --input-file evidence.json \
  --timeout-ms 300000
```

Use your installed skill path and an authorized private directory. Its parent
must exist; the output directory must not. The whole skill must be installed,
including `scripts/review-package.mjs` beside `manage.mjs`. The command needs
Node 18.17 or newer and no package dependencies. It reads the real workspace
selected by the management key, including when event testing uses a test key.

`--input-file` is optional. Without it, the package states that source
implementation evidence was not supplied. Add `--proof-id <operation UUID>` to
read an existing delivery proof. This does not start or bind one. The shared
helper timeout defaults to 60 seconds; the example uses its 300-second maximum.
The report shows the selected proof's status and timestamps without claiming
freshness, even when its email revision still matches an approval. Reading this
record does not verify current launch settings or the event key. It does not
recheck the email provider.

Generate a package once the plan is proposed, before asking for a required
checkpoint or approving under delegation. If an action returns `awaiting_approval`,
refresh into a new directory so the handoff includes that operation.
Refresh after changing the plan or plays,
before launch, and after the delivery check. Complete the management procedure's
[Finish and hand off](management.md#finish-and-hand-off) step after the last
change in every run, including checkpoint and continuation runs. Every handoff
links the current artifact and names what still needs a decision. Full delegation
follows the same artifact workflow and continues through permitted actions
without a human pause.

## What the owner receives

`index.html` is the readable report; `review.json` is its matching snapshot.
Successful command output is JSON with `ok`, `exit: 0`, `package_id`,
`captured_at`, `artifacts.html` and `artifacts.json`, plus counts for `plays`,
`previews` and `pending_reviews`. Link the returned artifact paths.
The report includes:

- Core and custom event contracts, property constraints and omissions, with any
  source implementation evidence supplied by the agent. A changed custom event
  shows both its proposed and approved contracts, even when its name stays the
  same. Removed events retain their approved contract.
- Proposed and approved play versions, their audience rules and timing,
  exclusions, inherited play history, personalization and any supplied rationale.
  Service emails use the current review screen's purpose wording; exact details
  and JSON retain the saved policy and brief unchanged.
- Synthetic example emails for each available step and language in those
  revisions. Missing or failed authoring is explicit. Remote images are blocked
  in the exported previews.
- Workspace language selection, supported and fallback languages, marketing send
  hours and weekday rules, and the timezone fallback order.
- Every captured event status, including unknown and unnamed events, with counts,
  latest results and available reason/fix diagnostics. Management supplies reduced
  test/live verdicts; absent detailed invalid, missing and truncation lists are
  not evidence of a clean result. A failed verdict carries that limitation and
  requires a current event-status check before launch.
- Current launch facts and pending review operations. Include an existing
  delivery proof when requested. Historical setup stamps do not establish fresh delivery.

Record versions as well as names. The package captures its workspace and time,
connection policy, workspace version, plan version, play revision IDs and content
hashes. A replacement waiting for approval does not imply that the prior approved
play stopped sending. Inspect each version's actual state.

Before approving a play, use these exact rules and previews to reconcile it
with the journey opportunity. Save the revision ID, content hash, proposed or
approved role, current review token and observed findings in the journey JSON.
Shared email revisions can still have different policies; check each role's
rules separately. A readable report is not a passing coverage or
play review. Missing drafts and mismatches remain unfinished work.

Link the HTML and JSON in the final handoff and implementation PR using the
authorized private artifact location. A local file link works only for someone
with access to that filesystem; say so if the reviewer needs an authorized
private transfer. Do not publish the package or commit it by default.

## Optional source evidence

Use plain factual sentences. Explain the real trigger and why it helps the
recipient. Name omissions and assumptions directly. Avoid promotional claims,
dramatic fragments and contrast slogans. Never invent a test result or infer
deployment from an emitter's presence.

The input is a strict JSON object of at most 512 KiB. All top-level fields below
are required when an evidence file is supplied; arrays may be empty:

| Field | Meaning |
| --- | --- |
| `workspaceId` | The current workspace ID |
| `planVersion` | Proposed plan version when present, otherwise the approved version |
| `sourceCommit` | Inspected Git commit, 7 to 64 hexadecimal characters |
| `summary` | A short explanation of the intended setup |
| `events` | Up to 100 entries with `name`, `source`, `trigger`, `why`, `status`, and optional `checks` |
| `plays` | Up to 200 entries with `playId`, exact `revisionId`, and `why` |
| `assumptions` | Up to 50 statements the owner may need to confirm |
| `remaining` | Up to 50 statements of work that is still outstanding |

An event's `status` is one of `planned`, `implemented`, `tested`, `deployed` or
`not_applicable`. Each event may have up to 20 checks, each with `command` and
`result` strings. Free-text values must contain 1 to 4000 characters.
Event names must be unique and belong to the selected plan. Play/revision pairs
must be unique and match the revisions in the package. Unknown fields and stale
workspace, plan or revision identities are refused.

Example shape, with IDs and version replaced by the workspace's current values:

```json
{
  "workspaceId": "00000000-0000-4000-8000-000000000001",
  "planVersion": 2,
  "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
  "summary": "Help new accounts finish their first published project.",
  "events": [{
    "name": "activated",
    "source": "src/projects/publish.ts:publishProject",
    "trigger": "The first project publication commits successfully.",
    "why": "Stop setup reminders once the account has published.",
    "status": "implemented",
    "checks": []
  }],
  "plays": [],
  "assumptions": ["The first published project is the activation milestone."],
  "remaining": ["Run the publication flow with a test event key."]
}
```

These notes are agent-reported evidence, separate from facts read from Barua.
A status of `deployed` in this file is not API-observed proof. Keep secrets and
customer data out of the notes. Include file locations, not source code.

## Decisions and changes

The package is a snapshot for review. It never approves, resumes, sends,
changes policy or performs customer lookup. Its preview POST requests render
synthetic examples only. No `people:read` permission is needed for those examples.

Use the report's workspace review links to inspect the current version in Barua.
The existing review flow binds decisions to the exact operation input, target
version and connection policy. A stale export cannot approve a newer proposal.
After changes, collect a new package and submit a new operation when the target
changed. Retain the old package as a dated record.

When requesting changes, name the event plan version or play revision and the
specific change wanted. Use the existing Plays review screen or, within the
agent's current grant, `play.request-changes` with that revision's current token.
Read the resulting detail and generate the replacement package before review.
Plan edits use a new full proposal. Never treat comments in an artifact as an
approval receipt.

## Event-only access

With only `BARUA_API_KEY`, complete the same journey review before submitting
the plan, then create a private `event-plan.md` using the integration API's
plan contract and the repo evidence already gathered by the setup skill.
Cover each relevant core and custom event: meaning, exact server trigger,
properties, rationale, implementation/check status, and omissions or assumptions.
Name the current proposed or approved plan version and retain every returned
`needs_human` step ID with its URL and reason.

State that proposed plays, their email previews and management launch facts are
unreadable with this access. Report any integration setup facts you can read
with their actual scope. Continue authorized emitter work. Do not request a
management key solely to create this artifact, and do not invent previews.
Link the intended journey Markdown/JSON beside the event proposal; mark actual
play reconciliation unavailable with this access.

## Errors and privacy

Collection failures write no successful partial package. Fix the reported
failure and rerun into a new directory.

Before saving, the helper rechecks every page of pending requests and Play
summaries, alongside the workspace data already captured. A selected delivery
proof is also read again. A changed captured value stops the export before any
files are saved. Both passes share the command's time and size limits.
These reads detect observed changes during collection; activity after the
final reads can still make a saved package stale.

| Code | Recovery |
| --- | --- |
| `unexpected_response` | Check the evidence schema and its current workspace/plan/revision bindings, or the API response named by the error. |
| `snapshot_changed` | Refresh the proposal and evidence, then collect again. |
| `package_limit` | Collection exceeded 100 plays, 256 previews, 100 pages per list pass or 16 MiB. Report the limit; do not silently omit content or change workspace data to fit it. |
| `timeout` | Retry with `--timeout-ms 300000`; report a continuing timeout. |
| `server_update_required` | The management API must deploy before this skill is published. Canonical core definitions are unavailable. |
| `output_exists` | Choose a new private output directory. |
| `missing_module` | Reinstall the whole skill, including the sibling report module. |

Files are created privately: mode 0600 inside a new mode 0700 directory on
systems that enforce those modes. An existing output directory is refused;
no report is overwritten. Windows permissions need an appropriately private
destination. Artifacts may contain business plans and email copy even though
credentials are redacted.

See [management.md](management.md) for permissions and action recovery, and
[events.md](events.md) for the event contract.
