<!-- barua:start -->
## Barua events

- Barua events go out through `<emitter path>`, with `BARUA_API_KEY` from the environment. Server code only.
- Before any call to Barua with an event-only key, and before a test run after you change an emit site, run the barua-setup verify script `node <skill dir>/scripts/verify.mjs`, and stop if it exits 2: the key isn't a test key, and a live one would send live events. After the test run, run it again with `--since` and the time you noted before it, such as `--since 2026-10-09T10:00:00Z`.
- Send each event after the database commit, from a job queue or the platform's `waitUntil`, else await it before responding only when no durable queue or outbox exists. With an outbox, the request waits only for the fact and event to commit, never for a worker, flush, drain or delivery; the worker awaits HTTP outside database transactions. A `consent_updated` that turns marketing off goes only through the queue or an outbox. Never `void emit(...)`: the platform can end the invocation after the response, and the event is lost with its failure log.
- Retry 429 and 5xx answers and a send that got no answer (a timeout or a network failure), with backoff. The emitter already does.
- `emit` never throws. Check `ok` on its result and log a failure with the event's name and `event_id`, never the key.
- Use the test key everywhere except production. Never send from browser code or a database trigger.
- `event_id` is the event's name and the source row id joined by a colon, such as `created:4812`, one per occurrence for repeatable events. `occurred_at` is the source row's timestamp, never the time you send.
- Send history with `"mode": "backfill"`. Only events the product sends as they happen are live.
- Account deletion reads the user's email before the delete and, in the same transaction, writes an erase job holding that email and the user id. The erase job calls `POST /api/integrations/v1/people/erase` with `external_id`, then with `email`, and retries each until it answers 200 with `"erased": true`. Any other answer, another 2xx included, leaves that call unfinished and the job in place. Never erase from the request alone.
- Before changing events, refresh and check the journey map using the skill's `references/journey-review.md`. Change events with `POST /api/integrations/v1/plan`, sending the full plan every time: an approved event you leave out is removed. Never emit an event the plan lacks.
- With `BARUA_MANAGEMENT_KEY`, read the skill's `references/management.md` and use management actions for plan/brand changes, approval and launch under the owner's grant. Keep test validation separate; fresh delivery needs its own proof. Never print credentials.
<!-- barua:end -->
