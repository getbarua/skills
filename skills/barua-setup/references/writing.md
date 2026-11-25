# Write emails

Use this procedure when the owner asks you to write or revise a Play or a
campaign, or a saved request is waiting for your copy. Use the management
connection for the selected workspace and keep private input files local.
The [management reference](management.md#http-contract) covers the action
envelope, idempotency and owner authority. Read `capabilities` for the live
schema before sending an action.

With a connected MCP client, use `barua_read` for the reads in this guide.
Start with `{"command":"authoring-inbox","arguments":{"query":{"area":"plays"}}}`.
Use `barua_describe_read` for each read's parameters. For
`play-draft-preflight`, pass the exact `{action,input}` in `arguments.body`.
After it passes, call the named action tool, such as `barua_play_draft_patch`,
with the same `input` and a stable `requestId`. The shell examples below
use the management-key helper.

## Find the work

Run `node scripts/manage.mjs authoring-inbox`. Scope it with `--area plays`
or `--area campaigns` as appropriate. Use the returned `next` with `--after`
for another page. Serve the owner's requested work. An inbox item tells you
what is waiting. Your connection and the owner's request govern what you
can do with it. If the inbox returns `enabled: false`, follow the preparation
workflow in the [management reference](management.md).

| Inbox item | Read for the exact source |
| --- | --- |
| `catalog` | Read `play-catalog` and the relevant approved plan and brand. If the pass yields no useful Play, submit `authoring.complete-catalog` with the item's `sourceVersion`. |
| `proposal`, `feedback`, `discovery` | Run `authoring-request --id <id>` for the saved request. Read the related Play draft or choose an unused Play ID for new work. Retain this request's ID as `jobId` for submission. |
| `template` | Run `play-draft --play-id <play-id>` to read the current copy and rules. |
| `language` | Run `play-draft --play-id <play-id> --revision-id <revision-id> --language <language>` for the pinned version. |
| `campaign` | Run `campaign-authoring-task --id <id>` for the fixed audience's required languages and the campaign brief. |

`wait` on an accepted Play request returns exit 5 with
`preparation.state: "awaiting_agent"` as soon as copy is needed. Open its
request from the inbox and continue with the saved job. For campaigns, poll
`campaign-job` during the audience scan. When it reports `awaitingAgent: true`,
read the writing task by that job's ID.

## Write from the saved facts

Play submission requires confirmed branding and Play review. If the workspace reviews individual emails, use its existing owner review step to enable Plays. An older Play can use one enrollment per matching item. If preflight returns `target_unavailable`, explain the existing audience and ask the owner how it should qualify before changing that rule. A copy edit alone cannot convert that audience.

Use the workspace's brand, voice and approved facts. Start from the reason
this one reader should open the email. Write one clear message with a
specific, grounded ask. Keep the phrasing conversational and cut promotional
filler, manufactured urgency and slogans. Read the result aloud and fix
phrases that sound like a pitch or obscure the offer.

Write directly in each requested locale. Use its natural grammar, register,
compounds, punctuation and spelling. Preserve diacritics, proper names and
the approved product facts. Check the subject, body and button in that locale.

Use the provided link allowlist and declared merge fields. Write merge paths
as `{{field.path}}`. Required fields hold the message when missing, while
optional fields use their declared fallback. Reusable marketing copy uses
`subject`, `greeting`, `body_html`, `cta_text` and `cta_url`. Supply body copy
inside the allowed HTML fragment. Barua applies the workspace's saved design
and generates previews using synthetic reader values.

## Prepare or revise a Play

1. Read `play-draft --play-id <play-id>`. Use `draft` when present and
   `basePlay` to review its currently published starting point. Supply the
   returned `version` as `expectedVersion` and keep the exact `sourceToken`.
   A new marketing Play has `version: null`. Use `authoring` for available
   events, fields, link allowlist, fallback language and branching support.
2. Build the scoped draft action in a private JSON file. `play.draft.save`
   takes `{playId,expectedVersion,sourceToken,play}` with the full policy and
   flow. Put copy in `play.flow.steps[].templates` keyed by language. Use
   `play.draft.patch` for an existing draft or Play, with the same version
   fields, a partial `patch` for policy fields, or `templates` entries of
   `{stepId,language,template}`. A null `template` removes that cell. When
   replacing `flow`, supply the complete flow. A supported service Play uses
   `serviceDesigns` by language. Use the fixed fields in its returned service
   design contract and edit only the allowed wording. After a website change,
   resave each language's design with the current website before submitting.
3. Run `play-draft-preflight --input-file <draft-action.json>` on the exact
   `{action,input}`. Correct its returned issues. Submit that file with
   `action --input-file <draft-action.json> --idempotency-key <request-id>`.
   Reuse the same key if the response is lost. On a source or version conflict,
   read again and reconcile with the current saved draft before a new request.
4. Read again. Preflight and submit `play.draft.submit` with
   `{playId,expectedVersion,sourceToken,jobId?,instructions?}`. Include the saved
   `jobId` from a proposal, feedback or Discovery request. Every email step
   needs copy for the same set of languages, including the workspace's
   fallback. The submitted result is an exact pending revision for review.
5. Read the exact saved revision with `play --play-id <play-id> --revision-id
   <revision-id>`. Verify rules with `play-validate`, preview each intended
   language and simulate a relevant synthetic path when the behavior changed.
   Use the [existing approval procedure](management.md#propose-and-operate-a-play)
   to reconcile the exact revision and review token. Saving copy grants no
   new sending authority. Existing approved content can continue while an
   updated revision waits for approval.

For a feedback request, turn the requested change into one to six standing
`instructions` entries alongside `jobId`, unless the request already has
frozen instructions. Each entry has `text` and may specify `language` when
the request limits the change to one locale. Give `supersedes` the IDs of
accepted instructions this change replaces. Read those IDs in the draft's
`acceptedGuidance`. A language-specific entry can replace only an instruction
in that same language. Keep unrelated instructions. Only feedback requests use
`instructions`, and they become standing guidance when the revision is approved.

For a missing language, use the paired revision and language flags when
reading `play-draft`. Write against the returned source, even when the current
Play has moved on. Preflight and submit `play.draft.localize` with
`{playId,revisionId,language,expectedVersion,templates}`. Set `expectedVersion`
to the locale read's `version`. Supply a template keyed by each step ID, or
`serviceDesign` for a supported service Play. Reconcile the new language
through the existing review for that exact source revision.

## Write a campaign

Follow the [campaign procedure](management.md#send-one-campaign-to-a-saved-segment)
to create a campaign bound to a segment and run `campaign.prepare`. The job
freezes the audience before asking for copy. An empty audience goes directly
to review with no writing task and cannot be sent.

Use `campaign-authoring-task --id <task-id>` to read `revisionId`,
`languages`, the saved brief and allowed URLs. Submit `campaign.draft.variant`
with `{taskId,revisionId,language,template}` once per listed language. If the
brief contains `cta_url`, use that exact value for the template's button.
The action checks the template against the saved inputs and deterministic
preview. A refusal leaves that variant unfilled. Each accepted variant is
fixed for this revision. To change accepted copy, update the campaign and
prepare its new revision. After delivery starts, create a new campaign for
a different message.

The last variant wakes preparation on the saved audience. Read `campaign-job`
and then `campaign` to verify the prepared audience and the actual rendered
previews. Request a send only if the owner authorized one. Keep the exact
prepared revision and follow the separate sending review and timing rules.
