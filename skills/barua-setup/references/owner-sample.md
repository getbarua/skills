# Send an owner-only sample

Use this for a test email to the granting owner. First complete the [workspace and access check](quickstart.md). This task stops at its actual sample result; it does not require a full setup report.

## Offer the owner sample early

The sample needs `setup:write` and the explicit `test:send` grant. Older keys do not gain it automatically. It uses Barua's verified sender before customer DNS, events or lifecycle planning. It goes only to the granting owner's current verified mailbox. It creates no customer, segment, campaign or real draft and never enables customer sending.

Ask whether to use a forwarded design or a brand sample. For a forwarded design, read [Forwarded layout](#forwarded-layout) before preparing. An agent with browser access may operate extraction; otherwise give the owner the single required action. If extraction is unavailable, explicitly offer a brand sample. Never claim a forwarded design was used when it was not.

Prepare with `manage.mjs action` and a stable idempotency key:

```json
{"action":"setup.sample.prepare","input":{"language":"en","source":{"kind":"brand"}}}
```

For supplied CTA content, use the actual authorized workspace site. `content` is optional; omitting it selects fixed neutral English brand content. For another two-letter language, supply copy written natively in that language. Supplied content has exactly `subject`, `greeting`, `body_html`, `cta_text`, `cta_url`. Limits are 200/200/12,000/120/4,096 characters respectively. No merge fields, remote content fetch, model job or audience is involved. Attached source is `{"kind":"attached"}`. Forwarded source is `{"kind":"forwarded","inboundId":"workspace inbound UUID","surgeryHtml":"checked layout","styles":"checked CSS","audit":[],"problems":[]}`; use the actual extraction result and existing template contract's types, not these illustrative placeholders.

Preparation returns `sampleId`, `contentHash` and `expiresAt`. Read `sample --id <sampleId>` and save `sample-preview --id <sampleId> --output-file <new-private.html>`. Both reads require `setup:write` and are scoped to the granting owner and workspace. Status includes `status`, `ownerVerified`, `acceptedAt`, `deliveredAt` and `expired`; no recipient address is returned. Inspect the exact preview. The inactive footer is a preview label, not an unsubscribe operation. Content expires after seven days and cannot then be sent.

Use `setup.sample.verify-owner` with `{sampleId,contentHash}` to request the fixed mailbox challenge. The owner opens the link and confirms; GET alone does not verify. Confirmation never sends the sample automatically. After confirmation, resume `setup.sample.send` with the same frozen IDs/hash if the owner's existing request authorizes this exact test. Do not ask again merely because confirmation finished. Confirmation does not authorize changed content; obtain the owner's choice before sending a different sample. Never accept recipient/from/provider fields or substitute another mailbox. The challenge expires after 15 minutes; resend is at least 60 seconds apart, at most 3/hour and 5/day per account/address. Distinct prepares and sample sends are each limited to 5/day per account/workspace. Retry the same operation rather than consuming a new allowance.

Read sample status after sending. Report accepted, delivered, failed and delivery_unknown accurately. Unknown or accepted attempts must not be blindly resent. Skipping this sample is allowed; skipped or accepted is not delivered, and a sample is never full setup or customer activation proof.

Finish with the [next onboarding task](../SKILL.md#next-onboarding-task), chosen from the owner's goal and current setup facts.

## Forwarded layout

Use an already attached validated layout with `source.kind: "attached"`, or use
the existing forwarded-email reader in Settings → Setup. Select the actual
workspace-owned email with “Use this email”. It extracts in a sandbox and runs
the server's layout validation before showing a preview and removal audit.
Read any refusal; do not bypass it or substitute raw email HTML.

For `source.kind: "forwarded"`, retain that extraction's `inboundId`, `surgeryHtml`,
`styles`, `audit` and `problems`, and check their current types against the
`setup.sample.prepare` schema from capabilities. An inbound ID alone is not
enough. Inspect the prepared sample preview. Choosing “Use this template” changes
the workspace's saved layout; a private sample does not require that change.
If the tool cannot obtain a validated extraction, ask for that one owner step
or offer the brand sample explicitly. Never invent extraction output.
