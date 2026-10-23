# Reading the product's repos

Read every repo the owner names. A monorepo counts once, with several roles. First understand the complete customer journey and its outcomes, then locate the server commit point for each supporting fact. Existing emitters are evidence of implementation, not a boundary on the intended journey.

Source files and the full discovery inventory stay on the machine. Barua gets
the declared events and configuration you submit, including the source-backed
playbook. Management Play approvals also send the artifact digest with compact
review findings and the exact policy and preview references.

## Journey discovery before event selection

Follow [journey-review.md](journey-review.md) before proposing or approving a plan.
Trace routes through server handlers, persisted state, workers and existing
emails. Include alternate creation modes, incomplete actions, failures,
recovery, payment states, fulfilment, returning users and account controls
where the product supports them. Look beyond the successful signup-to-purchase
path and beyond files that already mention Barua.

Make two recorded passes. First inventory the source-owned entities and their
variants. Follow state changes through failure and recovery, then record time
conditions and current senders. Keep that list separate from the messages you
want to propose. Use the `source_inventory` fields in the journey reference.
Before selecting events, complete its [fact-to-decision checks](journey-review.md#trace-facts-through-every-decision)
for shared consumers, preexisting state, action prerequisites and time without callbacks.

Next map every material source row to an assessed opportunity or control
decision. Check the exact plan and playbook you will submit against those
facts. Distinguish observations from proposals; leave unknown promises out of
the submission. A retry endpoint does not establish that retry is free or
available to the customer. Follow its authorization and charge behavior.

Record sending ownership and duplicate prevention when another system keeps
sending a message. Its event may still stop a different Play. Missing emitters
remain implementation work; unresolved product facts remain dependencies.

## Frontend

- Find the journeys: routes, forms and buttons that change server state.
- Trace each action to the request it makes, and that request to the backend handler that answers it. The handler is where you emit.
- In Next.js, files marked `"use server"` and `app/**/route.ts` are server code. Files marked `"use client"` are browser code.
- Client analytics calls (PostHog, Segment, Mixpanel, gtag) hint at which facts matter. They are never emit sites.
- Record an action that makes no request when you find it. Pass local JSON to `node <skill dir>/scripts/handoffs.mjs --record <receipt-file>` through stdin, using the private receipt file from setup:

  ```json
  {"needs_server_call":[{"source":"web/editor/Publish.tsx:onPublish","action":"Only changes local state.","endpoint":"POST /api/posts/:id/publish"}]}
  ```

  Use the actual source and behavior; this is an example, not an event to add.
  The helper keeps the gap through later API responses and includes its
  `needs_server_call` line in the final report. The endpoint is a suggestion
  for the owner, not permission to create it. Never emit from the browser to
  cover the gap. These local notes are not sent to Barua.

## Backend

- Find the commit point: the line after the transaction or ORM write resolves. Look for Prisma `$transaction`, Drizzle or Knex transactions, Django `transaction.on_commit` and Rails `after_commit`.
- Send from code that is still running when the send finishes. A serverless or edge platform can freeze or end the invocation once the response goes out. A send still in flight then dies with its retries and its failure log, so Barua never gets the event and nothing records the loss. Use the first of these the product has:
  1. A durable job queue or an outbox table, including one you add. Write the event in the same transaction as the fact, then return the product response when that transaction commits. The request must not await the worker, a flush or a drain, even after the commit. The independently scheduled worker calls and awaits `emit` outside any database transaction, then records the result in a short transaction. A slow delivery must not hold a database lock needed by product requests. When the result isn't `ok` and its `status` is 429 or 5xx, or its `body.code` is `network_error` (a timeout or a network failure, so no status came back), fail the job so the queue retries it. Keep the saved job until its result is recorded; the worker must recover it after a restart. Barua drops a resend with the same `event_id`.
  2. The platform's `waitUntil`, which keeps the invocation running after the response: `waitUntil` from `@vercel/functions` on Vercel (`after` from `next/server` in Next.js 15.1 and later), `context.waitUntil` in Netlify Functions and Edge Functions, and `ctx.waitUntil` in Cloudflare Workers. Cloudflare stops that work 30 seconds after the response. Vercel and Netlify stop it at the function's own time limit.
  3. Only when neither a durable queue/outbox nor `waitUntil` is available, `await` the send before you respond. The response waits for Barua. Adding an outbox selects the first way; do not combine it with this fallback.
- Never start a send that nothing waits for, such as `void emit(...)`, or an `emit` call nobody awaits and no `waitUntil` holds.
- Fit `attempts` to the time the send gets. It takes a whole number from 1 to 5, and `createBaruaEmitter` throws on any other value, so a bad setting fails at startup. Each attempt waits at most 10 seconds for Barua, and each pause before a retry lasts at most 30 seconds, so the default 5 attempts can take up to 170 seconds. `createBaruaEmitter({ ..., attempts: 1 })` takes at most 10 seconds and never retries. Use it under Cloudflare's `waitUntil` and for the no-queue request fallback. A queue worker can also use one attempt and let its saved job handle retries; that does not make the product request wait for the worker. A send that fails without a saved job is lost unless something sends it again, which is why a queue comes first.
- `emit` never throws, so read its result wherever it runs and log a failure with the event's name and `event_id`:

  ```ts
  const result = await emit(event);
  if (!result.ok) console.error('Barua event not sent', event.name, event.event_id, result.status, result.body);
  ```

  Under `waitUntil`, hand it the send with the same check:

  ```ts
  waitUntil(emit(event).then((result) => {
    if (!result.ok) console.error('Barua event not sent', event.name, event.event_id, result.status, result.body);
  }));
  ```
- `signed_up` comes from the line that commits the user row. Its `event_id` is `signed_up:<user id>`, and its `external_id` is that same id. Send the user's email as `properties.email`.
- `marketing_opt_in` on `signed_up` comes from the signup form's consent checkbox. A later preference change is a `consent_updated` event. Send one that turns marketing off only from a job queue or an outbox, the first way in the list above, because a lost opt-out leaves Barua treating someone who said no as opted in.
- `activated` is the first moment the user gets the product's core value, such as a first published project. It's your choice: name it in the report so the owner can change it.
- `created` is one event per row of the main thing the product exists for. The `Use` column of the property table in `references/events.md` says which of its properties may appear in an email.
- Payments: `purchased` and `churned` usually come from the payment provider's webhooks. See [Payments](#payments). The trial and subscription events and `order_refunded` come from there too, and the order status events from the shipping system.
- Account deletion: read the user's email before the delete, and in the same transaction write an erase job that keeps the user's id and that email, as a row in an outbox table or in a job queue that commits with that transaction. That's the first way in the list above, and the only one an erase may use. The job calls `POST /api/integrations/v1/people/erase` twice, with the user's id as `external_id` and then with that `email`, because the address Barua holds for the id can be an old one when the email changed, and it retries each call until it answers 200 with `"erased": true`. It needs the live key, so it runs only in production. `references/events.md` has the bodies and what the job does with each answer. It also covers a delete your database doesn't run, and a product with no job queue.
- A product fact the core events don't cover (a team invite, a report export) becomes a custom event in the plan, with each property marked `copy` or `targeting`. Check the core list in `references/events.md` first: a trial, a subscription, a shipment and a sign-in are core events now.

## Payments

`purchased` means the money arrived. Send it when the payment provider confirms the payment, and never while a payment is still processing. Each payment sends one `purchased`, from one handler.

- Stripe Checkout, one-time payments (`mode` is `payment`): on `checkout.session.completed`, send `purchased` only when the session's `payment_status` is `paid`. A delayed method, such as a bank debit, completes the session with `payment_status` `unpaid` and settles later. Its `purchased` waits for `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed` sends nothing. Use the session id as `order_id` in both handlers.
- Stripe invoices: `invoice.paid` sends `purchased` for each paid invoice, with the invoice id as `order_id`. It fires for every subscription payment, the first one included, and for one-off invoices. Skip an invoice whose `amount_paid` is 0, such as the one a trial starts with. In `subscription` mode, leave the Checkout session out, because its payment is that first invoice. In `payment` mode with post-purchase invoices on, the session also makes an invoice for the same payment (the session's `invoice`). Skip that invoice here, because the session already sent the purchase.
- Use `payment_intent.succeeded` only when the product charges through PaymentIntents directly. Checkout sessions and invoices create their own PaymentIntents, so a product that uses either would count each of those payments twice.
- Stripe amounts (`amount_total` on a session, `amount_paid` on an invoice) are integers in Stripe's charge unit, which isn't always the currency's ISO 4217 minor unit. Stripe still writes ISK and UGX with two trailing zeros, so 500 means 5 ISK. Barua's `amount` is in major units and its `currency` is the ISO 4217 code in capitals. Read the amount together with the object's `currency` and convert with this table. It holds Stripe's lists as of 2026-10-09 (https://docs.stripe.com/currencies):

  ```ts
  const STRIPE_ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
  const STRIPE_THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);
  // Every other code, ISK, UGX, HUF and TWD included, has two decimals in Stripe's amounts.
  function stripeAmount(amount: number, currency: string): { amount: number; currency: string } {
    const code = currency.toLowerCase();
    const divisor = STRIPE_ZERO_DECIMAL.has(code) ? 1 : STRIPE_THREE_DECIMAL.has(code) ? 1000 : 100;
    return { amount: amount / divisor, currency: code.toUpperCase() };
  }
  ```

  A webhook Stripe delivers twice builds the same `event_id`, so Barua keeps one.
- `customer.subscription.deleted` gives `churned`. `references/events.md` maps Stripe's other subscription and refund webhooks.
- A refund never sends `purchased`, and neither does a failed or disputed payment. A refund sends `order_refunded`.
- Every other provider, PayPal and Shopify included, follows the same rule. Send `purchased` on the signal that says the money arrived, such as a captured or paid payment, and never for an order that is only authorized or still pending. An app store purchase counts once the store confirms it. An invoice your product marks paid by hand counts once it's marked.
- For any other provider, read its docs for the unit of the amount it sends before you convert. Barua wants major units, such as 19.99.

## Database and migrations

- Read the DDL for each property's type and length, and for the row timestamp that becomes `occurred_at`.
- For history, write read-only `SELECT`s to `barua/backfill/<event>.sql` that return rows in the event's shape. Never run them against production. Whoever sends their rows sends them with `"mode": "backfill"`, `signed_up` first, so the live deploy check waits for the product's own live events.
