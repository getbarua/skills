# Optional setup choices

Read only the section needed for the owner's request. First verify [workspace and access](quickstart.md).

## Pixel and history

Stop when the requested event or sample is done. Discuss these choices when
they help the owner's next task, not as a checklist before the first result.

Ask whether to add the optional pixel alongside server events. `manage.mjs pixel` reads the current hash and recovery availability without returning plaintext. If `recoveryAvailable` is true, use `resume --id <recoveryOperationId> --secret-file <new-private-file>` to recover the same still-current key from this connection's earlier operation. A later browser rotation invalidates that recovery. Legacy keys without a recoverable operation cannot be reconstructed. When issuance is needed, `pixel.key.create` takes `{replaceExisting,expectedKeyHash}` and requires setup permission. Read the current hash first. If a key exists, explain that explicit replacement stops the old installed key within the five-minute ingest cache window. Do not rotate it as a read. Use `--secret-file` or `--secret-command-file`; exact retries can recover only the same still-current key. Issuing a key changes no tracking configuration or sending. Use the returned `pixelUrl` and recovered key in the documented `data-key` snippet in [the optional pixel installation guide](https://barua.ai/docs/install.md#the-pixel-optional), including its consent and masking behavior.

Ask whether existing users, consent records or history need import, and who may access that source. Inspect advertised capabilities before promising a route. Historical imports must preserve source, consent, suppression, stable identity and changed-address reconciliation; they do not replay live lifecycle triggers or prove live deployment. Full agent imports remain a separate implementation dependency (PR207); SQL storage alone is not an available API. Use the existing history route only within its documented grant and scope.

## Broader plan, when selected

Offer [journey-review.md](journey-review.md) for a broader strategy. When selected, keep its offline HTML and JSON current before artifact-bound submissions. For a specific custom event, use [Start with one event](events.md#start-with-one-event). Prepare campaigns or saved segments only when requested. Actual customer sending still follows its own approval and current consent checks.

Verify capabilities before committing to rules: general per-object targeting is disabled; built-in service Play purposes are receipt, order_shipped, order_delivered, order_delayed, order_cancelled and order_refunded. Custom events can carry a complete [service email](events.md#service-email) with a separately approved policy and explicit `service:write` key. A current object-state check must have a real supported consumer read, not a promise in the plan. Barua send history does not automatically include other providers. The legacy identity route is not a general new-management-key address-update API. Record these as dependencies where they affect the proposed journey.
