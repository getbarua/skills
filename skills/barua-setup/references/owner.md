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
session: the helper refuses ambiguous credentials. Login, refresh, logout and
password changes need the saved session. Account deletion also accepts an
owner token. The public `/api/auth/config` supplies the fixed auth issuer
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

## Close a workspace and keep its export

Workspace closure and account deletion are separate decisions. Closing a
workspace stops its work and queues export and cleanup. It does not delete the
owner's sign-in account or their other workspaces. Do not close a production
workspace, request erasure, extend retention or delete an account automatically
as part of setup, testing or recovery. These commands require the owner's
explicit decision for that exact target.

Read `closure-status --workspace <uuid>` first. To request closure, send private
JSON to `workspace-close --workspace <uuid>`:

```json
{
  "request_id": "a-new-uuid-saved-for-this-request",
  "confirm_workspace": "the-exact-workspace-uuid",
  "confirmation_version": "2026-10-23-v1"
}
```

Supply real UUIDs and save that request. The helper does not fill in confirmation
or retry closure automatically. After a lost response, read `closure-status`
before explicitly retrying the same request. A queued closure is not a finished
export. Report its phase, blockers and download availability from the response.
Primary data cleanup waits for the verified export; membership remains while
export, retention or erasure obligations are outstanding.

The archive expires 30 days after closure is requested by default. Read the
exact `archive_expires_at` from status. An explicit owner decision can extend
it with `closure-extend --workspace <uuid>` and private JSON
`{"until":"the-chosen-ISO-timestamp-with-time-zone"}`. An extension must move
the deadline forward and cannot restore an archive already being removed.
There is no automatic extension, including when a slow export reaches its
deadline. Read the blocker and obtain an explicit retention decision.

Use `closure-artifacts --workspace <uuid>` for a bounded manifest page. The
server defaults to 20 records; `--limit` accepts 1 through 100. Continue with
`--after <artifact-uuid>` from the page. Download each required chunk with:

`closure-download --workspace <uuid> --id <artifact-uuid> --revision <exact-revision> --output-file <new-private-file>`.

Keep the revision exactly as returned, including large decimal values. Each
chunk is at most 1 MiB. The API verifies its checksum, byte count and current
authority before releasing it. The helper uses the authenticated API directly,
refuses redirects and never creates or follows signed download URLs. It writes
the original bytes to a new mode 0600 file inside a private 0700 directory.
Existing files and symlinks are refused; failed downloads remove their new
file. Output contains only its destination, byte count and checksum. Keep
exports out of logs, shared directories and Git.

For an authorized person's erasure, `closure-erase --workspace <uuid>` takes
private JSON `{"email":"the-persons-address"}`. Never put the address in an
argument or URL. Downloads are held until redaction has been verified; the
request response is not proof that erasure is finished. Read status and the
current manifest again. Old revisions cannot bypass the hold. After final
archive removal, closure status remains available to recorded owners while
their account exists, but no archive bytes remain available.

## Delete the sign-in account separately

`account-deletion` reads the current account ID, deletion version and blocking
memberships. Any workspace membership blocks deletion, including an archived
workspace with unfinished obligations. Leave or finish closing each workspace
first; the last owner cannot be removed while their obligations remain.

1. Review the exact account ID and version `account-deletion@1`. Run
   `account-delete-prepare --receipt-file <private-file> --idempotency-key <saved-request-label>`
   with private JSON `{"account_id":"the-exact-account-uuid","version":"account-deletion@1"}`.
   The helper saves the request before sending it, then durably saves the
   returned receipt before reporting success. Preparation alone deletes nothing.
2. Keep the receipt file. It is mode 0600 in a private 0700 directory, bound to
   the original barua origin. The response gives the account, version, request
   ID and preparation expiry. Preparing expires after 15 minutes; a same-request
   retry while signed in returns and saves a replacement receipt.
3. Only after the owner's deletion decision, run
   `account-delete-confirm --receipt-file <private-file>` with private JSON
   `{"account_id":"the-exact-account-uuid","version":"account-deletion@1","request_id":"the-saved-request-uuid"}`.
   All fields must match the saved request. The helper reads the receipt from
   that file; a pasted receipt alone cannot authorize deletion. Confirmation
   also requires the account's verified owner JWT.
4. After a lost confirmation response, run
   `account-delete-status --receipt-file <private-file>`. It loads no sign-in
   session and sends only the private receipt. It can report completion after
   sign-in stops working. This command is status-only: it cannot delete, recreate
   an account, fetch personal data or download an archive. Follow its safe
   next action; another confirmation still requires the original account's JWT.

After a lost preparation response, retry with the same file, account, version
and request label while signed in. If the file or request label itself was lost,
wait until the unconfirmed preparation expires, then prepare with a new label
and a new private file while signed in. The server assigns a new request ID and
invalidates all previous receipts. Confirmed deletion can never be restarted
this way. Never discard a receipt because a command
failed. Receipts and credentials stay out of arguments, URLs, output and logs.
Within Git, ignore the private file and its `.lock` directory. A successful
confirmation clears matching credentials from the helper's saved session.
An externally supplied token remains the operator's responsibility.

Legal acceptance evidence is retained for five years under its account or
workspace policy. Deletion does not remove that evidence immediately. Completed
closure receipts lose the deleted account's identifier; other owners retain
their own status access.

Run `--help` for options and exit codes. Describe a completed owner decision
separately from a resumed agent operation, and provider acceptance separately
from delivery.
