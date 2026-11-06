# Optional customer journey review

Recommend this procedure when the owner wants a broader email strategy. It is
optional for management access and event-only access. A request for one event
or an owner sample can follow [the short event path](events.md#start-with-one-event)
without this artifact. Read access and current state first.

When the owner chooses this review, complete source discovery and the agreed
lifecycle and event taxonomy plan before artifact-bound submissions. Use the user's normal review workflow.
A separate reviewer, model metadata and particular native tools are optional. Management Play approvals also
require a compact reconciliation record bound to the exact policy and emails.
That record cannot establish semantic truth or complete source coverage.
Full delegation continues within its grant, without a new human checkpoint.
An owner checkpoint presents the artifacts and waits on the existing operation.
Reading or exporting configuration does not approve it.

The review covers the agreed strategy. A request for one named message is a
scope boundary; do not expand it into a complete lifecycle review by default.
Record the actual owner boundary with its source.
Choose exclusions for a stated product or priority reason; absence from the
owner's examples is not a reason.

## Discover the experience

Read the available product sources before drafting. The optional `--render discovery-task` formatter provides a portable checklist for your own agent or a reviewer the user chooses. Verify uncertain facts against actual source and map each material observation to a strategy decision. Inventory source-owned entities and variants before selecting messages.
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

For payment recovery, follow every transition that can still confirm the old
transaction, including delayed provider callbacks. A status named `failed`
does not prove that transaction can no longer succeed. Before proposing a
new-purchase destination, establish from source how the previous payment is
permanently closed or how the new attempt cannot create a second purchase.
Otherwise resume the same saved checkout, or record the missing safe recovery
route as a dependency. Check this for purchase offers as well as recovery mail.

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
given. Keep `journey-review.json` and `journey-review.html` together there. An optional Markdown view remains available. Start
from `templates/journey-review.json` in the installed skill, also available as
the [public JSON template](https://barua.ai/skills/barua-setup/templates/journey-review.json). Fill the JSON as
the inventory, then generate its readable view with the installed helper:

```sh
umask 077
node .agents/skills/barua-setup/scripts/journey-review.mjs --render html \
  --journey-review-file /private/authorized/journey-review.json \
  > /private/authorized/journey-review.html
```

Use your installed skill path and an authorized private directory. The helper
writes only to stdout; you explicitly save the output. The HTML filename replaces the JSON suffix
with `.html` in the same directory. It starts with the recorded decisions, then
shows their rules and review records before the detailed source inventory.
Every recorded field remains visible, including unfinished reviews, held
decisions and additive metadata. Rendering does not
certify discovery or approval. Change the JSON and regenerate; do not edit the
generated HTML separately. Its exact bytes use LF line endings, no BOM and
one final newline. Each file must fit within 512 KiB and contain no credentials.

Keep the documented fields and types; additive descriptive metadata is allowed.
Keep the files private and out of commits by default; use a private directory
and file permissions. Include no credentials, customer records or private
message contents. Source references and product facts are sufficient.

Write consumer rules as concise conditions. Keep supporting explanation in the
evidence fields. Each covered consumer needs its material conditions in the
fields that reach the playbook; follow the held-summary rules below for other
decisions. Render and measure the playbook while drafting, before the final
review; use the command and existing limits below.

Do not overwrite earlier evidence from an onboarding test. For a fresh run,
record the authorized empty starting state. Existing configuration makes this
a resumed run; it does not authorize resetting the workspace.

The inventory uses this format. Dates are ISO 8601 UTC. IDs are stable within
the review and must remain unchanged when a row is refined.

| Top-level field | Content |
| --- | --- |
| `version` | `1` |
| `authoring_mode` | New artifacts use `"per_play"`: shared product facts and complete individual Play requests. Omit only when preserving a legacy artifact's full-playbook behavior. |
| `product` | The product being reviewed |
| `captured_at` | When the source and workspace observations were made |
| `sources` | Objects with `repo` and `revision`; use the inspected commit, or explain an unversioned source |
| `owner_scope` | Optional object or null. Its `requirement` is text or null, and `boundaries` is a string array from the owner's actual request; leave unknown scope unrecorded |
| `source_inventory` | Source facts recorded before choosing messages |
| `discovery_review` | First-pass `status`, `checked_at` and `findings`, using the same types as `coverage_review` |
| `journeys` | The discovered situations, including ones that will not get an email |
| `opportunities` | Explicit message or control decisions for those situations |
| `coverage_review` | `status` (`unreviewed`, `complete` or `incomplete`), `checked_at`, and `findings` |
| `intended_inputs` | The generated packet with the full event taxonomy, brand input and current content bindings |
| `event_taxonomy` | Every planned core/custom event with its complete schema, emission source, occurrence identity and consumers |
| `independent_review` | Optional historical review metadata; never a reviewer identity or tool requirement |
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

Each `event_taxonomy` row has `name`, `description`, `emit_when`, `event_id`,
`evidence` (nonempty source references), `properties` (the complete property
schema object) and `consumers` (opportunity IDs). Include core events as well
as custom events. For custom events, use exactly the property definitions in
the intended plan input. Every opportunity's `planned_events` must link back
to that opportunity in `consumers`. Read core schemas from the authoritative
event contract; never infer their fields. Explain the exact source commit point
and stable occurrence ID, even when the emitter still needs implementation.
Retries reuse an occurrence ID; a later transition is a new occurrence even if
the object returns to the same state. Object ID plus current status is not
enough for A → B → A. If the source lacks a durable transition ID or version,
record that emitter/outbox dependency rather than collapsing distinct facts.
New `intended_inputs` packets require this full taxonomy before submission.
Historical packets remain readable with their older schema.

The HTML shows customer situations, the decision mechanics and source-linked
event schemas. It is the full plan for the owner to open locally, not just a
repo review or a list of existing emitters.

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
absolute URL in `context` or `facts`. Preserve the known URL exactly. Read the
workspace's setup and brand responses too: a recorded `site_origin` or confirmed
brand site URL supplies the public origin for a source-verified product route.
Record the response as evidence, combine that origin with the actual action
route and verify its prerequisites. Do not call the origin unknown merely
because the product source omits it.
A relative route alone does not establish its origin. These fields reach the
playbook and its link checks.

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

## Trace the source-to-consumer contract

Before choosing event definitions, complete these checks against the source
inventory and all opportunities that use each fact. Record the resulting rules
in the existing `facts`, `eligibility`, `stops` and `dependency` fields. Keep
observed facts separate from the proposed decision to send a message.

- Define a shared fact from the source operation that establishes it. Trace
  every consumer, including stops and externally owned messages. Put a
  message's audience filter in that opportunity's eligibility. If an event is
  deliberately narrower than the source fact, every other consumer needs its
  own complete observation. Recheck all consumers whenever a definition changes.
- Bind the actor, subject and exact obligation or operation occurrence through
  source relationships and the fields the consumer receives. A prerequisite
  entitlement or a prior distinct purchase is not settlement of this checkout.
  Follow payment, job, order and refund joins where relevant; sharing a subject
  or operation kind does not make two attempts interchangeable.
- Evaluate current state at entry and again before sending, including relevant
  purchases, unresolved operations, refunds and review decisions before the
  trigger. "Nothing since the trigger" is not proof of absence. Name the exact
  observation and how it stays current. A provider reference is an identifier,
  not proof of the milestone: use the source's actual state predicate.
- Follow each proposed action URL through the actual destination and its server
  checks. Record the access and readiness conditions needed for the promised
  action to work, including independent downstream prerequisites. Follow the
  handler to distinguish resuming a saved transaction from creating a new one;
  a plausible URL or label proves neither. Preserve an upstream completion fact when a
  downstream prerequisite is missing. Hold that message, use a verified usable
  destination, or propose the missing observation before claiming readiness.
- Examine time conditions without a new callback. For each relevant deadline
  or waiting state, advance time while leaving stored state unchanged. Record
  whether a decision is needed and which current-state observation would support
  it. A changed timestamp and an elapsed timestamp are different conditions.
  Retain a justified exclusion or an explicit dependency when no observer exists.
- Evaluate each message at the exact state that satisfies its trigger. Apply
  its eligibility and every local or inherited stop literally to that state.
  A job-ready notification must not cancel itself because that same job is
  now complete. Name the source entity and concrete states in every stop;
  generic cross-row rules such as "subject completed or recovered" are not
  sufficient. Apply shared controls only to the rows and outcomes they govern.
  Repeat this check at the intended send time and after relevant transitions,
  including for held rows: a dependency does not repair contradictory rules.
- Re-evaluate the same operation during retry or recovery. Another job finishing
  does not resolve this failure, while this job recovering can invalidate its
  queued failure notice. For queued cancellation, consent or erasure changes,
  define the pending interval's suppression policy and supported observation.
  Do not describe queued cross-system work as already effective.

Trace each required observation into the exact event fields or an authoritative
read the consuming system can actually perform. A proposed read needs a named
implementation dependency until it exists. If exact-object or fresh-state
conditions cannot reach that consumer, mark the affected execution blocked.
Person-level latest-event approximations are not equivalent; keep the complete
intended design and continue independently supported work. Keep material conditions in the
compiled per-Play request, or in the generated playbook for a legacy artifact.
A source reference or private note cannot replace the rule the message consumer
receives. Copy facts and usable URLs must also reach the shared playbook or the
approved copy fields that the email writer actually reads.

## Verify source cases before submission

Apply the contract to concrete cases, not another summary that the plan was
checked. Start from the source's actual states and variants, then test the
proposed decision at their boundaries. Include missing independent prerequisites,
prior distinct operations, recovery and pending control changes where applicable.
Evaluate exact destinations and actions. A broad journey link does not assess
each known failure or recovery state. Include every local and shared rule in
the planned outcome, and pass representative source output through the intended
event validator, including absent fields the source accepts. Record required
normalization or observation dependencies before calling a contract supported.

Use safe isolated product tests with synthetic records where available. Never
exercise payments, email or other side effects in production for this check.
Otherwise trace the actual source branches and record evidence honestly. A
missing capability remains an explicit dependency; do not invent a test result.

Generate a starting table with `journey-review.mjs --render source-cases
--journey-review-file <journey-review.json>`. Complete it under
`coverage_review.source_cases`, adding distinct cases for relevant variants:

| Fields | Record |
| --- | --- |
| `id`, `opportunity_id`, `source_ids` | Distinct case ID, exact decision and all source-inventory facts it uses |
| `case_kind` | `typical` or `boundary`; every decision needs a meaningful boundary case, including held and excluded work |
| `source_state`, `intended_action`, `source_preconditions` | Concrete current state, exact destination/action/obligation and its independently required conditions |
| `method`, `observed_result` | `isolated_test` or `source_trace`; result `{kind,detail}`, with kind `returned`, `rejected`, `state` or `unavailable`, describing what the source actually did or requires |
| `expected_outcome`, `planned_outcome` | Source-supported `send`, `hold` or `stop`, compared with what the literal intended rules do in that state |
| `evidence`, `checked_at` | Source locations and local test command/result or branch trace, plus check time |
| `source_sha256`, `decision_sha256` | Generated bindings to cited facts/revisions and the exact decision with shared controls, owner scope and its event schemas; recheck affected cases before refreshing them |

For example, a finished operation may point to an action that independently
requires a prepared asset. With that asset absent, record the action's rejection,
the source-supported hold and whether the literal message rule would still send.
If it would, correct the rule and repeat the case. Evaluate intended behavior
as if its implementation existed: `decision: blocked` is not a passing policy
result and does not repair a false promise in a held row.

Apply each material fact to every linked decision. Add missing consumer links
when a case exposes them. An `unavailable` result requires a source trace and
a blocked decision with its precise dependency and next action. Complete known
branch traces even when execution is unavailable. The helper checks recorded
coverage, explicit outcome mismatches and current bindings; it does not infer
semantic truth or execute arbitrary product code.

Save the case table before regenerating `intended_inputs`; its evidence is part
of the packet digest. New intended-input submissions require this table.
Historical artifacts remain readable. Use the owner's normal agent and tools;
there is no reviewer identity, model or native-tool requirement.

## Check coverage before plan operations

In the second pass, review the map against the separate source inventory. Do not only reread
the opportunities already selected. Every material route/state, relevant
failure/recovery outcome and existing sender must reach a documented decision.
Check source claims and use applicable counterexamples from this checklist:

- Recovery must open the exact saved object, quote or transaction after signing
  in on another device. A generic dashboard link does not establish recovery.
- Actual reading before readiness prevents false unread claims. Readiness
  separately controls activation and purchase eligibility.
- Paid, accepted, completed or delivered purchases prevent unwanted repeat
  purchase offers. Reordering is an explicit customer action.
- Triggers, waits, inactivity, eligibility, stops, reentry and frequency remain
  coherent when time passes without another callback.
- Later unpaid previews, repeat customers and per-object credit applicability
  remain covered after the first lifecycle completes.
- Review submitted and skipped are explicit decisions. Opening alone does not
  establish satisfaction or justify a review reminder.
- Export requested is not download completed, and payment is not readiness.
- The customer used a different creation mode or left a different task unfinished.
- Another object completed while the triggering object still needs attention.
- Payment remains unresolved after the proposed delay. Elapsed time alone
  does not establish failure or permission to start another purchase.
- A failed operation returned to pending or processing, or later recovered.
- An old failed payment succeeds after a new checkout is created and paid.
  Trace both callbacks and resulting entitlements or jobs. A new-purchase CTA
  is unsafe unless the old payment is terminal or the source prevents the
  duplicate; a pre-send check for only paid or processing states is insufficient.
- Several distinct successful operations accumulate for the same object.
  Check the total and avoid counting retried or unsuccessful operations.
- An existing sender already sent the same purpose for that occurrence.
- Consent was refused, access changed or the account/object was deleted.

Check that the proposed trigger, subject, eligibility, timing, stops, reentry
and required context handle those cases. Field presence and valid event JSON
do not prove this. Compare material facts, including amounts and product
promises, with the source and with both artifact views. This author check
establishes the source-grounded coverage recorded below.

Set `coverage_review.status` to `complete` only after that pass, with its time
and any explicit remaining dependencies. An unassessed area or unsupported
claim leaves it `incomplete`: finish that discovery before proposing or
approving the intended plan. A complete coverage entry still needs current exact input bindings before submission. An assessed blocked, excluded or
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
the recorded strategy before checking the exact inputs:

```sh
umask 077
node .agents/skills/barua-setup/scripts/journey-review.mjs --render playbook \
  --journey-review-file /private/authorized/journey-review.json \
  > /private/authorized/playbook.txt
```

Copy those exact UTF-8 bytes into `input.playbook` when building the action
JSON. The output is already trimmed and has no final newline. In `per_play`
mode it contains each covered row's kind, context, facts and sending owners.
Complete message rules go into the individual requests below. A legacy artifact
without the mode keeps all documented covered rules in this playbook, including
implementation work and planned events.
The playbook keeps labeled plain text, with shorter repeated labels to save
space. `Sends now` records current ownership; `Send via` records proposed
ownership. Field values and their line boundaries remain intact for email facts,
links and human review. Blocked and excluded rows begin with an instruction not
to create a Play; controls and existing sender ownership remain explicit.
Blocked and excluded rows' complete intended rules remain in the private JSON
and HTML. The playbook exports only their outcome, ownership, reason, dependency and next
action, with journey and kind labels. Put constraints needed to interpret the
hold in that summary. If another consumer needs the same fact or condition,
record it in that consumer's actual rules too; a held row's private rules do not
reach that consumer. Resolving a hold requires a new render and review.

The generated playbook must fit both existing limits: 24,000 JavaScript
characters and 32,768 UTF-8 bytes. The latter prevents the proposal consumer
from cutting off its end. An oversized result is refused, with both sizes and
the largest rows. New artifacts use `per_play` so complete message rules do not
compete for this shared space. Preserve every opportunity and material
condition; do not drop or merge distinct decisions to fit. Regenerate and measure
before preparing the review packet, then check affected consumers if
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

### Preserve complete rules in each Play request

Use the new template's `authoring_mode: "per_play"` before drafting. Record an
`execution_target` on every opportunity:

- `{"type":"marketing"}` declares a covered Barua marketing Play, with its
  normal consent requirements. A service need can use this lane only when the
  reviewed ownership and consent rules allow it.
- `{"type":"fixed_service","purposes":["receipt"]}` declares one or more of
  Barua's fixed purposes: `receipt`, `order_shipped`, `order_delivered`,
  `order_delayed`, `order_cancelled`, `order_refunded`. Review each actual
  purpose's revision separately. These are never marketing proposals.
- `{"type":"none"}` is required for held, external and control decisions.
  It does not authorize a Play proposal or approval.

The target is a reviewed declaration, not evidence that the sender or consent
choice is correct. Your agent's review workflow compares it with the full source and
rules. The helper refuses executable targets on held or control rows and keeps
exact approval targets in the declared lane.

The packet adds `play_requests`, one entry per marketing target. Each contains
`opportunity_id`, `action: "play.propose"` and `input`. All original message-rule
fields and every covered control are included. Controls retain their scopes;
unrelated message rows are not implicit dependencies. Expand any required
condition from another row into the consuming row before review. The packet
contains the exact complete requests, not summaries or extra reviewer digests.

Each request must fit the existing limits: intent 4,000 characters, audience
2,000, trigger and goal 1,000 each, and at most 12 requirement strings of 1,000
each. Complete intent JSON must fit 24,000 UTF-8 bytes. Characters use JavaScript
string lengths. The helper refuses chunks that trimming would change, and a
complete packet over 512 KiB. An over-limit request is a transport limitation;
do not remove conditions, controls or decisions to make it pass.

After plan approval and brand confirmation, inspect any automatically prepared
drafts against the complete requests. Shared factual context alone does not
establish their intended triggers or stops. Adopt only an exact match. For a
missing supported marketing Play, select its packet entry, remove only the
`opportunity_id` wrapper field, and add the current `input.expectedToken` from
`play-catalog`. Keep the other input values and strings unchanged. Calculate the ordinary
action digest, record the source-based claim review and regenerate the HTML
from the current JSON. Regenerate Markdown too if you use that optional view.
Both the local action check and `manage.mjs action` require
`--journey-review-file <audit.json> --opportunity-id <opportunity-id>`.
The helper recompiles the request and refuses a mismatch before HTTP.

Propose one Play, wait for its operation, then read the current catalog before
the next proposal. The returned Play ID may differ from the opportunity ID;
record that mapping and inspect its exact rules and every email example before
approval. A test fixture with no authoring worker cannot prove these requests
complete: inspect its supplied drafts and report other work unfinished.
Creating a new Play does not replace an approved one. Small corrections use
the existing feedback action; do not squeeze a full replacement into its
4,000-character note or retire a live Play to work around that limit.

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
`playbook_sha256`. In `per_play` mode it also contains the exact `play_requests`.
Your agent's review workflow checks each request and target against the linked opportunity and
all applicable controls. Supplying `checklist` also returns `checklist_sha256`.

Save the complete packet as `intended_inputs` in the journey JSON. Its hashes bind source revisions, lifecycle decisions, full event definitions and brand content. Do not store the packet as a different author's claim. Historical `independent_review` input packets remain readable; reviewer identities and native tool records are not submission requirements.

Regenerate the HTML after recording the packet. Before the first plan proposal, the locally openable HTML must show the full lifecycle and complete event taxonomy, including emission sources, properties, identifiers and consuming opportunities. The exact generated HTML and JSON must match. An unfinished source review cannot be hidden by a complete-looking artifact.

Optional task formatters accept `owner_request`, `source_files`, `strategy_file` and `packet_file`, and return a `prompt`. Use available read-only tools; they do not launch a model or require delegation. Model and effort fields in old context files are tolerated but not required or emitted.

## Bind and submit the current inputs

Check the actual action against source and record its exact `submissionHash` in `submission_reviews`, with status `complete`, `checked_at`, and claims. Each claim has `text`, `status` (`observed`, `proposed` or `unknown`), `disposition` (`included` or `omitted`) and `evidence`. Observed claims need source evidence; unknown claims must be omitted. Regenerate the HTML after this record.

```sh
node .agents/skills/barua-setup/scripts/journey-review.mjs \
  --input-file /private/authorized/action.json \
  --journey-review-file /private/authorized/journey-review.json
```

The helper checks complete discovery and coverage, the current input packet, matching HTML and exact action claims. It does not certify that source was read or that an email was delivered. Plan approval also reads the current proposed/approved definition and version; Play approval reconciles the exact revision, policy and requested language previews. Owner approval and grant restrictions remain in force.

The strategy digest excludes operational progress fields: `captured_at`, `discovery_review`, `coverage_review`, `workspace`, `reconciliation`, `approval_observations`, `submission_reviews`, `intended_inputs` and optional `independent_review`. All other fields, including additions and source revisions, are bound. A correction requires checking every affected consumer, regenerating the input packet and HTML, and recording the new exact action. It does not require a fresh independent reviewer.

The action hash still includes optimistic concurrency values such as `expectedVersion`, `proposalHash` and `seen`. Changing those requires a fresh exact submission record even when the underlying plan is unchanged. Event-only submissions follow these same local checks before their HTTP call.

## Carry the intent into actual plays

Keep stable opportunity IDs and every material rule in the artifact. With
`per_play`, the compiled requests carry those rules; the playbook carries shared
context. Legacy artifacts retain rules in the playbook. If an input limit prevents
representing the intended scope, report that limit and keep the full artifact;
never silently submit a smaller strategy as complete.

Use the authoring path the workspace supports:

- Default play creation: the confirmed or updated brand playbook feeds Barua's
  automatic proposals. In `per_play` mode that input has shared context only;
  inspect the resulting catalog and reconcile exact revisions against the full
  opportunity rules. Automatic generation does not establish rule coverage.
- With confirmed brand context, Play review and the connection's proposal
  permission: use the compiled `play.propose` request for a new Play, then wait for the exact prepared
  revision. Change an existing Play through `play.request-changes` with its
  current token. A new proposal does not replace or stop an existing Play.
  Barua writes a sequential Play when branching is disabled and a graph when
  enabled. Do not enable a feature flag or write a graph
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
exact approval input and the current generated HTML sibling. The helper
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
reconciliation rows, then use `--render html` to regenerate the browser artifact
from the current JSON. Use `--render markdown` too if you keep that optional view.
Then run `journey-review.mjs --check-final --journey-review-file
<journey-review.json>`. It checks current coverage, inputs and the actual HTML
without making a request. A printed digest alone is not validation. Keep
operation logs/package notes separate or in the documented observational fields;
arbitrary new top-level metadata changes the strategy digest. If inputs changed,
regenerate the current packet and HTML, then repeat the check.
Do this for an incomplete run too. Keep the original source observation time
distinct from later checks.
An old approval cannot retrospectively establish that journey coverage was
reviewed. Do not automatically revoke approvals or pause existing sending;
use the owner's requested scope and current grant.

Link the current `journey-review.html` and `journey-review.json` beside the
[observed review package](review-package.md), or the event-only proposal.
The journey artifact includes planned and missing work; the package contains
what Barua actually stores. Read both before reporting completion.
Keep the artifacts available at the authorized private location.

Report **strategy coverage** and **operational readiness** separately, naming
the remaining dependencies. Follow the normal exact-operation checkpoint and
fresh delivery-proof procedure. Do not call a resumed workspace a fresh test,
or a complete event payload a complete onboarding strategy.
