# Read Barua without the app

Use `manage.mjs` for customer profiles, segments, campaigns and operation
status. Use `inspect.mjs` for setup details, diagnostics, Play previews and
email content. Install the whole skill: inspection needs
`scripts/inspect-output.mjs`, `scripts/owner-storage.mjs` and
`scripts/private-input.mjs` beside
`scripts/inspect.mjs`. All helpers use Node built-ins only.

Set `BARUA_MANAGEMENT_KEY` and the trusted `BARUA_URL` in the environment.
The default URL is `https://barua.ai`. Owner tokens and event keys cannot
substitute for a management key. Never pass credentials in arguments.

Run each helper with `--help` for flags. Run `manage.mjs capabilities` first:
its `reads` map names each helper, method, path and permission rule.
`permissions` requires every listed scope; `any_permissions` requires at
least one when nonempty. `allowed` describes those scopes, while
`connection.terms_current` separately describes terms acceptance. An empty
scope list still requires an authenticated, active connection.

A real-person `play-preview` also requires `people:read`, represented by
`conditional_permissions` for the private `personId` body field. Example
previews use made-up people. Campaign detail includes customer examples only
with `people:read`. Existing connections never gain new scopes automatically.

All paths below are under `/api/management/v1`. These commands read or
simulate; they do not save decisions or send email. `proof` here means its
plain GET form, without the separate event-binding flags. Use the action
workflow in [management.md](management.md) for changes.

| Command | Helper | Method and path | Required scopes |
| --- | --- | --- | --- |
| `capabilities` | `manage.mjs` | `GET /capabilities` | Connection |
| `setup` | `manage.mjs` | `GET /setup` | Connection |
| `usage` | `manage.mjs` | `GET /usage` | Connection |
| `operations` | `manage.mjs` | `GET /operations` | Connection |
| `status` | `manage.mjs` | `GET /operations/:id` | Connection |
| `proof` | `manage.mjs` | `GET /proofs/:id` | Connection |
| `segments` | `manage.mjs` | `GET /segments` | Connection; one of segment:write, campaign:write, campaign:send |
| `segment` | `manage.mjs` | `GET /segments/:id` | Connection; one of segment:write, campaign:write, campaign:send |
| `segment-fields` | `manage.mjs` | `GET /segment-fields` | Connection; one of segment:write, campaign:write, campaign:send |
| `campaigns` | `manage.mjs` | `GET /campaigns` | Connection; one of segment:write, campaign:write, campaign:send |
| `campaign` | `manage.mjs` | `GET /campaigns/:id` | Connection; one of segment:write, campaign:write, campaign:send |
| `campaign-recipients` | `manage.mjs` | `GET /campaigns/:id/recipients` | people:read; one of segment:write, campaign:write, campaign:send |
| `campaign-job` | `manage.mjs` | `GET /campaign-jobs/:id` | Connection; one of segment:write, campaign:write, campaign:send |
| `play-catalog` | `manage.mjs` | `GET /plays/catalog` | Connection |
| `play-job` | `manage.mjs` | `GET /plays/jobs/:jobId` | Connection |
| `play` | `manage.mjs` | `GET /plays/:id/detail` | Connection |
| `play-definition` | `manage.mjs` | `GET /plays/:id/definition` | Connection |
| `play-validate` | `manage.mjs` | `POST /plays/:id/validate` | Connection |
| `play-simulate` | `manage.mjs` | `POST /plays/:id/simulate` | Connection |
| `play-runs` | `manage.mjs` | `GET /plays/:id/runs` | people:read |
| `play-trace` | `manage.mjs` | `GET /plays/:id/runs/:runId` | people:read |
| `play-admissions` | `manage.mjs` | `GET /plays/:id/admissions` | people:read |
| `play-feedback` | `manage.mjs` | `GET /plays/:id/feedback` | Connection |
| `play-paths` | `manage.mjs` | `GET /plays/:id/path-counts` | Connection |
| `people` | `manage.mjs` | `GET /people` | people:read |
| `people-search` | `manage.mjs` | `POST /people/search` | people:read |
| `person` | `manage.mjs` | `GET /people/:id` | people:read |
| `person-activity` | `manage.mjs` | `GET /people/:id/activity` | people:read |
| `person-events` | `manage.mjs` | `GET /people/:id/sessions/:sessionId/events` | people:read |
| `keys` | `inspect.mjs` | `GET /keys` | Connection |
| `brand` | `inspect.mjs` | `GET /brand` | Connection |
| `plan` | `inspect.mjs` | `GET /plan` | Connection |
| `event-status` | `inspect.mjs` | `GET /events/status` | Connection |
| `events` | `inspect.mjs` | `GET /diagnostics/events` | Connection |
| `stats` | `inspect.mjs` | `GET /diagnostics/stats` | people:read |
| `catalog` | `inspect.mjs` | `GET /plays/catalog` | Connection |
| `domain` | `inspect.mjs` | `GET /domain` | Connection |
| `inbound-templates` | `inspect.mjs` | `GET /templates/inbound` | setup:write |
| `inbound-template` | `inspect.mjs` | `GET /templates/inbound/:id` | setup:write |
| `plays` | `inspect.mjs` | `GET /plays` | Connection |
| `play-map` | `inspect.mjs` | `GET /plays/map` | Connection |
| `play-mode` | `inspect.mjs` | `GET /plays/mode` | Connection |
| `play-results` | `inspect.mjs` | `GET /plays/results` | Connection |
| `play-template` | `inspect.mjs` | `GET /plays/:id/template` | Connection |
| `play-profiles` | `inspect.mjs` | `POST /plays/profiles` | people:read |
| `play-preview` | `inspect.mjs` | `POST /plays/:id/preview` | Connection |
| `profile-preview` | `inspect.mjs` | `POST /people/:id/preview` | people:read |
| `emails` | `inspect.mjs` | `GET /emails` | people:read + emails:read |
| `email` | `inspect.mjs` | `GET /emails/:id` | people:read + emails:read |
| `email-preview` | `inspect.mjs` | `GET /emails/:id/preview` | people:read + emails:read |
| `email-raw` | `inspect.mjs` | `GET /emails/:id/raw` | people:read + emails:read |

## Private inputs and files

Supply customer searches and previews as JSON stdin or `--input-file`.
`people-search` accepts exactly one of `email` and `external_id`.
`play-profiles` accepts `{email, after?}`. `profile-preview --id <uuid>`
accepts `{play_id?}`. `play-preview --play-id <slug>` accepts
`{revisionId, stepId, language, personId}` or
`{revisionId, stepId, language, example:true}`. Never put email addresses
in query strings or command flags.

For stored mail, first read `inspect.mjs email --id <uuid>`. It distinguishes
accepted provider content, prepared content and legacy saved drafts. Legacy
drafts have an unknown send-time recipient and are not exact submissions.
An acceptance records what the provider accepted, not inbox placement.

Save `email-preview --id <uuid> --output-file <new-private-file>` to inspect
inert text without tracking images, live links or unsubscribe requests.
`email-raw` uses the same flags but saves original untrusted HTML. Do not open
that raw file as a preview. Neither command prints HTML or opens a browser.

Ordinary inspection output also hides HTML fields. Add `--output-file` to
save the full private JSON. Files are created exclusively with mode 0600,
refuse final symlinks and must already be ignored when inside Git. Existing
files are never overwritten. Failed reads remove the unfinished destination.
Do not commit or publish customer artifacts.

Follow the declared `next_cursor` response field, repeating the same filters.
For Play versions, pass the returned `nextVersion` to `manage.mjs play
--play-id <slug> --after-version <uuid>`, preserving any `--revision-id`.
`inspect.mjs` never retries or automatically walks pages. It accepts
`--timeout-ms` from 1 to 300000, defaults to 60000, and shares that time across
input, HTTP and file handling. Responses have an 8 MiB cap.

Statistics preserve the app's counts and optional `--health` ledger.
Failed or oversized reads return unavailable instead of partial totals.
Profile sections marked unavailable are not empty profiles. Customer preview
uses the real eligibility reader, with 50 seconds for work and five seconds
for abort and response handling. It makes no model call and sends nothing.

