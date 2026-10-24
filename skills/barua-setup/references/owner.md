# Owner access without the app

Use `node <skill dir>/scripts/owner.mjs <command>` for an owner's account,
workspaces and exact decisions. Install `owner-storage.mjs` and
`private-input.mjs` beside it. These files use Node built-ins only, on
Node 18.17 or newer. Routine agent work
uses the separate [management connection](management.md).

## Sign in privately

Set `BARUA_URL` to the trusted barua origin, or use its default
`https://barua.ai`. HTTPS is required except on localhost. Create a directory
owned by you with mode 0700 outside the repository. Set
`BARUA_OWNER_SESSION_FILE` to a file in it. `--session-file` can also name it.
The helper writes that file with mode 0600, serializes refresh and selection,
and replaces it atomically. Symlinks, hard links and files readable by other
users are refused. Inside Git, ignore both the file and its `.lock` directory.
Do not remove a lock while another command is using the session.

`login` takes private JSON stdin or `--input-file` containing `email` and
`password`. Passwords and tokens never belong in arguments. Output contains
the account identity and selected workspace, with credentials redacted.
`session` reads local sign-in status; `refresh` refreshes it; `logout` revokes
this session only. A failed logout keeps local credentials so you can retry.

For existing callers, `BARUA_OWNER_TOKEN` and `BARUA_WORKSPACE_ID` authorize
owner API commands. Do not configure both an environment token and a saved
session: the helper refuses ambiguous credentials. Account commands need the
saved session. The public `/api/auth/config` supplies the fixed auth issuer
and publishable key; service credentials are never requested or used.

## Admission, workspaces and terms

Run `terms` to read the exact current legal version, digest and document
paths. Read those documents before accepting. Never insert an acceptance
automatically because setup needs one.

`signup` remains restricted by early-access admission. Its private JSON takes
`email`, `password`, `invite` when required, `site_url`, optional `from_name`,
`accepted_terms: true`, and your exact `accepted_version` and `accepted_digest`. It requires a new
`--secret-file` or authorized `--secret-command-file` for the pixel key. The
helper saves the key before saving its signed-in session.

`workspaces` lists memberships; use `--after` with its `next_cursor` to keep
reading. `workspace-create` takes the workspace fields and exact acceptance,
plus a key destination. `workspace-select --workspace <uuid>` verifies current
membership before storing that selection. Scoped commands cannot silently
fall back to another workspace. `me` reads its role and terms state.
`terms-accept` takes `{"version":"the reviewed version","digest":"the reviewed digest"}`.

Signup and workspace creation are not automatically retried. After a lost
response, sign in and inspect `workspaces` before creating again. An admitted
account survives interrupted setup. Do not delete it to recover setup.

If the pixel-key response was lost, `pixel-key-rotate` replaces that workspace's
key through the existing API. It requires a new `--secret-file` or authorized
`--secret-command-file`. The previous pixel key stops working immediately.
Update any existing installation explicitly; never rotate automatically after
an uncertain response. Management and integration keys are separate.

## Recovery and team

`recovery-request` takes private JSON with `email`. Read the email, then give
`recovery-complete` private JSON with `recovery_url` and the new `password`.
The original one-use link must come from the configured sign-in issuer and
have `type=recovery`. `token_hash` may replace `recovery_url`. Do not open the
link first or paste it into arguments. The helper exchanges it, saves the
session, then updates the password. If the last step fails, `password-update`
with private `{"password":"..."}` finishes using the saved session. If the
verification response itself is lost, request a fresh recovery email.
If a saved session already exists, use a new private session file or log out
before recovery. A recovery link never replaces another saved account.

`team` lists members and invitations. Follow `members_next_cursor` through
`--members-after`, and `invitations_next_cursor` through `--invitations-after`.
`member-role --id` takes `{"role":"owner"}` or `{"role":"member"}`.
`member-remove --id` removes a member or leaves when the ID is your own.
The server always preserves the last owner.

`invite` takes an email address in private JSON. `invite-resend --id` and
`invite-revoke --id` act on an existing invitation. An `unknown` or `failed`
delivery status exits 5. No invitation send is automatically retried. After
an unknown result or lost response, read `team` before deciding to resend.
Resending changes the link; the server's cooldown applies.

Recipients use `invitation-preview` with private `{"token":"..."}`.
`invitation-register` takes the token and a password for a new account;
existing accounts sign in. `invitation-accept` takes `token`, `accepted_terms: true`,
`accepted_version` and `accepted_digest`. Select its returned workspace ID.
Joining does not admit an account to create unrelated workspaces.

## Grants, reviews and email controls

`connections` reads grants. `connect` takes `label`, `permissions`, `review`
and optional `expiresAt`, plus a stable `--idempotency-key` and secret
destination. Reuse the same key and exact body after response loss.
`recover-key --id` saves the existing connection key again for its granting
owner. `connection-update --id` takes `permissions`, `review`, `expiresAt`
and the current `expectedVersion`. `connection-revoke --id` revokes the grant.

A secret file must be new and, inside Git, ignored. A secret-command file is
a JSON argv array for a previously authorized command. It receives the key on
stdin with output suppressed, no shell and no inherited Barua credentials.
After a transfer failure, recover the same key into a new destination.

`reviews` lists pending requests, with `--after` pagination.
`review-context --id` reads the exact request and current policy. `review
--id` takes `decision` (`approve`, `reject` or `cancel`), `inputHash` and
`policyVersion`. Review does not resume the operation. Its agent must still
resume it through the management helper.

Existing email controls are `drafts --status`, `draft --id`, `autonomy`,
`autonomy-plays`, `draft-approve --id`, `draft-reject --id` and `autosend`.
Draft decisions take `{}` or an optional `note`. Approval can send an email.
Autosend takes `{"enabled":true}` or `{"enabled":false}`. Play and campaign
restrictions remain enforced by the server. Use their management workflows
for those decisions. These writes are never automatically retried.

Run `--help` for options and exit codes. Describe a completed owner decision
separately from a resumed agent operation, and provider acceptance separately
from delivery.
