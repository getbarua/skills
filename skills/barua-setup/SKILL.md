---
name: barua-setup
description: Sets up and maintains Barua email for a product. Reads repos, writes server-side emitters, manages plans, plays, saved segments and one-off campaigns under an owner's permissions, and verifies fresh delivery. Use for setup, event changes, brand or play updates, campaigns, launch, key rotation, and event errors. Supports full delegation or owner review at selected checkpoints.
license: MIT
metadata:
  version: "2"
---

# Barua setup

Use Barua for lifecycle email and one-off campaigns. Follow the access path below,
then the required journey review before selecting events or plays.
Read this whole file and each required branch reference. If a tool truncates
output, read the missing ranges until complete. A heading or clipped-line preview
does not replace the full instructions.

## Choose your access path

- With `BARUA_MANAGEMENT_KEY`, read [management.md](references/management.md)
  before any action. Run `scripts/manage.mjs capabilities` and `setup`, then
  follow [Complete setup and later changes](references/management.md#complete-setup-and-later-changes).
  The returned grant and review policy determine what you can do. Complete
  [Finish and hand off](references/management.md#finish-and-hand-off) before
  every final reply, including a resumed operation or partial run.
- With only `BARUA_API_KEY`, follow the event-only steps below using a test key.
  `scripts/verify.mjs` validates events; it cannot establish provider delivery.

Before creating or handing off credentials, follow
[Access and discovery](references/management.md#access-and-discovery).
The management key (`mk_`) has no test or production mode. Event keys (`ik_`)
have recorded test and live modes. For a missing management key, follow
[Recover a lost management key](references/management.md#recover-a-lost-management-key);
preserve the existing connection.

For both paths, read and complete [journey-review.md](references/journey-review.md):
native source discovery before drafting, then a separate fresh independent review
before any onboarding plan proposal, approval or brand submission. Retain the
complete journey artifacts and reconcile exact Play revisions as that procedure
requires. Full delegation adds no human pause. Produce the current
[review package](references/review-package.md) for the handoff, including incomplete
runs. Use plain factual prose; name the verified outcome and next action.
Avoid promotional filler, dramatic fragments, repetitive lists and contrast slogans.

## Saved segments and one-off campaigns

Before segment or campaign actions, read and follow
[Send one campaign to a saved segment](references/management.md#send-one-campaign-to-a-saved-segment).
Setup and Play permissions do not grant campaign sending.

The event API is `https://barua.ai/api/integrations/v1`, using
`Authorization: Bearer $BARUA_API_KEY`. `BARUA_API_URL` overrides the origin.
HTTPS is required except on localhost. Read `references/events.md` for the
contract and `references/reading-repos.md` for repo discovery.

## Install

```sh
npx skills add getbarua/skills --skill barua-setup
```

Without flags it asks which agents to install for. For one agent without prompts, add `-a claude-code` or `-a codex` and `-y`:

```sh
npx skills add getbarua/skills --skill barua-setup -a claude-code -y
```

Or copy this folder to `.claude/skills/barua-setup/` for Claude Code, or to `.agents/skills/barua-setup/` for Codex.
Install the whole folder: `review-package` needs `scripts/review-package.mjs` beside `scripts/manage.mjs`.
The task formatters need [`templates/journey-discovery-task.md`](templates/journey-discovery-task.md) and [`templates/journey-review-task.md`](templates/journey-review-task.md); final review reads [`references/events.md`](references/events.md) after its own source-first checklist.
When downloading helpers manually, preserve all three relative paths beside the `scripts` directory.

## Before you start

This section and the numbered steps below cover event-only access. Use the management reference for delegated actions.

- The test key goes in a dev env file as `BARUA_API_KEY`, with an optional `BARUA_API_URL`. verify takes each from the environment first, then from `.env.local`, then from `.env`, in the directory you run it from. Run it from the folder that holds the file.
- Before you write the key into a file, run `git check-ignore -q <that file>` on the exact file, such as `.env.local`. It exits 0 only when git ignores the file and doesn't track it. On any other exit, stop: don't write the key there, and ask the owner where the product keeps its dev secrets. Stop the same way when `test -L <that file>` exits 0, because the file is a symlink and the key would land wherever it leads.
- Every call to Barua and every flow you trigger uses the test key. The live key goes only into production's hosting secrets, where the emitters and the erase job use it. Erase takes only the live key, so the test key gets 403 `test_key_not_allowed`, which is expected. If verify exits 2, stop and ask the workspace owner for a Barua test key. Never ask for the live key.
- Create one private handoff receipt file for this run with `mktemp`. Keep its path. Pass each plan or setup JSON response to `node <skill dir>/scripts/handoffs.mjs --record <receipt-file>` through stdin when you receive it. The helper saves owner steps and their links, plus local server gaps recorded during repo inspection. Show its handoff text to the owner. An approval can finish before the next status read, so keep the receipt through the final report.

## Steps

Every step is safe to run again on a repo an earlier run set up. Change what that run wrote in place rather than adding a second copy: the emitter with its emit calls, and the `AGENTS.md` block with its `@AGENTS.md` line. Step 4 sends the full plan again, which Barua matches against the approved one, and step 7 leaves a confirmed brand alone.

1. Check the key before any other call to Barua: run `node <skill dir>/scripts/verify.mjs` with no flags, where `<skill dir>` is this skill's folder. It only reads. If it exits 2, stop: there is no test key to use, and every later step would act with a live key. On exit 1, fix what `error` says and run it again. Any other exit means a test key. If the key changes during the run, start again here.
2. Read the contract: `GET /api/integrations/v1/plan`. It lists the core events (`signed_up` is required), any approved custom events, each event's `id_from`, and a JSON Schema for one event.
3. Read every repo the owner named, as `references/reading-repos.md` describes. Complete and review the journey artifacts required by `references/journey-review.md` before step 4. For the supporting core and custom facts, find where each becomes true and record missing instrumentation as work to implement. Record frontend actions without a server request using the handoff helper's local receipt format, including their source and suggested endpoint.
4. Propose the plan with `POST /api/integrations/v1/plan` on every run, reruns included. Send the full plan: every custom event the product needs, and a `not_emitted` entry with a reason for each declarable core event the product has no source for (`GET /plan` marks those `declarable`). An approved event or declaration you leave out is removed, so send `"events": []` when the product needs none. The optional `consent_updated` stays out of the plan when the product has no source for it, and goes in the report instead. Always propose even when both arrays are empty: a core-only product still needs an approved plan. Barua compares the plan with the approved one, and `"status": "approved"` means nothing changed. Otherwise create the readable event-plan artifact from `references/review-package.md` and show it with the answer's `needs_human` `url` and `why`, then keep building while the owner approves.
5. Write the emitter. Copy `references/emit.ts` into the backend (as `emit.mjs` with the types removed, for plain JavaScript), or write the plain HTTP call from `references/events.md` for another stack. Add an emit call at each commit point. If the product deletes accounts, read the user's email before the delete, and in the same transaction write an erase job that keeps the user's id and that email. The job calls `POST /api/integrations/v1/people/erase` twice, with the id as `external_id` and then with the `email`, because the address Barua holds for the id can be an old one when the email changed. It retries each call until it answers 200 with `"erased": true`, the way `references/events.md` says under "Erase a person", which also covers a delete your database doesn't run and a product with no job queue.
6. Check it. Step 1 found a test key, so note the current time (`date -u +%Y-%m-%dT%H:%M:%SZ`) and trigger each flow through the product's real code, such as its test suite or a local run. Then run `node <skill dir>/scripts/verify.mjs --since <that time>`. Fix what it lists and run it again, as the exit codes below say, until it exits 0 or 4. verify checks the key on every run, so a key that turns live ends the loop at exit 2 before the next flows. For a queue or outbox, also hold delivery at a local test endpoint while exercising a product request: the request must complete with its event saved before delivery resumes. Check a concurrent request too, to catch a worker holding the product's database lock during HTTP.
7. Propose brand tokens with `PUT /api/integrations/v1/brand`: the tokens you found, and in `sources` the `file:line` each came from. `references/events.md` lists the tokens it accepts. When you found no token, as in a backend-only repo, skip the call: Barua refuses an empty proposal, and a token with no source is made up. `GET /setup` then keeps `confirm_brand` open until the owner confirms a brand. Before you send it, read `GET /api/integrations/v1/setup`, and skip the call when its `done` list holds `confirm_brand`. That means the owner confirmed a brand, and a proposal sent after that changes nothing: the owner edits a confirmed brand in Settings. While `confirm_brand` is open, send it: the same tokens again keep the proposal the owner has and take the `sources` you send now (sending none keeps the ones it has), so a token found on another line shows its new place, and new tokens replace the proposal.
8. Read `GET /api/integrations/v1/setup` and record its response with the handoff helper. Pass the same response through stdin to `node <skill dir>/scripts/handoffs.mjs --report <receipt-file>`. Show that report to the owner: it retains local server gaps and earlier review links, and marks completed owner steps from the current `done` list. Preserve its exact lines in your final report, including completed steps.
9. Add `templates/AGENTS.md` to the root `AGENTS.md` of the repo that holds the emitters, and create that file if it's missing. Codex reads it. Claude Code reads `AGENTS.md` on its own only when the repo has no `CLAUDE.md`, so make sure the root `CLAUDE.md` imports it with `@AGENTS.md` on a line of its own: add the line to an existing `CLAUDE.md` that doesn't have it, or create `CLAUDE.md` with only that line. Codex reads an `AGENTS.override.md` instead of the `AGENTS.md` beside it, so when the root has one, add the block there too. Replace an existing block between the same markers. Fill in each placeholder with a path from the repo root: `<emitter path>` with the emitter's, such as `src/lib/barua.ts`, and `<skill dir>` with this skill's folder, such as `.claude/skills/barua-setup`. When the skill sits outside the repo, install it into the repo first, as under Install, so a later agent finds verify at that path. Before you create or change any of these files, run `test -L <file>`, which exits 0 when the file is a symlink, a broken one included. A `CLAUDE.md` or `AGENTS.override.md` that links to the root `AGENTS.md` already shares it, so leave it as it is. Write nothing to or through any other link, and when `AGENTS.md` itself is a link, change none of the three files. Report each link you left as a `needs_human: linked_file` line.
10. Refresh the readable event-plan artifact from `references/review-package.md`. Complete [Finish an event-only run](#finish-an-event-only-run) after all artifact writing, tests and repo checks.

## Finish an event-only run

Immediately before the final chat reply, follow [Finish an event-only run](references/events.md#finish-an-event-only-run). Reread plan and setup after writing artifacts and checking the repo. Preserve the helper’s exact handoff block, including completed and conditional upcoming steps, in both chat and the private artifact. Follow that reference for the later live-deploy check: a `signed_up` must apply through the live key in live mode within 72 hours of its `occurred_at`; backfills never count.

## When verify exits 4

For event-only access, show the owner each `needs_human` entry's `url` and `why`, and finish any other work. Then run verify again every 30 seconds for up to 10 minutes. If it still exits 4, report the open steps. With management access, read management setup and use the allowed action or resume the exact approval operation. The legacy `needs_human` label does not override a delegated grant.

`awaiting_approval` lists events the pending plan adds or stops requiring. They clear when the owner approves the plan.

## ALWAYS

- Send events from server code after the database commit, from a job queue or the platform's `waitUntil`, else `await` the send before responding. That last fallback applies only when there is no durable queue or outbox, including one you add. With a queue or outbox, the request waits only for the transaction that saves the fact and event; it never waits for the worker, flush, drain or delivery. The worker awaits and retries HTTP outside the database transaction. A `consent_updated` that turns marketing off goes only through a job queue or an outbox, because a lost one leaves Barua treating someone who said no as opted in. `references/reading-repos.md` has the order, and how to fit `attempts` to the time the send gets.
- Check `ok` on every emit result, and log a failure with the event's name and `event_id`, never the key. `emit` never throws, so a failure nobody logs is an event lost without a trace.
- Build `event_id` as `<name>:<source row id>`, one per occurrence for repeatable events. When `GET /plan` gives an event an `id_from`, the id is the value it names (`purchased` uses `properties.order_id`). For `checkout_started` it names two values, so the id is `checkout_started:<checkout_id>:<start_id>`, and `start_id` can't contain a colon. A few events build the last part from a value, such as `signed_in`, whose id ends with the UTC date. `references/events.md` lists them.
- Take `occurred_at` from the source row.
- Send `purchased` only once the payment provider confirms the money arrived. A processing payment or a refund never sends it. `references/reading-repos.md` has the rule for Stripe and other providers.
- Use the test event key for development and CI event calls. Use the management key only with the management API under its grant; it always controls the real workspace.
- Trust verify's exit code over your own reading.
- Declare each declarable core event the product has no source for as `not_emitted` in the plan, with a reason. A missing emitter for an existing product fact is implementation work, not a reason to declare it absent. `signed_up` can't be declared, and neither can the optional `consent_updated`, `checkout_started` or any other optional core event, which go in the report instead. Never fake an event to fill the gap.
- Send history with `"mode": "backfill"` (`emit(events, { mode: 'backfill' })`). Only events the product sends as they happen prove the live deploy.
- Report every emit site as `file:function`, every `needs_server_call`, every core event the product has no source for and the moment you chose for `activated`.
- Give the owner a readable artifact with the event rationale and source evidence. Include proposed play rules and exact email previews when management access permits reading them. Preserve the current review policy; an exported report is a dated snapshot, never an approval or delivery receipt.

## NEVER

- Send server facts from browser code, including the pixel's `track()`, or from a database trigger. The pixel's fixed browsing observations use their own ingestion path; never send their reserved names through the server events API or count them as server delivery proof. Never make a job that reads product rows and builds events from them an event's only source. An outbox is different: the commit writes the finished event, and its worker only sends it. A scheduled reconciler may re-send events the emit site already sent, built by the same code with the same `event_id` and `occurred_at`, so a resend is a `duplicate` and never a new fact.
- Start a send that nothing waits for (`void emit(...)`). A serverless or edge platform can end the invocation after the response, and the event is lost along with its failure log.
- Erase from the deletion request alone, awaited or under `waitUntil`. Once the account is gone, only the erase job still holds the id and the email (step 5).
- With event-only access, ask for or read a live key. Do not approve an action or claim approval through that access path. With management access, act only within the current grant and report the recorded executor accurately.
- Print any key or write it into a tracked file.
- Send hand-built events, or add an emit for a fact the product doesn't have, to make verify pass.
- Send source code, env values or a repo map to Barua. Send the declared events and the specific configuration fields the API requires, including a repo-derived playbook when using management access.
- Run a history import without the separate `history:write` grant and authority to read that source. Never use backfill to pass live proof.
- Write to a file through a symlink, such as the env file or `AGENTS.md`, because a link can lead out of the repo to a file other projects share. Run `test -L <file>` before you create or change a file. Step 9 says which links can stay. Leave any other link as it is and report it as a `needs_human: linked_file` line.

## Exit codes

verify prints one JSON object: `ok`, `exit`, `mode`, `since`, `key_mode`, `plan_version`, `missing`, `invalid`, `awaiting_approval`, `not_seen_yet`, `not_emitted`, `needs_human`, `warnings` and `error`. Each `invalid` and `missing` entry carries its own `fix`.

<!-- docs-check:exit-codes -->
| Exit | Meaning | What to do |
| --- | --- | --- |
| 0 | Nothing left to do for this mode. | Report. |
| 1 | verify couldn't run. | Read `error`, fix the flag or the network, and run it again. |
| 2 | No test key to use, such as a live key, or Barua refused the key. | Stop. Make no more calls to Barua and run no more flows. Ask the workspace owner for a test key. |
| 3 | The agent can fix the events. | Fix each entry in `missing` and `invalid`. Then trigger the flows and run verify again with the same `--since`. When `warnings` says more than 10,000 events failed, use a `--since` after your fix instead: the failures before it keep the exit at 3 until they leave the window, even with nothing listed. |
| 4 | A setup step is still open. | Follow "When verify exits 4" above; management access may authorize its action. |
<!-- /docs-check:exit-codes -->

`not_seen_yet` (live mode only) is for information: live traffic can't be forced, and the test key already proved each emitter.

## Report format

End with this report, even when verify exits 0. One line per core event and per custom event, then the erase and plan lines (and the brand line when step 7 sent nothing), then each frontend action with no server request, then each step a person still has:

```text
signed_up → src/auth/signup.ts:createUser
activated → src/projects/publish.ts:publishProject (first published project)
created → src/projects/create.ts:createProject
purchased → src/billing/webhook.ts:handleInvoicePaid
churned → not_emitted: accounts never end, people stop coming back
erase → src/account/delete.ts:deleteAccount queues src/jobs/baruaErase.ts:eraseFromBarua (external_id and email)
plan: proposed version 2
needs_server_call: web/editor/Publish.tsx:onPublish only changes local state. Suggested endpoint: POST /api/posts/:id/publish
needs_human: approve_tracking_plan https://barua.ai/app/#/w/<workspace id>/settings/plan
needs_human: confirm_brand https://barua.ai/app/#/w/<workspace id>/settings/setup
```

- `name → file:function` for each emit site. For `activated`, add the moment you chose in parentheses, so the owner can change it.
- `name → not_emitted: <reason>` for each declarable core event the plan declares.
- `consent_updated → no source: <where you looked>` when the product has no way to change marketing consent later. `consent_updated` is optional, so the plan can't declare it.
- `checkout_started → no source: <where you looked>` when the server never creates a checkout, such as a product with no checkout or one whose checkout lives entirely in a hosted store. `checkout_started` is optional too.
- `<event> → no source: <where you looked>` for any other optional core event whose moment the product has but its server never records, such as shipments tracked only in a carrier's own tool. Leave out the ones the product has no such moment for.
- `erase → file:function queues file:function (external_id and email)` when the product deletes accounts: first the account deletion that writes the erase job, then the job that calls `POST /people/erase` with `external_id` and then `email` until each answers 200 with `"erased": true`.
- `plan: <status> version <version>` from the plan answer. A proposal returning `approved` means it matched the approved plan and nothing changed. Name the actual executor when your management operation approves a new version. `proposed` means that version still needs approval.
- `brand: no tokens found in <the repos you read>` when step 7 sent nothing, so the owner knows the brand is theirs to set under `confirm_brand`.
- `brand: confirmed by the owner, not proposed again` when step 7 skipped the call because `confirm_brand` was done. Add the tokens you found to the line, so the owner can compare them with Settings.
- `needs_server_call: <file:function> <what it does>. Suggested endpoint: <method> <path>` for each frontend action with no server request.
- `needs_human: <step> <url>` for each open step from verify and `GET /setup`. Copy these literal lines into the final report's text block, even when you also give friendly Markdown links. Keep `needs_server_call` lines in that block too; ordinary prose can lose the exact action and source location.
- `completed_owner_step: <step> <url>` lines from the handoff helper, so an approval completed during setup still has a review link in the report. Use the helper's saved receipts and latest setup response to produce this block; a final status snapshot alone loses earlier approvals.
- `upcoming_owner_step: <step> <url>` lines from the current setup response, with the helper's reason and state. These are conditional next steps; recheck setup before acting. The helper prints them without saving them as observed owner requests.
- `pending_owner_step: <step> <url>` lines preserve future email work from older servers without `upcoming`. They are not permission to act or proof of enabled sending. If the helper needs a current workspace link, refresh setup every 30 seconds for up to 10 minutes and rerun its report when review is ready. If it still cannot produce the report, say email setup remains pending; an empty action list does not establish completion.
- `needs_human: linked_file <file> → <target>` for each file you left alone because it's a symlink (`readlink <file>` shows the target), with what you would have written there, so the owner can add it by hand.

Include `review_artifact: <private artifact link>` in the handoff and implementation PR. For management access, link `index.html` and its `review.json` snapshot; for event-only access, link the event-plan Markdown. State any unreadable sections or failed collection. Keep the files private and do not commit or publicly host them by default.

For management access, also report the connection label, completed operation IDs, any exact operation awaiting review, the deployed key's ID (never its secret), and delivery proof ID/status. Distinguish emitter validation, deployed traffic, provider acceptance and confirmed delivery. Describe external work that lacks an authorized tool without calling the entire setup blocked.
