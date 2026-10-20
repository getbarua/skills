# Manage a Barua workspace

Use this page for setup and ongoing changes with an owner-authorized management
connection. For emitting product events, use [events.md](events.md). Workspace
creation, membership administration, billing and workspace deletion are outside
this API.

## Access and discovery

`BARUA_MANAGEMENT_KEY` is a workspace-specific `mk_` secret. It authorizes
`https://barua.ai/api/management/v1`; an `ik_` event key cannot call that API.
The owner creates the connection through Settings → Agents or the owner API
below. The owner selects permissions and review checkpoints. An expiry is optional.
`review: []` delegates the permitted actions without an extra review. Checkpoints
can be any of `plan`, `brand`, `play`, `launch`, `campaign`, and apply to later changes too.
Full delegation does not add permissions. Check the actual grant before saying
that launch is allowed.

Management keys have no test or production mode. Their permissions apply to
the real workspace, including live intake and sending when launch is granted
and setup requirements are met. Explain this before asking an owner to save
the key. Store it as `BARUA_MANAGEMENT_KEY` in the agent's secret store and load
it into the helper's process environment; `manage.mjs` does not read env files
automatically. Establish a secure destination and a permitted transfer method
before creating a connection. If browser transfer is unavailable, arrange
owner-assisted saving and keep the key panel open until saving is confirmed.
Ask for only the saved location. Continue independent work until it is
available, then verify access with `capabilities`. The screen's **Access granted**
status (formerly **Connected**) confirms permission, not that the agent holds a key.

Event keys are separate. Both modes use the `ik_` prefix and `BARUA_API_KEY`:
the test event key belongs in development or CI, and the live event key belongs
in production hosting secrets. Read each key's recorded `mode`; its prefix
cannot distinguish test from live. Use test keys for emitter checks. A management
key cannot replace either event key, and a test event key does not make management
actions a dry run.

Start with `GET /capabilities`. It returns the current connection policy and
legal version. Each action has a JSON input schema alongside its permission
and review status.
Use those schemas when constructing a request. `GET /setup` returns current
steps, facts, a readiness `version` and possible next actions. An integration
API response named `needs_human` is a legacy checklist; management permissions
determine whether this agent can perform its corresponding action.

| Permission | Allows |
| --- | --- |
| `setup:write` | Event keys, tracking plan, brand, email layout, domain and delivery proof |
| `play:write` | Play proposals and exact approval, feedback, retry, sending controls, journey cancellation and enabling play review |
| `launch:write` | Enabling or stopping live intake and play sending; activating a prepared email provider |
| `segment:write` | Creating, updating and previewing saved segments |
| `campaign:write` | Creating, updating and preparing campaign drafts with Barua |
| `campaign:send` | Sending, pausing, resuming and cancelling campaigns |
| `history:write` | Authorizing runtime keys to import history |
| `people:read` | Customer lookup and real-profile preview; runtime keys with this permission |
| `people:erase` | Erasure actions and runtime keys with this permission |
| `marketing:attest` | Recording an explicit marketing-lawful-basis statement |

A grant does not establish consent or another lawful basis. Supply a factual
statement only from an owner or an agent specifically authorized to make it.
Current terms are required for changes. The stop actions `sending.pause`,
`intake.disable`, `play.pause`, `play.entries.stop`, `play.run.cancel`,
`key.revoke`, `campaign.pause`, `campaign.cancel`, and connection revocation,
remain available when terms are stale. Other valid new or retried actions return
`terms_required` before looking up a prior request or preparing workspace data.
Resuming a non-stop operation also requires current terms, even if it already
completed. Operation reads remain available so a fresh process can find the IDs
needed to stop. Key lists, play details and campaign lists are also readable.
All current workspace owners must accept
the current terms before live intake can start. Accepting future legal versions
is never implied by a connection.

## Helper

Run `node <skill dir>/scripts/manage.mjs <command>`. Node 18.17 or newer is
required; the script has no package dependencies. `BARUA_URL` defaults to
`https://barua.ai`. Only HTTPS origins are accepted, except HTTP on localhost.
Credentials come from environment variables, never command arguments.

The example below assumes a Codex install under `.agents/skills`. Use the
installed skill path for another agent. Set `BARUA_OPERATION_ID` to the UUID
returned by the preceding action before waiting.

```sh
node .agents/skills/barua-setup/scripts/manage.mjs capabilities
node .agents/skills/barua-setup/scripts/manage.mjs setup
node .agents/skills/barua-setup/scripts/manage.mjs action --idempotency-key plan-001 --input-file plan.json
node .agents/skills/barua-setup/scripts/manage.mjs wait --id "$BARUA_OPERATION_ID"
```

For a core-only product, `plan.json` still contains a proposal:

```json
{"action":"plan.propose","input":{"events":[],"not_emitted":[]}}
```

Create keys with an explicit mode and least privilege. For example, the action
body for a test emitter is:

```json
{"action":"key.create","input":{"mode":"test","label":"Development emitter","capabilities":["events:write"]}}
```

Key creation requires `--secret-file <new private path>` or
`--secret-command-file <file containing a JSON argv array>`. The first reserves
a new file with mode 0600 and refuses symlinks. Files inside Git must already be
ignored. The second sends the new secret on stdin to the authorized command,
without a shell. Its output is suppressed. Never place a
secret in the argv array. For live keys, use the production secret store's
already authorized command. A failed transfer is recovered with the same
idempotency key and a new destination; it must not create another credential.
`wait --id` also recovers a completed key creation into the requested destination,
even when a previous process lost the successful response. `status` only reads
metadata. If the key has been revoked or recovery is no longer permitted, a key
command reports `secret_unavailable` instead of claiming the secret was saved.

A workspace allows 20 unrevoked, unexpired management connections. Expired
records remain in history without using a slot; renewing one needs a free slot.
The connection list places active connections before history and returns at
most 100 records. An exact creation retry reuses its existing connection.

| Command | Input and result |
| --- | --- |
| `connect` | Owner credentials; connection JSON; idempotency key and secret destination; returns connection metadata |
| `recover-key --id <connection-id>` | Original granting owner's credentials and a secret destination; saves the same active management key without changing policy or pending operations |
| `connections` | Owner credentials; lists connections |
| `capabilities`, `setup`, `operations` | Management credentials; read-only discovery and operation listing |
| `segment-fields` | Approved `segmentFields` for audience rules and `mergeFields` for personalization |
| `segments`, `campaigns` | Saved segment or campaign summaries; use `--after` for another page |
| `segment --id <segment-id>`, `campaign --id <campaign-id>` | Current detail, versions and prepared previews |
| `campaign-job --id <job-id>` | One background job's status, error and progress counts |
| `campaign-recipients --id <campaign-id>` | Current prepared audience results; requires `people:read`; use `--after` for another page |
| `action` | `{action,input}` JSON from stdin or `--input-file`; requires `--idempotency-key` |
| `status`, `resume`, `cancel` | Management credentials and `--id` operation UUID |
| `review` | Owner credentials with exact review JSON for the operation UUID |
| `wait` | Polls and resumes one operation. Completed keys need a secret destination; pending checkpoints need owner review. |
| `proof` | Proof UUID; `--bind-stdin` or `--input-file` reads `{ "eventId": "<real event id>" }` and retries binding while intake is pending, then polls by UUID. Without either flag it only reads by UUID and ignores stdin. |
| `play-catalog`, `play-job --id <job-id>` | Current proposal token and rollout readiness; exact preparation state |
| `play --play-id <slug>` | Review detail and current approval token |
| `play-definition`, `play-validate`, `play-simulate` | Require `--play-id` and `--revision-id`; simulation takes synthetic timeline JSON from stdin or `--input-file` |
| `play-runs`, `play-feedback`, `play-trace` | Require `--play-id`; trace also takes a run UUID with `--id`. Pass each returned cursor with `--after`. |
| `play-paths` | Path counts for `--play-id` and `--revision-id`, including the measured window and completeness |

`--timeout-ms` bounds the whole call or wait (1–300000, default 60000).
It includes destination checks and secret storage. Each Git check or secret
command gets at most 15 seconds or the remaining total time, whichever is less.
At expiry the helper ends its child process and reports failure without waiting
for that process's pipes to close. Recover any created key through the same
request or operation; the timeout does not undo an external secret-store write.
`--poll-ms` is 100–10000, default 1000. Ordinary output is one redacted JSON
object. Exit codes are independent of `verify.mjs`: 0 succeeded/satisfied,
1 helper or transport error, 2 authorization refused, 3 terminal unsuccessful,
4 awaiting approval, 5 still pending at timeout. For `proof`, only delivered exits
0. Provider failure exits 3; unconfirmed delivery exits 5. A timeout is not cancellation.
Keep the operation UUID and read or resume it later.
List commands `operations`, `segments`, `campaigns` and `campaign-recipients`
accept `--after <cursor>`. Pass the exact returned `next` until it is null;
the helper reads one page per call. A campaign job is read by its returned UUID,
not by a page cursor. These reads never consume stdin or submit an action.

For `play.propose`, `play.request-changes` and `play.retry`, `wait` follows the
saved preparation job after the operation succeeds. It exits 0 only when the
job returns a ready revision. `action` acknowledges the operation; it does not
wait for authored structure or email copy. Preparation states are `accepted`,
`preparing`, `ready` and `failed`. A timeout retains the same job for later reads.

## HTTP contract

Fetch `/capabilities` for each action's current input schema. A checkpoint
applies only when the connection's `review` array contains it. A blank
checkpoint means the permission alone authorizes it.

<!-- docs-check:management-actions -->
| Action | Permission | Checkpoint |
| --- | --- | --- |
| `segment.create` | `segment:write` | |
| `segment.update` | `segment:write` | |
| `segment.preview` | `segment:write` | |
| `campaign.create` | `campaign:write` | |
| `campaign.update` | `campaign:write` | |
| `campaign.prepare` | `campaign:write` | |
| `campaign.send` | `campaign:send` | `campaign` |
| `campaign.pause` | `campaign:send` | |
| `campaign.resume` | `campaign:send` | `campaign` |
| `campaign.cancel` | `campaign:send` | |
| `key.create` | `setup:write` | |
| `key.revoke` | `setup:write` | |
| `plan.propose` | `setup:write` | |
| `plan.approve` | `setup:write` | `plan` |
| `brand.confirm` | `setup:write` | `brand` |
| `brand.update` | `setup:write` | `brand` |
| `template.import` | `setup:write` | `brand` |
| `domain.provision` | `setup:write` | |
| `domain.verify` | `setup:write` | |
| `domain.activate` | `launch:write` | `launch` |
| `play.propose` | `play:write` | |
| `play.approve` | `play:write` | `play` |
| `play.discard-proposal` | `play:write` | |
| `play.retire` | `play:write` | `play` |
| `play.request-changes` | `play:write` | |
| `play.retry` | `play:write` | |
| `play.pause` | `play:write` | |
| `play.resume` | `play:write` | `play` |
| `play.entries.stop` | `play:write` | |
| `play.entries.start` | `play:write` | `play` |
| `play.run.cancel` | `play:write` | |
| `review.enable-plays` | `play:write` | `play` |
| `intake.enable` | `launch:write` | `launch` |
| `intake.disable` | `launch:write` | |
| `sending.enable` | `launch:write` | `launch` |
| `sending.pause` | `launch:write` | |
| `proof.start` | `setup:write` | |
| `marketing.attest` | `marketing:attest` | `launch` |
| `person.erase` | `people:erase` | |
<!-- /docs-check:management-actions -->

Send `Authorization: Bearer $BARUA_MANAGEMENT_KEY` and JSON. The key selects the
workspace. `X-Workspace-Id`, if supplied, must match it. Management reads never
return raw credential secrets. `POST /actions` and key-creation resume may return
a recoverable secret for that connection's own key; consume it through the helper.

| Route under `/api/management/v1` | Behavior |
| --- | --- |
| `GET /capabilities` | Current action schemas and grant |
| `GET /segment-fields` | Current `{segmentFields,mergeFields}` catalogs; use their exact paths and types |
| `GET /segments`, `/segments/:id` | Saved segments and current detail; lists take `after` and return `next` |
| `GET /campaigns`, `/campaigns/:id` | Campaign summaries or full prepared detail; lists take `after` and return `next` |
| `GET /campaigns/:id/recipients` | Prepared audience results; takes `after`, returns `next`, and requires `people:read` |
| `GET /campaign-jobs/:id` | One preparation, segment preview or send job's status and progress |
| `GET /setup`, `/plan`, `/events/status`, `/brand`, `/keys`, `/domain` | Current setup and configuration; domain read does not verify DNS or flush sending |
| `GET /templates/inbound`, `/templates/inbound/:id` | Forwarding address and existing email layouts; requires `setup:write` |
| `GET /plays`, `/plays/:id/detail` | Play list and exact review detail; the detail route supports every valid play ID |
| `GET /plays/mode`, `/plays/map`, `/plays/results` | Current review mode, play map and aggregate results |
| `POST /plays/profiles` | Customer lookup with `{email,after?}` in the private JSON body; requires `people:read` |
| `GET /plays/:id/template` | Read the play's email template |
| `POST /plays/:id/preview` | Render preview; a real customer profile requires `people:read` |
| `GET /plays/catalog`, `/plays/jobs/:jobId` | Read proposal readiness or follow a saved preparation request |
| `GET /plays/:id/definition` | Exact immutable definition and content hash; takes `revisionId` |
| `POST /plays/:id/validate`, `/plays/:id/simulate` | Validate an existing revision or simulate its synthetic timeline |
| `GET /plays/:id/runs`, `/plays/:id/runs/:runId` | Paginated person journeys and their transition evidence; requires `people:read` |
| `GET /plays/:id/feedback`, `/plays/:id/path-counts` | Feedback lineage and per-revision path counts |
| `GET /operations` | Summaries of this connection's durable work |
| `GET /operations/:id` | One full operation, including its prepared input and result |
| `POST /actions` | Submit `{action,input}` with `Idempotency-Key` |
| `POST /operations/:id/resume`, `/operations/:id/cancel` | Continue or cancel the same operation |
| `GET /proofs/:id`, `POST /proofs/:id/bind` | Read proof or bind `{eventId}` in the request body |

Use the literal play routes above; encoded play-route aliases are refused. Play
detail also remains available at `/plays/:id` for compatibility, except IDs
`mode`, `map`, `results`, `profiles` and `catalog`, whose names are reserved for discovery routes.
Use `/plays/:id/detail` for all IDs to avoid those collisions. Management refuses
GET profile lookup so email addresses stay out of its URLs. Play reader
responses have `canReview: false` because that field controls the browser's
owner buttons. It does not describe your delegated authority. Read `/capabilities`
for your permitted actions and required checkpoints, and use `/actions` for
changes. Customer lookup and previews using `personId` require `people:read`.

For play pages, pass the returned `next` as `after` together with the returned
`revision`. Detail accepts optional `revisionId` and `afterVersion`. Template
reads require `revisionId`, `stepId` and `language` query parameters. Preview
uses those same three fields in JSON plus exactly one of `example: true` or
`personId`; its body limit is 1 KiB. Profile lookup also has a 1 KiB body limit
and returns `next`, which becomes `after` in the next body. Results take one to
12 repeated `playId` query parameters.
Run and feedback pages return at most 20 rows and an opaque `next` cursor;
pass it as `after`. Trace pages use the same contract in execution order.
Path counts take `revisionId` and cover the latest 30 days, with at most
10,000 transitions. `complete: false` means the counts cover that bounded
sample, so do not report them as the whole window. Existing send and goal
metrics retain their current meaning.

## Propose and operate a branching Play

Read `play-catalog` for `expectedToken` and `branchingEnabled`. When enabled,
send `play.propose` with that token and a plain-language `intent`. Optional
`audience`, `goal`, `trigger` and `requirements` make the intended behavior
precise. Barua writes the structure and every email. Raw graphs and email
templates are not accepted as proposal input. The complete intent content
must fit within 24,000 UTF-8 bytes.

Use the returned operation ID with `wait`, then read its ready revision.
`play-definition` returns the complete definition, exact content hash and
readiness blockers. `play-validate` validates that saved revision. Simulation
accepts `{revisionId,input}` over HTTP; the helper wraps its input file using
`--revision-id`. The synthetic input includes `startedAt`, `language`, `values`
and optional `until`, `tracking` and `timeline`. Timeline items are either
`{at,type:"event",name,properties?}` or
`{at,type:"message",step_id,event:"opened"}`. Message events may also be
`clicked` or `delivered`. Use made-up values. Simulation never reads a customer
profile or sends mail; its assumptions describe the delivery checks it omits.
`values` uses nested objects. Dotted rule paths are not literal object keys.
For a signup example, supply:

```json
{
  "startedAt": "2026-10-20T12:00:00Z",
  "language": "en",
  "values": {
    "events": {
      "signed_up": { "count": 1 },
      "activated": { "count": 0 }
    }
  }
}
```

Use the exact language returned by the saved revision. Read the simulation's
entry decision before interpreting later paths; a person who does not meet
the entry rule will not reach an email or branch.

Open reports describe a recorded tracking signal, not proof that a person
read the email. Click reports are currently disabled for workspace mail.
Readiness reports a click-dependent path as blocked; absent click collection
cannot count as no engagement. Use a supported signal or request a revised Play.

Approve the exact revision and languages with the current review token. Approval
does not enable sending. Existing journeys stay on their approved revision when
you approve an update.

`play.entries.stop` closes new enrollments while current journeys continue.
`play.pause` pauses the Play, retaining saved progress. Both use the current
Play token. Resuming entries or the Play follows the connection's Play checkpoint.
`play.run.cancel` takes `playId`, `runId` and the run's `expectedRowVersion`.
Cancellation is terminal; a provider send already in flight can still finish,
and its receipt is retained. A stopped run is never restarted by that receipt.

To reject an unapproved proposal, use `play.discard-proposal` with its exact
revision and token. The approved Play is retained. Feedback history links
requests to resulting revisions and distinguishes approved, discarded and
superseded work. Accepted guidance stays with that Play; rejected proposals
do not become standing writing instructions.

Operation pages return up to 20 rows and a `next` cursor. Pass it as `after`
until `next` is null. List summaries omit `input`, `result` and `authority`;
read the operation by ID when those details are needed. Owner review lists use
the same summary shape, with full details at their context endpoint.
Each complete operation page is limited to 64 KiB; summary error codes may be
shortened to 128 UTF-16 units. Full detail retains the complete error and result.
Forwarded-email pages use their returned cursor as `before`.
Keep customer identifiers in private request bodies. They must stay out of
operation names and URLs, and logs must redact them. Reads are bounded; a
request failure is not evidence that a step is incomplete.

Use a stable random 1–128 visible-character idempotency key for each logical
action. Never use a customer identifier as the key.
Exact retries return the original operation. Changed input with the same key
returns `request_conflict`; choose a new key for a new decision. After an erasure
request is scrubbed, its input fingerprints are gone too. Retrying that key with
`person.erase` returns only the original terminal record; it cannot compare the
erased input or erase another person. Use a new key for another erasure.
A review binds the exact input hash and target version. It also binds the connection policy
version. Changing content or policy invalidates old authorization. Read the current state and
submit a new operation; do not edit an old request to inherit its approval.

Statuses are `awaiting_approval`, `ready`, `running`, `succeeded`, `satisfied`,
`failed`, `cancelled` and `stale`. `satisfied` means the exact requested result
already exists; it does not create another approval or claim the agent performed
someone else's action. Pending operations expire after seven days. External
work may finish after a revoke if it had already started; revocation prevents
later actions from starting. Cancellation does not undo completed effects.

Each workspace can create 100 routine operation records per rolling 24 hours,
shared across its connections. Completed, failed and cancelled requests count;
exact retries and resumes do not create another record. The separate limit of
100 pending requests per connection still applies. At the daily limit, a needed
pause, intake stop or key revocation can still complete. Barua records that stop
and performs it in one transaction. Already-stopped or invalid targets cannot
use this exception to create more history. Existing history remains readable.

Owner endpoints are under `/api/agent-connections`, with an owner session Bearer
token and `X-Workspace-Id`. The helper reads `BARUA_OWNER_TOKEN` and
`BARUA_WORKSPACE_ID` for these calls:

- `GET /` lists connections. `POST /` creates one with `{label,permissions,review,expiresAt}` and `Idempotency-Key`; `expiresAt` may be null.
- `PATCH /:id` updates `{permissions,review,expiresAt,expectedVersion}`. `DELETE /:id` revokes the connection.
- `GET /operations` lists pending reviews. `GET /operations/:id/context` returns the exact action and its review content.
- `POST /operations/:id/review` takes `{decision,inputHash,policyVersion}`. Use `approve` to release the action, or `reject`/`cancel` to close it.

Only the owner can widen a grant. An agent operating under an existing
management key cannot approve its own required checkpoint or mint another
management connection.

## Send one campaign to a saved segment

Campaigns use a separate grant from lifecycle plays. Campaign and segment reads
require at least one of `segment:write`, `campaign:write` or `campaign:send`.
Real-recipient samples and recipient pages also require `people:read`; agents
without it receive synthetic language previews. Lists return `{segments,next}`,
`{campaigns,next}` or recipient `{revisionId,items,next}`. Keep following `next`
as `after` before treating a list as complete. Recipient continuations belong
to one prepared audience. If a continuation returns 409
`campaign_snapshot_changed`, reread campaign detail and restart the recipient
list; do not combine pages from different revisions. List counts that are
absent are not zero; read campaign detail for current results.

1. Read capabilities, setup, `segment-fields` and existing segments. The field
   response returns `segmentFields` for conditions and `mergeFields` for email
   personalization. Use their exact paths and types; do not guess paths from
   an event name or invent fields absent from the approved catalog.
   `segment.create` takes
   `{name,definition}`; `definition` has `{version:1,condition}` using the
   supported customer-fact condition grammar. `segment.update` additionally
   takes `segmentId` and the numeric `expectedVersion`. Use recorded facts;
   missing evidence must not become a zero or an invented trait.
2. Submit `segment.preview` with `{segmentId,expectedVersion}`. Read its
   returned job ID with `campaign-job`, then read the segment for counts and
   exclusions. These counts can change before campaign preparation.
3. Submit `campaign.create` with `{name,segmentId,segmentVersion,brief}`.
   `brief.message` states the email's purpose. Optional `facts` supplies
   supported details, `cta_url` supplies its destination, `required_fields`
   names fields every recipient must have, and `optional_fields` maps fields
   to explicit fallbacks. Use the saved brand, voice and email design.
   `campaign.update` takes those same fields plus `campaignId` and numeric
   `expectedVersion`; changes require fresh preparation.
4. Submit `campaign.prepare` with `{campaignId,expectedVersion}`. Keep its
   returned job ID. Read `campaign-job` until it succeeds or reports a problem,
   then read `campaign`. Do not equate a successful management operation with
   a finished job. Inspect the fixed audience, exclusion reasons, each language's
   subject and rendered preview, and any readiness blocker. Barua writes each
   language variant and uses checked merge fields; it does not generate a new
   email separately for each recipient.
   A ready snapshot can have `snapshot.eligible: 0` and no language previews.
   Report its counts and exclusion reasons; do not request sending or resuming.
   An otherwise valid send or resume request returns 409
   `campaign_empty_audience` before recording an operation.
   To try a revised audience, use `campaign.update` to create a new
   campaign revision, then prepare that revision. Calling `campaign.prepare`
   on the same ready revision returns the saved snapshot without rescanning.
5. Once sending is authorized, submit `campaign.send` with
   `{campaignId,expectedVersion,revisionId,mode}`. Use the numeric campaign
   `revision` from detail for `expectedVersion`, and its `snapshot.id` for
   `revisionId`. The snapshot is the exact prepared content and audience.
   `mode: "now"` starts at the next allowed opportunity.
   `mode: "scheduled"` also needs `scheduledAt` as an ISO timestamp with an
   offset and the intended IANA `timeZone`.
   `mode: "immediate"` explicitly skips quiet hours and the 20-hour marketing
   gap. Obtain authorization for that exception; ordinary urgency does not
   imply it. All modes preserve consent, suppression, unsubscribe, active-send,
   provider and expiry checks. Optional `expiresAt` is an ISO timestamp with an
   offset. If omitted, expiry is 14 days after the scheduled start or, for
   now/immediate, after the approved operation actually starts sending.
6. If `campaign` review applies, report the exact pending operation and wait
   for owner review. The owner sees the proposed mode, schedule, expiry,
   audience and language previews. Resume that same operation after approval.
   A content, audience, version or policy change needs a fresh decision.
   Newly granting campaign sending enables this checkpoint by default; only
   an explicit owner choice delegates sending without it.
7. Read campaign detail and, when authorized, every recipient page. The approved
   audience cannot grow during sending. Consent, suppression and other safety
   checks can remove recipients. A provider's acceptance is not delivery.
   Report queued, accepted, delivered, failed, excluded and unknown outcomes
   accurately. An uncertain provider outcome must be reconciled before another
   attempt; do not resend it under a new operation.

Campaigns do not require enabling lifecycle play sending. Keep workspace
configuration unchanged unless the request also authorizes a setup change.
To pause or cancel a campaign, submit `campaign.pause` or `campaign.cancel` with
`{campaignId,expectedVersion}`. To resume sending, use `campaign.resume` with
those fields and the exact `revisionId`; it follows the campaign checkpoint.
The helper's plain `resume --id` resumes a management operation, not a campaign.
Cancellation leaves provider-accepted mail and its delivery reports intact.

Read current campaign detail before choosing an action:

| Action | Required campaign state |
|---|---|
| `campaign.update` | Sending has not started; not completed, cancelled or expired. Creates a new revision that needs preparation. |
| `campaign.prepare` | Draft, failed, preparing or ready. Ready returns the existing preparation. |
| `campaign.send` | Ready or paused; sending has not started. Requires the exact current prepared revision with at least one eligible recipient. |
| `campaign.resume` | Paused, with the exact current revision already approved and at least one eligible recipient in its prepared audience. |
| `campaign.pause` | Scheduled, sending or paused. Completed, cancelled and expired campaigns remain unchanged. |
| `campaign.cancel` | Any state. Completed, cancelled and expired campaigns remain unchanged. |

Expired campaigns cannot be updated, prepared, sent or resumed. These checks
apply before a new operation is recorded and again at approval and execution.
An older pending request that no longer meets them cannot be approved; the
owner can reject or cancel it. Repeating an already completed operation returns
its saved result without starting another send.

## Recover a lost management key

The owner who created an active connection can use **Save key again** in
Settings → Agents. With that owner's already authorized session credentials,
the helper can save it directly without exposing the key in output:

```sh
node .agents/skills/barua-setup/scripts/manage.mjs recover-key --id "$BARUA_CONNECTION_ID" --secret-file /private/authorized/new-management.key
```

Use a new private destination you are authorized to write. The helper requires
`BARUA_OWNER_TOKEN` and `BARUA_WORKSPACE_ID`; it does not require the missing
management key. It calls `POST /api/agent-connections/:id/key` with no body or
idempotency key, reserving the secret destination first. A retry uses the same
connection ID and a new destination. A successful result includes `secret_saved`.
Load the saved value into `BARUA_MANAGEMENT_KEY` without printing it, then run
`capabilities` to verify usable access. Browser-only tools that cannot securely
transfer credentials need the owner to save the key and share only its location.

Recovery returns the same key with the connection's current permissions. It
does not create another connection or alter pending operations. It requires
current terms and the original granting owner to still own the workspace;
another owner cannot recover that grant's key. Revoked or expired connections
are refused. A changed server seed or failed hash check refuses recovery.
Recovery does not rotate a key that may have been exposed.

Before diagnosing an older deployment from a missing button, check the original
granting owner and active connection, then current terms. If recovery is still
unavailable, explain that limitation and arrange a replacement
connection with the owner only after securing its handoff. Do not repeatedly
ask for an unavailable key. Do not duplicate or revoke existing access
without authorization. A revoked or expired grant needs a new authorized
connection or owner-approved renewal, not a recovery retry loop.

## Complete setup and later changes

1. Read capabilities and setup. Propose the full event plan, including empty
   arrays when appropriate. Approve its exact version or retain the pending
   operation for owner review. Write emitters at the actual server commit points
   and validate through the real product flow with the test key.
2. Read brand and its version. Derive the playbook from product facts. Initial
   `brand.confirm` includes the exact proposal hash and seen values; later
   `brand.update` changes the existing brand. Optional `template.import` accepts
   a workspace-owned forwarded email and checked layout. Preserve unrelated
   configuration when supplementing an existing workspace.
3. Provision a sending domain and install the returned records with the already
   authorized DNS tool. Call `domain.verify` explicitly and read the result.
   Report absent external permissions precisely; Barua does not store DNS or
   hosting credentials for this purpose.
   New setup uses Amazon SES without a provider flag. Use the exact domain
   in the workspace's From address. Read `GET /domain?provider=ses`; verification
   also takes its `configId` and `configGeneration`. Install only the returned
   ownership TXT, DKIM and bounce-subdomain records. Preserve existing Mailgun
   records and the domain's root MX. Preparation and verification leave the
   active sender and sending pause unchanged. Activate the verified target
   explicitly with `domain.activate`, using its `configId`, `configGeneration`
   and `activeGeneration` as `expectedGeneration`. This needs `launch:write`
   and follows the optional launch checkpoint. A readiness refusal requires
   the named prerequisite; never bypass it or treat DNS verification as a
   completed setup. An explicit `provider: "mailgun"` setup request is refused.
   `GET /domain?provider=mailgun` can still read historical configurations;
   Mailgun activation is no longer available. If a legacy setup request returns
   `provider_retired`, read the SES state and submit a new request.
   Accepted or uncertain attempts are never resent through another provider.
4. Read each play's current revision and token. Inspect renders before approving
   selected languages. Request changes or retry authoring when needed. A later
   update follows the same review policy. Existing approved content can continue
   while a replacement waits; pausing is explicit.
   An existing workspace in email review can use `review.enable-plays` with
   the current `expectedGeneration` from `GET /plays/mode`. This follows the
   play checkpoint and preserves an existing sending pause.
5. Read the latest setup `version` for each launch action. Enable live intake
   and play sending explicitly. Install the live key and deploy with the
   authorized hosting tool. Do not clear historical onboarding timestamps.
6. Start `proof.start` with the exact deployed key ID and approved revision ID
   before triggering a new qualifying action through the deployed product.
   Bind that event using `proof --bind-stdin` or `--input-file`. The helper retries
   the same bind while intake is pending. After `event_row_id` is present, plain
   `proof --id` can poll it. If the command times out or the process stops before
   binding, repeat the same bind input; a UUID-only read cannot recover an event
   identifier that has not been stored. The proof follows the actual event,
   key, revision, enrollment, decision and provider message. Only `delivered`
   establishes delivery. `provider_accepted` is still waiting for the provider's
   delivery report. A held event reports the stage and reason code; do not fake consent
   or bypass suppression to make it pass.

## Errors and recovery

Errors return `{code,error,retryable}`. `invalid_input` requires fixing the body
against the current schema. `permission_required` or a revoked/expired grant
requires owner action. `terms_required` requires current account acceptance.
`target_changed` and `action_changed` require a fresh read and a new decision.
`key_slots_full` requires a planned rotation, never automatic eviction.
`not_ready` requires the missing setup prerequisite. For `send_in_flight`, retry
the same operation after the active send finishes. Use bounded backoff after an
uncertain response or a 429/503 error. Keep the same request and idempotency key.
`operation_rate_limited` means the workspace's rolling 24-hour creation budget
is full. Wait for older requests to leave that window, then retry the same
request. Cancelling work does not reset this budget. Necessary emergency stops
remain available; repeatedly requesting an already-stopped state does not.

A permanently invalid key, revision or job returns the saved operation with
`status: "failed"` and an `error_code`; it does not occupy a pending slot.
For `proof_input_invalid`, `proof_key_invalid`, `proof_revision_invalid`,
`proof_identity_changed`, `key_not_found`, `job_not_found` or
`play_revision_invalid`, read the correct target and submit corrected details
with a new idempotency key. Exact retries keep the original failed result.
`proof_revision_not_ready` instead leaves the operation `ready`: approve or
resume that existing revision, then resume the same operation. Unknown database
or provider failures remain uncertain and must not be treated as permanent.

Domain provisioning allows five admitted attempts per rolling 24 hours.
Waiting for another in-flight domain attempt does not spend that allowance.
An initial `domain_provision_limit` refusal is saved as `failed`; wait for
capacity and submit a new request. An interrupted operation instead remains
`ready` with `provider_unconfirmed` and an explanation if the cap is full.
Resume that same operation when capacity returns, within its seven-day expiry.
Its earlier provider work may have completed even though the response was lost.

Event keys remain a separate boundary. New management-created keys carry
explicit capabilities. `events:write` admits current events; `history:write`
is additionally required for backfill and live occurrences older than 72 hours.
An exact already accepted retry stays retryable with its original key and
idempotency key. `people:read` and `people:erase` are separate. These restricted
keys can read only their own receipts. Existing legacy keys keep their prior
capabilities. Revoking an agent connection never revokes deployed event keys;
pause intake/sending or revoke the event key separately when that is intended.

## Data retained

Barua stores connection hashes and metadata. Operation records include their
inputs and outcomes, with the grant owner and policy version behind each action.
Pending work expires after seven days. Erasure-request identifiers and their
input fingerprints are removed when the action completes or is cancelled.
Expiry and the person's erasure also
remove them; bounded maintenance can lag
during an outage. Connections, including revoked or expired ones, and their action
metadata remain for audit and idempotency until the granting account or workspace
is deleted. Immutable play approvals keep the agent attribution even
after that connection is removed. Delivery proof links follow deletion of their underlying
event. Secrets do not belong in operation input or free-text labels.
