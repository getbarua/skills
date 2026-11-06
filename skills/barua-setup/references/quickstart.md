# Agent-led setup and the first owner sample

Read this after obtaining management access. Browser onboarding establishes the selected site/workspace and private agent handoff. The agent follows the owner's requested scope. One custom event or an owner test is enough to start. Recommend a broader setup review once, without making it a prerequisite. Keep progress brief and reuse known answers.

## Connect to the exact workspace

Set `BARUA_WORKSPACE_ID` to the owner's selected UUID. Set `BARUA_MANAGEMENT_KEY` through a private environment or an authorized secret store. Do not assume a saved file already exists, print the key, or put it in the prompt. Read `manage.mjs capabilities` and `setup`; compare `connection.tenant_id` with the chosen UUID before reporting connected. The helper sends `x-workspace-id` when this environment variable is present. A key controlling a different workspace is not a successful handoff.

Explain that the grant permits the listed Barua actions. It does not grant product repo, DNS, hosting, database, browser or email-provider access. Discover available tools and ask only for missing access needed for the next step. Installing emitters or DNS records still needs the user's authority for those systems.

## Offer the owner sample early

The sample needs `setup:write` and the explicit `test:send` grant. Older keys do not gain it automatically. It uses Barua's verified sender before customer DNS, events or lifecycle planning. It goes only to the granting owner's current verified mailbox. It creates no customer, segment, campaign or real draft and never enables customer sending.

Ask whether to use a forwarded design or a brand sample. For a forwarded design, use the existing sandbox extraction from [management.md](management.md), or an already attached validated layout. An inbound ID alone is insufficient. An agent with browser access may operate extraction; otherwise give the owner the single required action. If extraction is unavailable, explicitly offer a brand sample. Never claim a forwarded design was used when it was not.

Prepare with `manage.mjs action` and a stable idempotency key:

```json
{"action":"setup.sample.prepare","input":{"language":"en","source":{"kind":"brand"}}}
```

For supplied CTA content, use the actual authorized workspace site. `content` is optional; omitting it selects fixed neutral English brand content. For another two-letter language, supply copy written natively in that language. Supplied content has exactly `subject`, `greeting`, `body_html`, `cta_text`, `cta_url`. Limits are 200/200/12,000/120/4,096 characters respectively. No merge fields, remote content fetch, model job or audience is involved. Attached source is `{"kind":"attached"}`. Forwarded source is `{"kind":"forwarded","inboundId":"workspace inbound UUID","surgeryHtml":"checked layout","styles":"checked CSS","audit":[],"problems":[]}`; use the actual extraction result and existing template contract's types, not these illustrative placeholders.

Preparation returns `sampleId`, `contentHash` and `expiresAt`. Read `sample --id <sampleId>` and save `sample-preview --id <sampleId> --output-file <new-private.html>`. Both reads require `setup:write` and are scoped to the granting owner and workspace. Status includes `status`, `ownerVerified`, `acceptedAt`, `deliveredAt` and `expired`; no recipient address is returned. Inspect the exact preview. The inactive footer is a preview label, not an unsubscribe operation. Content expires after seven days and cannot then be sent.

Use `setup.sample.verify-owner` with `{sampleId,contentHash}` to request the fixed mailbox challenge. The owner opens the link and confirms; GET alone does not verify. Confirmation never sends the sample. Resume with `setup.sample.send` using the same exact IDs/hash after the owner asks for this test. Never accept recipient/from/provider fields or substitute another mailbox. The challenge expires after 15 minutes; resend is at least 60 seconds apart, at most 3/hour and 5/day per account/address. Distinct prepares and sample sends are each limited to 5/day per account/workspace. Retry the same operation rather than consuming a new allowance.

Read sample status after sending. Report accepted, delivered, failed and delivery_unknown accurately. Unknown or accepted attempts must not be blindly resent. Skipping this sample is allowed; skipped or accepted is not delivered, and a sample is never full setup or customer activation proof.

## Optional next steps

Stop when the requested event or sample is done. Discuss these choices when
they help the owner's next task, not as a checklist before the first result.

Ask whether to add the optional pixel alongside server events. `manage.mjs pixel` reads the current hash and recovery availability without returning plaintext. If `recoveryAvailable` is true, use `resume --id <recoveryOperationId> --secret-file <new-private-file>` to recover the same still-current key from this connection's earlier operation. A later browser rotation invalidates that recovery. Legacy keys without a recoverable operation cannot be reconstructed. When issuance is needed, `pixel.key.create` takes `{replaceExisting,expectedKeyHash}` and requires setup permission. Read the current hash first. If a key exists, explain that explicit replacement stops the old installed key within the five-minute ingest cache window. Do not rotate it as a read. Use `--secret-file` or `--secret-command-file`; exact retries can recover only the same still-current key. Issuing a key changes no tracking configuration or sending. Use the returned `pixelUrl` and recovered key in the documented `data-key` snippet in [the optional pixel installation guide](https://barua.ai/docs/install.md#the-pixel-optional), including its consent and masking behavior.

Ask whether existing users, consent records or history need import, and who may access that source. Inspect advertised capabilities before promising a route. Historical imports must preserve source, consent, suppression, stable identity and changed-address reconciliation; they do not replay live lifecycle triggers or prove live deployment. Full agent imports remain a separate implementation dependency (PR207); SQL storage alone is not an available API. Use the existing history route only within its documented grant and scope.

## If the owner wants a broader plan

Offer [journey-review.md](journey-review.md) for a broader strategy. When selected, keep its offline HTML and JSON current before artifact-bound submissions. For a specific custom event, use [Start with one event](events.md#start-with-one-event). Prepare campaigns or saved segments only when requested. Actual customer sending still follows its own approval and current consent checks.

Verify capabilities before committing to rules: general per-object targeting is disabled; supported service purposes are receipt, order_shipped, order_delivered, order_delayed, order_cancelled and order_refunded. Other service routes may remain with the product. A current object-state check must have a real supported consumer read, not a promise in the plan. Barua send history does not automatically include other providers. The legacy identity route is not a general new-management-key address-update API. Record these as dependencies where they affect the proposed journey.
