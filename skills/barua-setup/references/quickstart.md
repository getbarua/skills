# Connect and start one task

Use this once at the start of a management task. For event-only access, follow [the test-key path](event-only.md#before-you-start).

## Connect to the exact workspace

Read [Access and discovery](management.md#access-and-discovery) before using or creating credentials. Set `BARUA_WORKSPACE_ID` to the owner's selected UUID and load `BARUA_MANAGEMENT_KEY` privately into the helper's environment. A new private file or authorized secret store is fine; do not assume a file exists. Never put keys in chat, command arguments, prompts or tracked files.

Set `BARUA_SKILL` to the actual installed skill directory, for example
`export BARUA_SKILL="$PWD/.agents/skills/barua-setup"` for that Codex location.
Check that `$BARUA_SKILL/scripts/manage.mjs` exists; another installation may
use a different path. The [installation reference](install.md) covers fallback.

```sh
node "$BARUA_SKILL/scripts/manage.mjs" capabilities
node "$BARUA_SKILL/scripts/manage.mjs" setup
```

Compare `connection.tenant_id` with the selected UUID; the helper sends `x-workspace-id`. Read the actual grant, review policy and `terms_current`. Full delegation does not add permission or authorize factual marketing attestations. A grant applies to the real workspace; event test keys do not make management actions a dry run.

Reuse sufficient access. If the key is unavailable, read [Recover a lost management key](management.md#recover-a-lost-management-key) before proposing replacement. For a new connection, read the [Helper](management.md#helper) secret-destination rules and the relevant [owner procedure](owner.md). Never duplicate or revoke a connection just to recover it. Owner terms acceptance and external-system authority are separate.

## Perform the selected task

Return to the [task router](../SKILL.md#choose-the-requested-task). Ask only for missing choices needed by that task. Keep updates brief and reuse known answers.

Use `capabilities` for the current input schema and the selected task's complete contract before an action. Send private `{action,input}` JSON through `manage.mjs action --idempotency-key <stable-request-id> --input-file <private.json>`. Preserve the operation UUID and exact request. Read `status --id <operation-id>`; use `wait` or `resume` for that same operation when allowed. Read [Errors and recovery](management.md#errors-and-recovery) on a refusal or uncertain result before retrying.

Before the first action, read [Operation recovery and owner checkpoints](management.md#operation-recovery-and-owner-checkpoints), including exact approval bindings, terminal states and retry limits. These rules apply to narrow tasks too.

A checkpoint waits for the owner's exact operation approval. Do not replace requests to bypass review. A timeout is not cancellation; keep the same request and idempotency key after uncertainty. Accepted preparation or provider acceptance does not establish a ready email or delivery. For a key-producing action, read the [Helper](management.md#helper) secure-transfer rules first and use an explicit private destination.

Stop at the selected outcome and follow [Next onboarding task](../SKILL.md#next-onboarding-task). A sample or one-event result gets a scoped handoff; full setup uses [Finish and hand off](management.md#finish-and-hand-off).

## Offer the owner sample early

The full sample procedure moved to [Owner sample](owner-sample.md#offer-the-owner-sample-early). Read it before preparing, verifying the mailbox or sending.

## Optional next steps

Pixel recovery and history constraints moved to [Optional setup](optional-setup.md#pixel-and-history). Do not read or perform them unless relevant.

## If the owner wants a broader plan

Follow [Journey review](journey-review.md) only when selected; a full journey is not required for a named event or sample.
