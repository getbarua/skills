# Review the customer journey before choosing events

Use this procedure for initial setup and changes to events, playbooks or plays.
It applies to management access and event-only access. Read access and current
state first; complete this review before proposing or approving a plan.

Source discovery and a fresh independent agent review are required before
onboarding plan or brand submissions. Management Play approvals also
require a compact reconciliation record bound to the exact policy and emails.
That record cannot establish semantic truth or complete source coverage.
Full delegation continues within its grant, without a new human checkpoint.
An owner checkpoint presents the artifacts and waits on the existing operation.
Reading or exporting configuration does not approve it.

Initial setup proposes the complete intended strategy. A message the owner
names is a requirement to include, unless they explicitly limit the scope.
For example, a requested welcome email does not exclude recovery or returning
customer opportunities. Record any actual owner boundary with its source.
Choose exclusions for a stated product or priority reason; absence from the
owner's examples is not a reason.

## Discover the experience

Before writing the strategy, generate `--render discovery-task` using the
[task context below](#prepare-the-review-packet-and-task) and start its fresh
native agent. Pass its prompt unchanged, with the specified model, effort and
foreground controls. It reads product source only and returns a completed
checklist. Save that result privately beside the journey artifact. It is advice,
not approval, and must not be used as the final reviewer's initial context.

Reuse its observed facts as the first-pass source inventory. Verify uncertain
or missing evidence against the actual product, then map each assessment
obligation into the strategy. Avoid writing a second independent inventory from
scratch. Inventory source-owned entities and variants before selecting messages.
Follow state transitions through failure and recovery. Record time conditions
and existing senders, including the facts that stop their work. Keep source
observations separate from the later opportunity list. Existing analytics and
emitters help locate evidence; they do not determine which situations matter.

Discovery rows separate `current` source behavior, the `expected` customer
outcome or assessment obligation, actual action `prerequisites`, and `evidence`.
Follow a proposed destination through its access and readiness checks during
discovery. A fact that work finished does not prove the customer can use it.
Keep an unknown product choice explicit. Existing sender silence does not
resolve whether an outcome should be covered, excluded or held.

Use these areas as a discovery checklist, not a requirement to invent features:

- Account access, setup and first useful result, including distinct creation
  modes such as creating from scratch or importing existing work.
- Unfinished actions, background work, failures and recovery. Distinguish
  accepted work, actual readiness and the customer using the result.
- Checkout, confirmed payment, entitlement and fulfilment. Include paid
  changes, cancellation and refunds when the product supports them.
- Returning customers and relevant legacy accounts. Read the current product
  strategy before proposing trials, subscriptions or win-back messages.
- Existing service messages, delivery problems, marketing preferences,
  account or object deletion, and loss of access.

Record the routes or state transitions that establish each situation, including
the unhappy paths. Check the existing email code and provider configuration
when authorized. An absent emitter is implementation work. An absent business
fact may justify an exclusion or a core-event declaration; these are different.
Do not declare an event `not_emitted` just because its emitter is missing.
Record completion of this first pass in `discovery_review`. An uninspected
source area leaves discovery incomplete; a documented unknown stays visible.

## Write the private artifact

Choose an authorized private directory; use the owner's requested location when
given. Keep `journey-review.json` and `journey-review.md` together there. Start
from `templates/journey-review.json` in the installed skill, also available as
the [public JSON template](https://barua.ai/skills/barua-setup/templates/journey-review.json). Fill the JSON as
the inventory, then generate its readable view with the installed helper:

```sh
umask 077
node .agents/skills/barua-setup/scripts/journey-review.mjs --render markdown \
  --journey-review-file /private/authorized/journey-review.json \
  > /private/authorized/journey-review.md
```

Use your installed skill path and an authorized private directory. The helper
writes only to stdout; you explicitly save the output. The Markdown filename replaces the JSON suffix
with `.md` in the same directory. It starts with the recorded decisions, then
shows their rules and review records before the detailed source inventory.
Every recorded field remains visible, including unfinished reviews, held
decisions and additive metadata. Rendering does not
certify discovery or approval. Change the JSON and regenerate; do not edit the
generated Markdown separately. Its exact bytes use LF line endings, no BOM and
one final newline. Each file must fit within 512 KiB and contain no credentials.

Keep the documented fields and types; additive descriptive metadata is allowed.
Keep the files private and out of commits by default; use a private directory
and file permissions. Include no credentials, customer records or private
message contents. Source references and product facts are sufficient.

Write consumer rules as concise conditions. Keep supporting explanation in the
evidence fields. Each covered consumer needs its material conditions in the
fields that reach the playbook; follow the held-summary rules below for other
decisions. Render and measure the playbook while drafting, before independent
review; use the command and existing limits below.

Do not overwrite earlier evidence from an onboarding test. For a fresh run,
record the authorized empty starting state. Existing configuration makes this
a resumed run; it does not authorize resetting the workspace.

The inventory uses this format. Dates are ISO 8601 UTC. IDs are stable within
the review and must remain unchanged when a row is refined.

| Top-level field | Content |
| --- | --- |
| `version` | `1` |
| `product` | The product being reviewed |
| `captured_at` | When the source and workspace observations were made |
| `sources` | Objects with `repo` and `revision`; use the inspected commit, or explain an unversioned source |
| `owner_scope` | Optional object or null. Its `requirement` is text or null, and `boundaries` is a string array from the owner's actual request; leave unknown scope unrecorded |
| `source_inventory` | Source facts recorded before choosing messages |
| `discovery_review` | First-pass `status`, `checked_at` and `findings`, using the same types as `coverage_review` |
| `journeys` | The discovered situations, including ones that will not get an email |
| `opportunities` | Explicit message or control decisions for those situations |
| `coverage_review` | `status` (`unreviewed`, `complete` or `incomplete`), `checked_at`, and `findings` |
| `independent_review` | The separate reviewer's recorded result and input bindings; null until available |
| `workspace` | `id` and `plan_version` when readable; otherwise null |
| `reconciliation` | The relationship between selected opportunities and exact current play revisions |
| `submission_reviews` | The source-based claim review for each exact plan or playbook input |
| `approval_observations` | The canonical execution target and reviewed previews for a management Play approval |

Each `source_inventory` row has `id`, `kind`, `statement`, `status`, `evidence`,
`material` (boolean) and `opportunity_ids`. IDs are distinct strings of at most
128 characters. `kind` is `entity`, `variant`, `transition`, `time_condition` or
`sender`. `status` distinguishes `observed`, `proposed` and `unknown`.
`evidence` and `opportunity_ids` are arrays of strings. An observed fact needs
a source reference. During the second pass, link every material row to an
assessed opportunity, including exclusions or controls. Do not manufacture a
source fact to fill an empty category.

Each `journeys` row has `id`, `situation`, `evidence` (source references),
`opportunity_ids`, `assessment` (`assessed` or `unassessed`) and `notes`.
A discovered situation with no desired email still needs an explicit exclusion
or control decision. A list containing only the selected plays is not an
inventory. Check that every opportunity reference resolves and each
journey-to-opportunity link is recorded in both directions.

Each `opportunities` row contains:

| Field | Meaning |
| --- | --- |
| `id`, `journey_ids` | Stable opportunity ID and related inventory IDs |
| `kind` | `lifecycle`, `service`, `micro` or `control`; this describes the customer need, not Barua's sending class |
| `outcome`, `evidence` | The useful customer outcome and source facts supporting it |
| `trigger` | The authoritative fact or state that starts consideration |
| `actor`, `subject` | The intended recipient and exact object or occurrence, such as the same project, order or job |
| `eligibility` | Current-state conditions required at entry and again before sending, including relevant facts from before the trigger |
| `timing` | Proposed timing and its anchor; distinguish a proposal from an established product promise |
| `stops`, `reentry` | Completion, recovery, deletion and other stopping facts; when another occurrence may qualify |
| `context`, `facts` | Required wording/targeting context and supporting product facts, including facts that lack events |
| `current_sender`, `proposed_sender`, `duplicate_prevention` | Current owner, proposed owner and how the same purpose/occurrence avoids duplicate messages |
| `decision`, `reason` | `covered`, `excluded` or `blocked`, with the reason |
| `implementation`, `dependency`, `next_action` | What actually exists, what is missing and the concrete next step |
| `planned_events` | Intended event names; use core events when their meaning fits |

`evidence`, `journey_ids`, `stops`, `context`, `facts` and `planned_events` are
arrays of strings. `implementation` must be nonempty text on every row,
including blocked and excluded rows. State what exists or that no implementation
is planned; do not use null. Other opportunity fields are strings, except an
unresolved rule may be null on a blocked or excluded row. Explain that absence in
`dependency` and `next_action`, or the exclusion reason. Distinguish observed
product facts from proposed message rules. Under delegated setup, propose
concrete timing, eligibility and stops from those facts and label the choices
as proposals. A new message does not itself require a new owner checkpoint.
Hold an affected action when an essential fact, permission or capability is
missing; do not invent those facts to fill the row.

When an email needs a fixed product or action URL, put the source-reviewed
absolute URL in `context` or `facts`. Preserve the known URL exactly. A relative
route does not establish its public origin; do not invent one. These fields
reach the playbook and its link checks.

Record the useful customer outcome and its source-supported behavior before
choosing a disposition. Keep the known trigger, eligibility, timing, stops,
action prerequisites and ownership. A missing capability leaves a dependency
or unresolved decision; it does not erase known conditions. Existing sender
behavior describes the current system, not whether a new outcome is useful.

Then choose the disposition. For blocked work, describe what implementing each
named dependency would make possible and what would remain unresolved. A safe
hold does not establish complete strategy coverage. An exclusion needs an
intentional product or scope reason.

Use the decisions consistently:

- **Covered:** an explicit message/control decision has concrete rules and an
  owner. This means strategy coverage, not that its event or play is deployed.
  State unfinished implementation honestly.
- **Excluded:** a deliberate product or priority decision, with its reason.
  “There is no emitter” or “the owner did not name it” is not a reason to erase
  a relevant situation. Do not invent a launch phase to justify exclusions.
- **Blocked:** the opportunity remains in scope, with a missing decision,
  capability or implementation dependency and a next action.

Externally owned messages can be covered. Keep their supporting events in the
intended plan when other targeting, stopping or reporting needs them. Do not
assign Barua a second shipment or receipt message without an explicit migration
decision and duplicate prevention.

A service need is not automatically a supported transactional play. Check the
current contract: Barua's transactional purposes are receipt, shipped, delivered,
delayed, cancelled and refunded order messages. Other custom service needs
require a supported sender or a recorded capability gap. Never work around
consent by relabeling a marketing play. Unknown payment is not a confirmed
failure; a queue acceptance is not fulfilment; missing tracking is not proof
that a person did nothing.

## Trace facts through every decision

Before choosing event definitions, complete these checks against the source
inventory and all opportunities that use each fact. Record the resulting rules
in the existing `facts`, `eligibility`, `stops` and `dependency` fields. Keep
observed facts separate from the proposed decision to send a message.

- Define a shared fact from the source operation that establishes it. Trace
  every consumer, including stops and externally owned messages. Put a
  message's audience filter in that opportunity's eligibility. If an event is
  deliberately narrower than the source fact, every other consumer needs its
  own complete observation. Recheck all consumers whenever a definition changes.
- Evaluate current state at entry and again before sending. Include relevant
  activity before the trigger and work that is still unresolved. A stop that
  only observes later events cannot exclude an already completed action or an
  existing operation. Name the exact state observation and how it stays current;
  a missing observation is an implementation dependency, not evidence of absence.
- Follow each proposed action URL through the actual destination and its server
  checks. Record the access and readiness conditions needed for the promised
  action to work. Preserve the meaning of an upstream completion fact when a
  downstream prerequisite is missing. Hold that message, use a verified usable
  destination, or propose the missing observation before claiming readiness.
- Examine time conditions without a new callback. For each relevant deadline
  or waiting state, advance time while leaving stored state unchanged. Record
  whether a decision is needed and which current-state observation would support
  it. A changed timestamp and an elapsed timestamp are different conditions.
  Retain a justified exclusion or an explicit dependency when no observer exists.

Trace each required observation into the exact event fields or an authoritative
read the consuming system can actually perform. A proposed read needs a named
implementation dependency until it exists. Keep material conditions in the
generated playbook too. A source reference or private note cannot replace the
rule the message consumer receives.

## Check coverage before plan operations

In the second pass, review the map against the separate source inventory. Do not only reread
the opportunities already selected. Every material route/state, relevant
failure/recovery outcome and existing sender must reach a documented decision.
Check source claims and use applicable counterexamples from this checklist:

- The customer used a different creation mode or left a different task unfinished.
- Another object completed while the triggering object still needs attention.
- Payment remains unresolved after the proposed delay. Elapsed time alone
  does not establish failure or permission to start another purchase.
- A failed operation returned to pending or processing, or later recovered.
- Several distinct successful operations accumulate for the same object.
  Check the total and avoid counting retried or unsuccessful operations.
- An existing sender already sent the same purpose for that occurrence.
- Consent was refused, access changed or the account/object was deleted.

Check that the proposed trigger, subject, eligibility, timing, stops, reentry
and required context handle those cases. Field presence and valid event JSON
do not prove this. Compare material facts, including amounts and product
promises, with the source and with both artifact views. This author check
prepares the strategy for the required independent review below.

Set `coverage_review.status` to `complete` only after that pass, with its time
and any explicit remaining dependencies. An unassessed area or unsupported
claim leaves it `incomplete`: finish that discovery before proposing or
approving the intended plan. A complete coverage entry still needs a passing
independent review before submission. An assessed blocked, excluded or
externally owned row is valid coverage. Hold its affected action or play, while continuing
unaffected work the grant allows. Do not turn a dependency into a new owner
checkpoint under full delegation.

Now derive the full intended event plan and playbook from the map. Preserve
existing events/declarations unless their removal is intentional and reviewed.
Missing instrumentation stays on the implementation list; it must not narrow
the desired journey. The intended schema can be approved before emitters are
deployed. That does not make dependent plays ready to launch.

Before submitting either input, check its actual claims against the source.
An internal retry handler does not prove a customer retry exists or costs
nothing. An uncertain payment does not establish failure. Label proposed
message rules as proposals and keep unknown product promises out of the input.

Prepare the intended plan input and brand patch. Generate the playbook from
the recorded strategy before asking the independent reviewer to compare it:

```sh
umask 077
node .agents/skills/barua-setup/scripts/journey-review.mjs --render playbook \
  --journey-review-file /private/authorized/journey-review.json \
  > /private/authorized/playbook.txt
```

Copy those exact UTF-8 bytes into `input.playbook` when building the action
JSON. The output is already trimmed and has no final newline. It preserves
all documented covered rules, including implementation work and planned events.
The playbook keeps labeled plain text, with shorter repeated labels to save
space. `Sends now` records current ownership; `Send via` records proposed
ownership. Field values and their line boundaries remain intact for email facts,
links and human review. Blocked and excluded rows begin with an instruction not
to create a Play; controls and existing sender ownership remain explicit.
Blocked and excluded rows' complete intended rules remain in the private JSON
and Markdown. The playbook exports only their outcome, ownership, reason, dependency and next
action, with journey and kind labels. Put constraints needed to interpret the
hold in that summary. If another consumer needs the same fact or condition,
record it in that consumer's actual rules too; a held row's private rules do not
reach that consumer. Resolving a hold requires a new render and review.

The generated playbook must fit both existing limits: 24,000 JavaScript
characters and 32,768 UTF-8 bytes. The latter prevents the proposal consumer
from cutting off its end. An oversized result is refused, with both sizes and
the largest rows. Use that measurement to plan a compaction pass across repeated
explanation in the authoritative fields. Preserve every opportunity and material
condition; do not drop or merge distinct decisions to fit. Regenerate and measure
before preparing the review packet, then repeat the independent comparison if
inputs changed after review. Nothing is truncated or silently replaced. The
compiler omits evidence arrays and source revisions, but field
text can still contain inline citations. Inspect the generated text before
submitting it.

Measure all rows as you draft, before preparing the packet:

```sh
node .agents/skills/barua-setup/scripts/journey-review.mjs --render size \
  --journey-review-file /private/authorized/journey-review.json
```

This returns every row's character and byte sizes, shared overhead, remaining
capacity and `fits`. It succeeds for an oversized draft so you can plan one
concision pass across the whole strategy. It does not approve or change it;
playbook and packet rendering still refuse oversize content. Put supporting
explanation in evidence, keep consumer conditions explicit, and avoid repeating
the same rationale in outcome, reason and dependency. Preserve all material
rules. Reserve time for final review, corrections and the permitted API/draft
work rather than treating a finished private document as the outcome.

## Prepare the review packet and task

Prepare a private packet input with `plan_input` (the full intended proposal)
and `brand_patch` (the exact intended `input.patch`). `plan_input` contains only
`events` and optional `not_emitted`; include an empty `not_emitted` array when
the action requires it. A plan-only packet may use an empty brand patch. The
source-first `checklist` is optional at packet creation. Calculate the bindings
without workspace credentials:

```sh
node .agents/skills/barua-setup/scripts/journey-review.mjs --render packet \
  --journey-review-file /private/authorized/journey-review.json \
  --input-file /private/authorized/review-packet-input.json \
  > /private/authorized/review-packet.json
```

The packet contains `strategy_sha256`, `plan_input`, `plan_sha256`,
`brand_patch`, `brand_patch_sha256`, the generated `playbook` and
`playbook_sha256`. Supplying `checklist` also returns `checklist_sha256`.

If your harness supplies `BARUA_SETUP_REVIEW_CONTEXT_FILE`, use that private
context file unchanged as the task formatter's `--input-file`. It contains the
trusted owner request, complete frozen source paths, canonical artifact paths
and configured model/effort. Write the strategy and packet at its supplied
paths. Do not shorten its owner request, remove source files or replace its
settings. This is nonsecret task metadata, not model authentication. The local
evaluation retains both expected tasks before author execution and checks
completed source-only discovery followed by a distinct fresh final reviewer.
Editing the context file cannot change those expectations.

Without supplied harness context, create a private task context JSON with
exactly these fields:

| Field | Value |
|---|---|
| `owner_request` | The owner's actual request, without the author's strategy or conclusions. |
| `source_files` | An array of product source file paths for independent discovery. |
| `strategy_file` | The path to the complete `journey-review.json`. |
| `packet_file` | The path to the generated review packet. |
| `model`, `effort` | The harness-reported model ID and configured effort, using `BARUA_SETUP_MODEL` and `BARUA_SETUP_EFFORT` when supplied. |

Use absolute paths that the reviewer can read. Generate early discovery from
the installed [discovery task](https://barua.ai/skills/barua-setup/templates/journey-discovery-task.md), before
the strategy and packet exist. It exposes only the owner request, source paths
and configured metadata. Generate the final task from the installed
[reviewer task](https://barua.ai/skills/barua-setup/templates/journey-review-task.md) once the packet exists.
It also reads the shipped [event contract](events.md) after its own source-first
checklist. Normal installation includes both templates and the contract.
For manual downloads preserve their paths relative to the helper:

```sh
node .agents/skills/barua-setup/scripts/journey-review.mjs --render discovery-task \
  --input-file /private/authorized/reviewer-context.json \
  > /private/authorized/discovery-task.json

node .agents/skills/barua-setup/scripts/journey-review.mjs --render reviewer-task \
  --input-file /private/authorized/reviewer-context.json \
  > /private/authorized/reviewer-task.json
```

The result has `prompt`, `expected_model` and `native_call`. Pass `prompt`
unchanged to native delegation. In the verified `native_call` shape,
`subagent_type` is `general-purpose`, `effort` is the configured value, and
`run_in_background` is `false`. Apply these requirements using the
corresponding controls your native harness supports; do not invent arguments or
silently change a setting. Record `expected_model` verbatim as the configured
model declaration. The harness must verify the completed reviewer's actual
resolved model from native runtime evidence; that metadata may be retained
outside the tool text shown to the author. Never append an explanation to the
model string. If neither visible evidence nor a trusted harness verifier can
establish the actual model, report that limit and hold the affected submission.
Task generation only formats instructions. It does not start a reviewer or
supply model authentication.

## Obtain the independent review

Use your agent harness's native delegation to start a separate reviewer with
fresh context and the same configured model and effort. Verify that this
capability is available; the skill does not install a reviewer or supply model
authentication. Do not inherit the author's strategy or conclusions into the
reviewer's initial context. Keep the reviewer read-only, without workspace
credentials, customer records or permission to change product files or Barua.

Start a fresh final task, separate from the discovery agent, with the generated
prompt and call requirements. Do not resume a previously used reviewer or
inherit the author's conversation or early discovery. Keep the prompt intact,
including its direct `Read`, `Grep` and
`Glob` restrictions; do not replace them with shell commands. Wait for the
completed foreground result before submitting. A started task or progress
message is not a completed review.

The canonical task requires a source-derived plain JSON checklist before any
artifact reads, then comparison of the complete strategy and intended inputs.
For this recorded protocol, the reviewer must use `Read` on `strategy_file`,
the actual journey JSON. Its matching generated Markdown remains the full
human-readable view. The final result uses the task's exact top-level receipt
fields; do not add `CHECKLIST` or `RESULT` labels, a nested `bindings` object,
or a prose reconstruction. Retain the ordered native tool/session evidence and
both JSON outputs. The parent may attach only harness-reported `author` and
`reviewer` identity, `checked_at` and the calculated `checklist_sha256`. Preserve
the reviewer's remaining result, including findings and input bindings.

Retain the reviewer's result. For strategy corrections against unchanged product
sources, prepare the current packet and start another fresh final reviewer
with the same canonical task. Each independently derives its source checklist;
do not supply a previous review's conclusions as its starting point. Keep every
failed result. Material source changes require fresh early discovery too. If the
required independent review is unavailable or cannot finish, keep the affected
strategy submissions on hold and report that limit. Continue unaffected work
permitted by the grant.
Do not substitute self-review, add a human checkpoint, request another model
account or silently start a nested CLI/API call. The owner may still choose a
human checkpoint through the existing permission policy.

The local helper checks recorded review fields and content bindings. It does
not inspect the source tree, verify that another agent ran, or certify the
reviewer's conclusions. Preserve the actual delegation/session evidence for
those execution claims. Recheck current source before submitting; record
relevant uncommitted changes with content hashes in source metadata rather than
reusing a commit identifier for different content.

Use the author session ID and reviewer agent/session ID reported by the
harness, with its exact configured model and effort declarations and retained
runtime verification. When supplied by the
harness, `BARUA_SETUP_SESSION_ID` identifies the author session; it is not a
credential. The harness may also supply `BARUA_SETUP_MODEL` and
`BARUA_SETUP_EFFORT`; use those or its reported equivalents without asking the
owner to configure new values. Do not invent identifiers, substitute an
unverified alias or put a visibility caveat inside an identity field.
If the harness cannot supply the required identity, report that the review
cannot be recorded yet.

## Bind and submit the reviewed inputs

Once the reviewer has emitted its initial checklist, the packet command can
calculate its digest without changing the other packet fields. Keep the
reviewer's original expectations and evidence unchanged.
Record the passing result in `independent_review` only after all material
findings are resolved:

| Field | Required content |
|---|---|
| `version`, `status`, `checked_at` | `1`, `pass` and an ISO review time with a timezone. |
| `author`, `reviewer` | Each has `session_id`, `harness`, `model` and `effort`. Sessions must be distinct; use the configured model and effort. |
| `strategy_sha256` | The packet's strategy digest, including recorded sources and all semantic fields. |
| `plan_input`, `plan_sha256` | The exact reviewed event proposal and its packet digest. |
| `brand_patch`, `brand_patch_sha256` | The exact reviewed brand patch and its packet digest. |
| `playbook_sha256` | The packet's generated playbook digest. |
| `checklist_sha256`, `checklist` | The final reviewer's source-first digest and rows with `id`, `current`, `expected`, `prerequisites`, nonempty source `evidence`, linked `opportunity_ids` and `verdict: "pass"`. The digest covers every field except the comparison's opportunity links and verdicts. Existing three-field discovery digests remain readable. |
| `counterexamples` | Rows with `id`, `scenario`, `expected`, source-backed `result`, nonempty source `evidence`, linked `opportunity_ids` and `verdict: "pass"`. |
| `findings` | An empty array for a passing result. Retain earlier findings separately rather than deleting the failed review evidence. |

Both row lists must be nonempty, with distinct IDs and valid opportunity links.
The completed checklist must cover every opportunity, including held and
excluded decisions.

Changes to source evidence, intended rules, the plan, brand patch or generated
playbook require another independent comparison. The strategy digest omits only
top-level `captured_at`, `discovery_review`, `coverage_review`, `workspace`,
`reconciliation`, `approval_observations`, `submission_reviews` and
`independent_review`. All other fields, including additions and recorded source
revisions, remain bound. Updating only those operational records does not
require another semantic review. Brand version/checkpoint fields
`expectedVersion`, `proposalHash` and `seen` are outside the independent
semantic binding; the exact action review below still binds their current
values. Other brand input fields are refused as unreviewed.

Save the exact `{action,input}` JSON and calculate its digest with
`node <skill dir>/scripts/journey-review.mjs --input-file <action.json>`.
Add a `submission_reviews` row with `action`, `input_sha256`, `status` set to
`complete`, `checked_at` and `claims`. Each claim has `text`, `status`,
`evidence` and `disposition`. Status is `observed`, `proposed` or `unknown`;
disposition is `included` or `omitted`. Observations need source references.
Unknown claims must be omitted. Review the exact playbook prose as well as
the intended message actions; a digest only binds the input you checked.
Then regenerate the Markdown to include this submission review. The order is
packet and playbook render, independent source-first checklist and comparison,
action construction, action digest and claim review, Markdown render, then
submission. Playbook rendering never reads submission reviews, reconciliation,
approval observations, independent review or workspace metadata, so recording a
digest cannot change the input it binds.

For onboarding plan proposal, plan approval and playbook actions, pass
`--journey-review-file` to `manage.mjs action`. Before HTTP it checks the current
generated Markdown and recorded independent review with matching inputs.
Brand actions also require the exact generated playbook before the input digest
and claims are checked. The helper reads both
files as bounded regular files without following a file symlink; it never
writes or repairs them during submission.
Plan approval also reads the current server plan and compares its full
normalized definitions and declarations with the reviewed `plan_input`; event
names alone do not establish a match. An already approved plan is accepted for
retry only when there is no current proposal and its version matches both the
requested version and the workspace's plan version. A newer proposal requires
review of that proposal. After a successful proposal, record its returned
version in `workspace.plan_version` before requesting approval. This records
the selected plan version; it does not claim the plan is already approved.
Keep the artifact and request unchanged during a
same-key retry; refreshed operational inputs need their own exact action review.
For event-only access, use the local `journey-review.mjs` command with both
file flags to check the same wrapper and current Markdown, then submit the plan through the usual
integration API. Send only the plan input there, without the local wrapper.
Direct plan and brand APIs do not certify source coverage. Unrelated ongoing
brand settings changes keep their normal API path. Event-only brand token
proposals still need source-grounded independent review, but this helper does
not validate the `PUT /brand` wire body; preserve its existing source-token
contract.

## Carry the intent into actual plays

Keep stable opportunity IDs and the material rules in the generated playbook.
Compact repeated explanation in authoritative fields while preserving every
material rule and journey. If an input limit prevents
representing the intended scope, report that limit and keep the full artifact;
never silently submit a smaller strategy as complete.

Use the authoring path the workspace supports:

- Default play creation: the confirmed or updated brand playbook feeds Barua's
  automatic proposals. Inspect the resulting catalog and exact revisions.
- When capabilities permit branching proposals: use `play.propose` with
  plain-language intent for a new Play, then wait for the exact prepared
  revision. Change an existing Play through `play.request-changes` with its
  current token. A new proposal does not replace or stop an existing Play.
  Barua owns the graph and copy. Do not enable a feature flag or write a graph
  to bypass unavailable capabilities.

Before approving any play, reconcile its actual rules and rendered emails
against the relevant opportunity. Check branch outcomes and waits as well as
eligibility, subject identity, stops and reentry. Simulate representative and
stopping cases when the current API supports it. A successful authoring job
alone does not pass this review.

Each `reconciliation` row has `opportunity_id`, `play_id`, `revision_id`,
`content_hash`, `role` (`proposed` or `approved`), `review_token`, `status`,
`checks` (specific observed findings) and `checked_at`.
Use `matches`, `mismatch`, `missing`, `unavailable`, `external` or `excluded`
as status. IDs/hashes are null when no revision can be read; never invent them.
Role and token are null when no current play can be read. Use the current
play detail's `summary.token`. Record a separate row for each proposed/approved role:
different policies can share the same email revision and content hash.
`matches` requires inspecting that role's rules and the revision's samples.
An approved match cannot stand in for changed proposed rules. Refresh this
check when the token changes; do not infer it from the name or older approval.

Management approval also needs a separate `approval_observations` row. Read
the exact target with `manage.mjs play --play-id <id> --revision-id <revision>`.
Review `approvalTarget.play` together with `selected.flow` and the selected
revision's synthetic email previews. The target is the policy approval would
execute; `selected.play` can have different display or history semantics.
Do not calculate a policy hash yourself or infer the target from its name.

The observation has `play_id`, `revision_id`, `content_hash`, `policy_hash`,
`review_token`, `status` and `checked_at`. Copy the target's hashes and the
current summary token. Use `matches` only after inspecting the target and
emails. Add `opportunities` as `{id,checks}` rows, with distinct covered
opportunity IDs and specific findings. Each finding fits within 2,000
characters. Add `previews` as `{stepId,languages}` rows covering every selected
email step and every requested language, without duplicates.

Keep current proposed/approved display comparisons in `reconciliation`.
When the canonical target is the current proposed policy, a matching proposed
row is required too. Historical or additive-language targets use their own
canonical observation; do not relabel an unrelated display policy.
Older artifacts remain readable. Add the new observations before a new approval.

Use `manage.mjs action --journey-review-file <journey-review.json>` with the
exact approval input and the current generated Markdown sibling. The helper
rechecks the canonical target and renders
every requested step/language example. Missing renders or lint failures stop
submission. These checks do not replace your copy and policy review or write
findings for you. The API receives the artifact digest and compact evidence;
the full inventory stays local.

Keep the action and artifact bytes unchanged when retrying a lost response,
and reuse the idempotency key. If the review token advanced, the helper can
resend the original record for server replay. A new stale-token request cannot
grant approval. A failed preview under the current token never takes that
recovery path; review the failure, then retry the same request. The helper
shares its existing deadline across detail, previews and submission, with a
2 MiB reply limit and a 16 MiB total read limit. It never approves a partial
set of requested previews.

Missing drafts remain `missing`; inaccessible drafts are `unavailable`.
Request changes for a mismatch through the permitted API, then review the new
revision. A failed request is still unfinished work. Do not approve a mismatch,
invent unavailable permissions, or claim that an unsupported revision cycle
worked. Record the inspected revision and its findings immediately, including
a held revision or failed change request; do not leave the artifact at its
preproposal state while retrying. Event-only agents retain the intended play
rules and report the exact owner steps; they do not claim to have inspected
inaccessible plays.

Recheck this mapping before launch. A covered opportunity may still be
unimplemented, an older approved play may still be active, and an approved
replacement does not itself prove live delivery.

## Resume and hand off

Refresh affected rows when product facts, scope, the event plan, play versions
or sending ownership change. Read current versions before resuming approval.
Before any final handoff, update the observed workspace plan version and
reconciliation rows, then use `--render markdown` to regenerate that view.
Do this for an incomplete run too. Keep the original source observation time
distinct from later checks.
An old approval cannot retrospectively establish that journey coverage was
reviewed. Do not automatically revoke approvals or pause existing sending;
use the owner's requested scope and current grant.

Link the current `journey-review.md` and `journey-review.json` beside the
[observed review package](review-package.md), or the event-only proposal.
The journey artifact includes planned and missing work; the package contains
what Barua actually stores. Read both before reporting completion.
Keep the artifacts available at the authorized private location.

Report **strategy coverage** and **operational readiness** separately, naming
the remaining dependencies. Follow the normal exact-operation checkpoint and
fresh delivery-proof procedure. Do not call a resumed workspace a fresh test,
or a complete event payload a complete onboarding strategy.
