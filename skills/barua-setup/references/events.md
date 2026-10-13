# Barua events: the contract for your backend

Your backend tells Barua what happened in your product, one event per fact, sent from server code after the database commit. This page is that contract. `GET /api/integrations/v1/plan` returns the same contract as JSON, with a JSON Schema for one event, and `GET /api/integrations/v1/events/status` tells you what arrived.

Every path below is under `https://barua.ai/api/integrations/v1` and takes `Authorization: Bearer ik_...`, an integration key your workspace owner gives you. Requests and answers are JSON.

For each call below, only the answer in this table means it went through. Treat any other answer as a failure, another 2xx included: an unlisted 200 or 204 came from something between you and Barua, such as a proxy, or from a wrong `BARUA_API_URL`.

| Call | Success |
| --- | --- |
| `POST /events` | 202 with `receipt_id` and `records` |
| `POST /people/erase` | 200 with `"erased": true` |
| `POST /plan` | 201 for a new proposal, 200 for a plan Barua already has, each with `version` and a `"status"` of `"proposed"` or `"approved"` |
| `PUT /brand` | 200 with `"status": "proposed"` |
| Every `GET` | 200 |

## Keys

Keys are `test` or `live`. A test key runs the same checks on each event as the live key and reports the verdict: `validated` when it passes, or `quarantined` with its reasons. It stops there and changes nothing about your users in Barua. Its checks never read the people and events the live key sent, so an event the test key validated can still get `duplicate` or `unknown_identity` from the live key. Use the test key in development and CI. The live key lives only in production's hosting secrets, and only a person puts it there.

Live events are switched on per workspace during early access. Until they're on for yours, a live key gets 403 `feed_not_enabled`. Email chris@barua.ai to switch them on. A test key works either way. Erasing a person needs the live key; a test key gets 403 `test_key_not_allowed`.

## Emitter rules

- Send after the database commit, from a job queue or the platform's `waitUntil`, else await the send before you respond. On a serverless or edge platform, a send still running after the response can die with the invocation, and its failure log dies with it. A `consent_updated` that turns marketing off goes only through a job queue or an outbox table, because a lost one leaves Barua treating someone who said no as opted in.
- Retry 429 and 5xx answers, and a send that got no answer at all: a network failure, or no answer within 10 seconds. Barua drops duplicates by `event_id`, so a resend is safe even when the first send arrived. Send the same body each time, up to 5 attempts in all, or fewer to fit the time the send gets. Wait 0.5 seconds before the second attempt and double the wait before each one after it, with random jitter of up to half the wait either way. When an answer carries `Retry-After` as a whole number of seconds, wait that long instead. Never wait more than 30 seconds between attempts, even when `Retry-After` asks for longer.
- Never retry any other answer. A 4xx other than 429 fails the same way every time, so log it and act on its `fix`.
- A send went through only when Barua answers 202 with `receipt_id` and `records`. Treat any other answer as a failed send and log its status. That includes another 2xx.
- Use the test key everywhere except production.
- Never send from the browser.
- Log a send that still fails after its retries, with the event's name and `event_id` and never the key. Barua can't see an event that never arrived, so your log is its only trace.

The skill's `references/emit.ts` sends and retries this way for Node, Deno, Bun and Workers. It never throws: it resolves `{ok, status, body}`, so your code checks `ok` and logs a failure. Its `apiUrl` must be https, or plain http to localhost. For another stack, send the HTTP call under [Send events](#send-events).

## The event

<!-- docs-check:envelope -->
| Field | Rule |
| --- | --- |
| `event_id` | Required. `name:id`, for example `created:4812`, where the id is the source row's id. 1 to 512 characters after the colon, with no control characters, so any id up to 256 characters fits with room for an occurrence counter. When `GET /plan` gives the event an `id_from`, the id is the value it names (`purchased` uses `properties.order_id`). An `id_from` that names two values joins them with a colon: `checkout_started:<checkout_id>:<start_id>`. Only the first value may contain a colon, so each pair makes its own id. Three events build a part from a value. `trial_ending` ends with `trial_ends_at` in Unix milliseconds. `signed_in` ends with the UTC date of `occurred_at`, as YYYY-MM-DD. `order_delayed` ends with its `eta_date`, or the word `unknown` when it has none. Either way, two rows never share an `event_id`. A repeatable event gets one id per occurrence. |
| `name` | Required. One of the core events below, or a custom event in your approved tracking plan. |
| `external_id` | Required. Your user id for this person, 1 to 256 characters, counted the way the identities feed counts them: an emoji counts as 2. |
| `occurred_at` | Required. The source row's timestamp, in ISO 8601 with a timezone. It must be after 2000 and at most 5 minutes after Barua receives the event, so send the time the row records. |
| `properties` | Optional. An object with the event's properties below, at most 8 KiB as JSON. A `null` optional property counts as absent. |
<!-- /docs-check:envelope -->

Every workspace sends `signed_up`. `activated`, `created`, `purchased` and `churned` are declarable: when your product has no such moment, your tracking plan marks the event `not_emitted` with a reason. The rest are optional, from `consent_updated` on, so the plan can't declare them. Your plan can't list an optional event either, so Barua suggests plays that start from one only after it has accepted one sent with your live key. Events sent with a test key don't count.

<!-- docs-check:core-events -->
| Event | Send it | What it means |
| --- | --- | --- |
| `signed_up` | required | Someone created an account. Send it once, after the user row commits. `event_id` is `signed_up:<user id>`. |
| `activated` | declarable | Someone reached the first real result in your product. You choose the moment. `event_id` is `activated:<row id>`, one per occurrence. |
| `created` | declarable | Someone made the main thing your product exists for, such as a project. One event per created row. `event_id` is `created:<row id>`. |
| `purchased` | declarable | A payment succeeded. `amount` is the total charged, after discounts, including shipping and tax. `event_id` is `purchased:<order id>`. |
| `churned` | declarable | Someone's subscription or relationship with your product ended. `event_id` is `churned:<row id>`, one per occurrence. |
| `consent_updated` | optional | Someone changed their marketing consent. `event_id` is `consent_updated:<row id>`, one per change. |
| `checkout_started` | optional | Someone started a checkout your server created, such as a Stripe Checkout Session. `event_id` is `checkout_started:<checkout id>:<start id>`, one per start. |
| `order_shipped` | optional | A shipment of an order left for delivery. An order sent in two parcels sends two. `event_id` is `order_shipped:<shipment id>`. |
| `order_delivered` | optional | A shipment was delivered. `occurred_at` is the delivery time. `event_id` is `order_delivered:<shipment id>`. |
| `order_delayed` | optional | A shipment's delivery moved later. `event_id` is `order_delayed:<shipment id>:<eta_date>`, or `order_delayed:<shipment id>:unknown` when there is no new date. |
| `order_cancelled` | optional | An order was cancelled. Money paid back is an `order_refunded`. `event_id` is `order_cancelled:<order id>`. |
| `order_refunded` | optional | Money from an order went back to the buyer. One event per refund. `event_id` is `order_refunded:<refund id>`. |
| `trial_started` | optional | Someone started a trial. `event_id` is `trial_started:<trial id>`. |
| `trial_ending` | optional | Someone's trial ends soon. Send it when the reminder is due. `event_id` is `trial_ending:<trial id>:<trial_ends_at in Unix milliseconds>`. |
| `trial_ended` | optional | Someone's trial ended, including one that turned into a paid plan. `event_id` is `trial_ended:<trial id>`. |
| `subscription_started` | optional | Someone started a subscription. `event_id` is `subscription_started:<subscription id>`. |
| `subscription_cancelled` | optional | Someone asked to cancel a subscription that is still running. `event_id` is `subscription_cancelled:<subscription id>`. |
| `signed_in` | optional | Someone signed in. Send only their first sign-in of each UTC day. `event_id` is `signed_in:<user id>:<YYYY-MM-DD>`, the UTC date of `occurred_at`. |
<!-- /docs-check:core-events -->

`use` says where a value may go. A `copy` value may appear in an email Barua writes, such as a project title. A `targeting` value only decides who gets an email and when.

<!-- docs-check:core-properties -->
| Property | Type | Required | Use | Min | Max |
| --- | --- | --- | --- | --- | --- |
| `signed_up.email` | email | yes | targeting | | 320 |
| `signed_up.first_name` | string | no | copy | | 100 |
| `signed_up.marketing_opt_in` | boolean | no | targeting | | |
| `signed_up.type` | string | no | targeting | | 32 |
| `signed_up.timezone` | timezone | no | targeting | | 64 |
| `signed_up.locale` | locale | no | targeting | | 35 |
| `created.id` | string | yes | targeting | | 256 |
| `created.title` | string | yes | copy | | 500 |
| `created.kind` | string | no | copy | | 64 |
| `created.url` | url | no | copy | | 2048 |
| `purchased.order_id` | string | yes | targeting | | 256 |
| `purchased.amount` | number | yes | targeting | 0 | |
| `purchased.currency` | currency | yes | targeting | | |
| `purchased.line_items` | array | no | targeting | | 15 |
| `purchased.line_items[].product_id` | string | no | targeting | | 256 |
| `purchased.line_items[].name` | string | yes | copy | | 200 |
| `purchased.line_items[].quantity` | integer | yes | targeting | 1 | |
| `purchased.line_items[].price` | number | yes | targeting | 0 | |
| `purchased.line_items[].url` | url | no | copy | | 2048 |
| `purchased.line_items[].image_url` | url | no | copy | | 2048 |
| `purchased.subtotal` | number | no | targeting | 0 | |
| `purchased.discount` | number | no | targeting | 0 | |
| `purchased.shipping` | number | no | targeting | 0 | |
| `purchased.tax` | number | no | targeting | 0 | |
| `purchased.coupon` | string | no | targeting | | 64 |
| `purchased.checkout_id` | string | no | targeting | | 256 |
| `purchased.receipt_url` | url | no | copy | | 2048 |
| `purchased.order_name` | string | no | copy | | 100 |
| `churned.reason` | string | no | targeting | | 200 |
| `consent_updated.marketing_opt_in` | boolean | yes | targeting | | |
| `consent_updated.method` | string | no | targeting | | 64 |
| `checkout_started.checkout_id` | string | yes | targeting | | 256 |
| `checkout_started.start_id` | string | yes | targeting | | 255 |
| `checkout_started.amount` | number | yes | targeting | 0 | |
| `checkout_started.currency` | currency | yes | targeting | | |
| `checkout_started.checkout_url` | url | no | copy | | 2048 |
| `checkout_started.line_items` | array | no | targeting | | 15 |
| `checkout_started.line_items[].product_id` | string | no | targeting | | 256 |
| `checkout_started.line_items[].name` | string | yes | copy | | 200 |
| `checkout_started.line_items[].quantity` | integer | yes | targeting | 1 | |
| `checkout_started.line_items[].price` | number | yes | targeting | 0 | |
| `checkout_started.line_items[].url` | url | no | copy | | 2048 |
| `checkout_started.line_items[].image_url` | url | no | copy | | 2048 |
| `order_shipped.order_id` | string | yes | targeting | | 256 |
| `order_shipped.shipment_id` | string | yes | targeting | | 256 |
| `order_shipped.order_name` | string | no | copy | | 100 |
| `order_shipped.carrier` | string | no | targeting | | 60 |
| `order_shipped.tracking_number` | string | no | targeting | | 100 |
| `order_shipped.tracking_url` | url | no | targeting | | 2048 |
| `order_shipped.eta_date` | date | no | targeting | | |
| `order_shipped.line_items` | array | no | targeting | | 15 |
| `order_shipped.line_items[].product_id` | string | no | targeting | | 256 |
| `order_shipped.line_items[].name` | string | yes | copy | | 200 |
| `order_shipped.line_items[].quantity` | integer | yes | targeting | 1 | |
| `order_shipped.line_items[].price` | number | yes | targeting | 0 | |
| `order_shipped.line_items[].url` | url | no | copy | | 2048 |
| `order_shipped.line_items[].image_url` | url | no | copy | | 2048 |
| `order_delivered.order_id` | string | yes | targeting | | 256 |
| `order_delivered.shipment_id` | string | yes | targeting | | 256 |
| `order_delivered.order_name` | string | no | copy | | 100 |
| `order_delivered.carrier` | string | no | targeting | | 60 |
| `order_delivered.tracking_number` | string | no | targeting | | 100 |
| `order_delivered.tracking_url` | url | no | targeting | | 2048 |
| `order_delivered.line_items` | array | no | targeting | | 15 |
| `order_delivered.line_items[].product_id` | string | no | targeting | | 256 |
| `order_delivered.line_items[].name` | string | yes | copy | | 200 |
| `order_delivered.line_items[].quantity` | integer | yes | targeting | 1 | |
| `order_delivered.line_items[].price` | number | yes | targeting | 0 | |
| `order_delivered.line_items[].url` | url | no | copy | | 2048 |
| `order_delivered.line_items[].image_url` | url | no | copy | | 2048 |
| `order_delayed.order_id` | string | yes | targeting | | 256 |
| `order_delayed.shipment_id` | string | yes | targeting | | 256 |
| `order_delayed.order_name` | string | no | copy | | 100 |
| `order_delayed.carrier` | string | no | targeting | | 60 |
| `order_delayed.tracking_number` | string | no | targeting | | 100 |
| `order_delayed.tracking_url` | url | no | targeting | | 2048 |
| `order_delayed.eta_date` | date | no | targeting | | |
| `order_delayed.line_items` | array | no | targeting | | 15 |
| `order_delayed.line_items[].product_id` | string | no | targeting | | 256 |
| `order_delayed.line_items[].name` | string | yes | copy | | 200 |
| `order_delayed.line_items[].quantity` | integer | yes | targeting | 1 | |
| `order_delayed.line_items[].price` | number | yes | targeting | 0 | |
| `order_delayed.line_items[].url` | url | no | copy | | 2048 |
| `order_delayed.line_items[].image_url` | url | no | copy | | 2048 |
| `order_cancelled.order_id` | string | yes | targeting | | 256 |
| `order_cancelled.order_name` | string | no | copy | | 100 |
| `order_cancelled.reason` | string | no | targeting | | 200 |
| `order_cancelled.amount` | number | no | targeting | 0 | |
| `order_cancelled.currency` | currency | no | targeting | | |
| `order_refunded.order_id` | string | yes | targeting | | 256 |
| `order_refunded.refund_id` | string | yes | targeting | | 256 |
| `order_refunded.amount` | number | yes | targeting | > 0 | |
| `order_refunded.currency` | currency | yes | targeting | | |
| `order_refunded.full` | boolean | yes | targeting | | |
| `order_refunded.reason` | string | no | targeting | | 200 |
| `order_refunded.line_items` | array | no | targeting | | 15 |
| `order_refunded.line_items[].product_id` | string | no | targeting | | 256 |
| `order_refunded.line_items[].name` | string | yes | copy | | 200 |
| `order_refunded.line_items[].quantity` | integer | yes | targeting | 1 | |
| `order_refunded.line_items[].price` | number | yes | targeting | 0 | |
| `order_refunded.line_items[].url` | url | no | copy | | 2048 |
| `order_refunded.line_items[].image_url` | url | no | copy | | 2048 |
| `trial_started.trial_id` | string | yes | targeting | | 256 |
| `trial_started.trial_ends_at` | timestamp | yes | targeting | | |
| `trial_started.plan` | string | no | copy | | 64 |
| `trial_ending.trial_id` | string | yes | targeting | | 256 |
| `trial_ending.trial_ends_at` | timestamp | yes | targeting | | |
| `trial_ending.plan` | string | no | copy | | 64 |
| `trial_ended.trial_id` | string | yes | targeting | | 256 |
| `trial_ended.plan` | string | no | copy | | 64 |
| `subscription_started.subscription_id` | string | yes | targeting | | 256 |
| `subscription_started.plan` | string | no | copy | | 64 |
| `subscription_cancelled.subscription_id` | string | yes | targeting | | 256 |
| `subscription_cancelled.plan` | string | no | copy | | 64 |
| `subscription_cancelled.reason` | string | no | targeting | | 200 |
| `subscription_cancelled.ends_at` | timestamp | no | targeting | | |
<!-- /docs-check:core-properties -->

Min is the smallest value a number or integer may take, and `> 0` means it must be above 0. A line's `quantity` is a whole number of at least 1. No amount is below 0. An amount can be 0, such as an order a discount pays in full, except a refund's `amount`, which is above 0 because a refund of 0 moved no money. Max is a length in characters, or for an array the most entries it holds. An array is a list of objects, one per line of the order, checkout, shipment or refund. A `date` is one calendar day written `YYYY-MM-DD`, such as `2026-10-12`. It has no time, and it must be a real day. A `timezone` is a time zone name the IANA database knows, such as `Europe/Oslo` or `UTC`. Barua refuses an offset such as `+01:00`. A `locale` is a BCP 47 language tag, such as `en-US` or `zh-Hant-TW`. Its own `use` is `targeting`, because Barua never puts a whole list in an email; each entry field has its own `use`. Required on an entry field means every entry has it.

`checkout_started.start_id` can't contain a colon. It is the second part of the `event_id`, after `checkout_id`, which may contain colons, so each pair makes its own id. When `start_id` is the start's time, send it in Unix milliseconds, because an ISO time has colons.

Strings are trimmed and can't be empty or hold control characters. Emails are lowercased. A negative amount is quarantined as `invalid_property`, and a refund is not a purchase.

`purchased.amount` is the total charged. Discounts are already taken off it, and shipping and tax are in it. `subtotal`, `discount`, `shipping` and `tax` are optional parts of it. Every amount, a line's `price` included, is in major units (19.99 for $19.99) and can't be negative, and `currency` is an ISO 4217 code in capitals, such as `USD`. A line's `price` is the unit price. Stripe's `unit_amount` counts in Stripe's charge unit (1099 for $10.99), so convert it first. Never send it as it comes. `checkout_started.amount` is the checkout's total, counted the same way. It always comes with its `currency`.

`line_items` holds at most 15 lines. An order with more lines sends the first ones up to that cap, and `amount` still covers the whole order. A full list, each line with a product link and an image link, plus every other `purchased` property, comes to about 6 KiB of the 8 KiB `properties` cap. Over the cap Barua quarantines the whole event, so send what a receipt needs and nothing more. A reason about one line names it, such as `properties.line_items[2].price`.

`amount` and `currency` come together. An event that has both takes both or neither. An `order_cancelled` sent before any money moved leaves both out. One half alone is quarantined as `missing_property` for the other.

Send one order event per status, from the server code that records it. `order_id` is the `order_id` of the order's `purchased`. A shipment is one parcel, so an order sent in two parcels sends two `order_shipped`, each with its own `shipment_id`. `order_delivered` and `order_delayed` repeat the shipment's facts, so each one says which parcel it is about. Send the carrier, tracking number, tracking link and delivery date as your shipping system has them. Barua's shipment emails show them as you send them, and the tracking link becomes the email's button, so send the link the customer follows. A delay with a new date gets its own `event_id`, so each new date is a new event. A shipment gets one delay without a date.

`order_refunded.amount` is what this refund paid back, in major units. A refund is its own event, so its amount is above 0. Barua quarantines a refund of 0 as `invalid_property`. A refund that moved no money, such as one that only puts items back in stock, sends nothing. Send `full: true` when nothing paid is left on the order, including when this refund is the last of several. Send `false` for a partial refund. Barua stores each refund. A full refund also ends the order's paid support, the way a purchases-feed refund does: the order stops counting as paid and stays in the buyer's history. A partial refund changes nothing else. Neither does a full refund whose `occurred_at` isn't later than the order's last update, such as one stamped the same second as its `purchased`. A full refund for an order Barua hasn't seen records that order as refunded. It counts in the buyer's history and doesn't count as paid. Once the owner approves the refund email, each refund also gets one email, which says the amount and whether the order was refunded in full, read from `full`.

A model words Barua's receipt and order update emails once per workspace and language, from the brand pack and playbook, and never sees an order; Barua's code fills in every order detail from the event's own properties: `order_name` (else `order_id`), `amount` with `currency`, each line's `name` and `quantity` with its unit `price`, `receipt_url`, `tracking_url`, `carrier`, `tracking_number`, `eta_date`, `full` and `reason`. A shipment's lines show no price, because a shipment event carries no currency. The email's only link is its button: the `receipt_url` or `tracking_url` the event carried, else the website from the brand pack. Barua refuses any other link, so a receipt hosted by a payment provider works when it arrives as `receipt_url`. None of these emails sends until the workspace owner approves it on the Plays map. After that it goes out without the `marketing_opt_in` check, usually within a few hours of the event. One that can't go out within a day of the event's `occurred_at` is dropped, so send these events as they happen.

Send `trial_ending` when the reminder is due, such as three days before the trial ends. A play only acts at or after a time it reads, so it can't send that reminder from `trial_ends_at` alone. Its `event_id` holds `trial_ends_at` in Unix milliseconds, so when a trial is extended, the reminder for the new end is a new event.

`subscription_cancelled` is the request to cancel, sent while the subscription still runs, so a play can try to keep the customer. `churned` is the end. A subscription gets one `subscription_cancelled`: a second request after the customer undid the first comes back `event_id_conflict`. `subscription_started` has no amount, because each paid invoice is a `purchased`.

Send `signed_in` for someone's first sign-in of each UTC day only. Barua keeps each event as a row until the person is erased, and a play that asks when someone was last seen needs only the latest day. A later sign-in that day has the same `event_id`, so it comes back `event_id_conflict` and adds no row.

`signed_up.type` says how someone joined, such as `organic` or `invited`. `timezone` is an IANA time zone such as `Europe/Oslo`, and `locale` is a BCP 47 language tag such as `en-US`. Barua checks both. A value it can't read, such as `Oslo` or `en_US`, quarantines the whole `signed_up` as `invalid_property`, so leave one out unless it comes from a source that writes these formats, such as the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` and `navigator.language`. Rules can read them now. Barua's send windows and the language it writes in don't read `timezone` or `locale` yet. A receipt or an order update writes its amounts and dates the way the person's `locale` does.

`consent_updated.method` records how the choice was made, such as `signup_form` or `settings`. It is a record for you, and no play reads it.

## Events the product already sends elsewhere

When the product already sends one of these to another tool, send Barua the event on the right from the same place. Every rule on this page still applies to it. `references/reading-repos.md` has the full Stripe payment rules and `stripeAmount`, which converts Stripe amounts.

Stripe gives every time in Unix seconds, such as a subscription's `trial_end` and a refund's `created`. Barua wants ISO 8601 text with a time zone, so convert each one with `new Date(seconds * 1000).toISOString()` before it goes into a timestamp property or `occurred_at`. Barua quarantines a number sent as it comes. Check for null first, because `new Date(null * 1000)` is a time in 1970 and no error. Stripe gives every amount in its charge unit, so convert each one through `stripeAmount`.

| Already sent | Send Barua |
| --- | --- |
| Segment `Order Completed` | `purchased`. Its `order_id` is the `order_id`, and its `total` and `currency` are the `amount` and `currency`. |
| GA4 `purchase` | `purchased`. Its `transaction_id` is the `order_id`, and its `currency` is the `currency`. Take `amount` from the order's own total, because `value` leaves out shipping and tax. |
| Klaviyo `Placed Order` | `purchased`. Its `OrderId` is the `order_id`, and its `value` and `value_currency` are the `amount` and `currency`. |
| Stripe `invoice.paid`, when `amount_paid` is above 0 | `purchased`. The invoice's `id` is the `order_id`, and its `amount_paid` and `currency` give `amount` and `currency` through `stripeAmount`. |
| Stripe `checkout.session.completed`, when `mode` is `payment` and `payment_status` is `paid` | `purchased`. The session's `id` is the `order_id`, and its `amount_total` and `currency` give `amount` and `currency` through `stripeAmount`. Send nothing when either is null. |
| The server code that creates a Stripe Checkout Session, when its `amount_total` and `currency` aren't null | `checkout_started`. The paragraph below sets `checkout_id`, `start_id`, `amount` and `currency`. |
| Stripe `customer.subscription.created`, when `status` is `active` or `trialing` | `subscription_started`. The subscription's `id` is the `subscription_id`. A subscription that starts `incomplete` sends it later, from the `customer.subscription.updated` whose `previous_attributes.status` is `incomplete` and whose `status` is now `active`. |
| Stripe `customer.subscription.created`, when `status` is `trialing` | `trial_started`, beside the `subscription_started`. The subscription's `id` is the `trial_id`, and `trial_ends_at` is `new Date(trial_end * 1000).toISOString()`. Send nothing when `trial_end` is null. |
| Stripe `customer.subscription.trial_will_end`, when `status` is `trialing` and `trial_end` is still ahead | `trial_ending`. The subscription's `id` is the `trial_id`, `trial_ends_at` is `new Date(trial_end * 1000).toISOString()`, and the `event_id` ends with `trial_end` times 1000, its Unix milliseconds. Stripe also sends this event at once when a trial is ended early, and then it isn't a reminder, which is why the condition checks both. Send nothing when `trial_end` is null. |
| Stripe `customer.subscription.updated`, when a cancel is now pending | `subscription_cancelled`. The subscription's `id` is the `subscription_id`. The paragraph below says when a cancel is pending. |
| Stripe `customer.subscription.deleted` | `churned`. The subscription has ended, so it is never a `subscription_cancelled`. |
| Stripe `customer.subscription.updated`, when `previous_attributes` names `status` as `trialing` and `status` is no longer `trialing` | `trial_ended`. The subscription's `id` is the `trial_id`, and `occurred_at` is `new Date(trial_end * 1000).toISOString()`. Send nothing when `trial_end` is null. |
| Stripe `customer.subscription.deleted`, when `trial_end` isn't null | `trial_ended`, beside the `churned`. The subscription's `id` is the `trial_id`. `occurred_at` is `new Date(trial_end * 1000).toISOString()`, or `ended_at` when that is earlier, converted the same way, because a trial cancelled before its end ended then. |
| Stripe `refund.created` when the refund's `status` is `succeeded`, or the `refund.updated` that moves a pending refund to `succeeded` | `order_refunded`. The refund's `id` is the `refund_id`, and its `amount` and `currency` give `amount` and `currency` through `stripeAmount`. `full` is the `refunded` of the charge it refunds. `order_id` is the id your `purchased` used for that payment. Send nothing when the refund's `charge` is null. |
| Shopify's `fulfillments/create` webhook | `order_shipped`. The fulfillment's `id` is the `shipment_id`, and `order_id` is the id your `purchased` used for that order. `carrier` is its `tracking_company`, while `tracking_number` and `tracking_url` keep their names. Leave out each one that is null. |
| Shopify's `fulfillment_events/create` webhook, when `status` is `delivered` | `order_delivered`. The event's `fulfillment_id` is the `shipment_id`, `order_id` is the id your `purchased` used for that order, and `occurred_at` is its `happened_at`. |
| Shopify's `fulfillment_events/create` webhook, when `status` is `delayed` | `order_delayed`. `shipment_id` and `order_id` come as for `order_delivered`. `eta_date` is the date part of `estimated_delivery_at`, left out when it is null. |
| Shopify's `orders/cancelled` webhook | `order_cancelled`. `order_id` is the id your `purchased` used for that order, and `order_name` is its `name`. `occurred_at` is its `cancelled_at`. `amount` is its `total_price` as a number, with its `currency`. `reason` is its `cancel_reason`, left out when it is null. |

Shopify's rows follow its webhook payloads (https://shopify.dev/docs/api/webhooks/latest). Shopify gives times as ISO 8601 text already, and amounts in major units as text, such as `"404.95"`, so only turn an amount into a number.

An analytics call can arrive without a value Barua requires, because those specs leave most of their values optional. Take a missing value from the order the call describes. When the order has no total or no currency, send no `purchased`, since Barua quarantines one without them.

Stripe sends no webhook when a Checkout Session is created, so send `checkout_started` right after `stripe.checkout.sessions.create` returns. Stripe leaves a session's `amount_total` and `currency` null when it has no total, such as a session in `setup` mode that only saves a card. Send `checkout_started` only when both have a value. A session without them isn't a checkout with a known total, so skip it and send nothing in its place. `checkout_id` is the session's `id` and `checkout_url` its `url`, left out when Stripe gives none. `amount` and `currency` come from the session's `amount_total` and `currency` through `stripeAmount`. When the product makes a new session for every attempt to pay, `start_id` is the session's `id` as well. When it keeps one session while the cart changes, `start_id` is the start's `occurred_at` in Unix milliseconds, recorded once when the start happens: each start then gets its own `event_id`, and a resend of one start repeats it. Send the same `checkout_id` on the `purchased` that completes the session.

Lines come from `stripe.checkout.sessions.listLineItems(session.id, { limit: 15 })`. For each line, `name` is its `description` and `quantity` its `quantity`. `product_id` is its `price.product`, left out when the line's `price` is null. `price` is its `amount_subtotal` divided by its `quantity`, converted with `stripeAmount`. Never send `price.unit_amount` as it comes. Stripe can leave a line's `description` or `quantity` null, and every line needs both, so leave that line out. `amount` still covers the whole order. On the `purchased` from a completed session, `subtotal` is the session's `amount_subtotal`, and `discount`, `shipping` and `tax` come from `total_details.amount_discount`, `amount_shipping` and `amount_tax`, each converted the same way. Leave `subtotal` out when `amount_subtotal` is null, and the other parts out when `total_details` is null, because `stripeAmount` turns a null into 0.

A cancel is pending when `previous_attributes` names `cancel_at_period_end` and it is now `true`, or names `cancel_at` and the subscription's `cancel_at` now holds a date. Skip every other update, such as one that sets them back, which is how a customer undoes a cancel. The rule holds whether or not the subscription has a `schedule`: a schedule that ends with a cancel sets `cancel_at` itself once its last phase starts, and that update is the request. Stripe can also set `cancel_at_period_end` itself after a disputed payment, if the account asks it to, and this rule sends that as a request too. `ends_at` is `new Date(cancel_at * 1000).toISOString()`, left out when `cancel_at` is null. `reason` is `cancellation_details.feedback`, left out when that is null. A subscription Stripe cancels at once sends only `customer.subscription.deleted`, which is a `churned` alone. Stripe spells it `canceled` and Barua spells it `cancelled`.

A Stripe trial ends in one of two ways (https://docs.stripe.com/billing/subscriptions/trials). It leaves `trialing` in a `customer.subscription.updated` when it turns into a paid plan, or when Stripe pauses it or leaves it `past_due` because no payment method is on file. A trial that is cancelled, or that ends without a payment method on a subscription set to cancel, sends only `customer.subscription.deleted`. The two `trial_ended` rows cover both, so every trial sends one. A trial that turned into a paid plan and is cancelled later sends its `trial_ended` again from the delete with the same `occurred_at`. Barua keeps that one as a `duplicate`. Leave `plan` out of both, because a plan changed after the trial would turn that repeat into `event_id_conflict`.

Stripe's `charge.refunded` fires for partial refunds too, and its charge doesn't list its refunds unless you expand them, so map each refund once, from the refund events in the table. Read the charge with `stripe.charges.retrieve(refund.charge)`. Its `refunded` is true only once the whole charge is refunded, so a refund that leaves part of the payment sends `full: false`. `occurred_at` is the refund's `created`, converted from Unix seconds, so a resend repeats the same event. Segment's `Order Refunded`, GA4's `refund` and Klaviyo's `Refunded Order` carry no refund id, so take `refund_id` and `full` from your own refund record.

Stripe's `invoice.payment_failed` has no core event. When the product emails people about a failed payment, propose a custom `payment_failed` event with an `invoice_id` and an `update_payment_url` the email links to. Give it the `amount` and `currency` due as well, from the invoice's `amount_due` and `currency` through `stripeAmount`, and make both required, because a custom event has no rule that keeps the two together. A play on it is marketing email. Only Barua's own receipt and order updates, from the core order events, go out without marketing consent.

Consent: send `marketing_opt_in: false` only for an explicit opt-out, such as someone turning marketing email off. Leave it out when the person made no choice. Under double opt-in, send `true` when they confirm their address, never when they submit the form.

## Send events

`POST /api/integrations/v1/events` with `{"records": [...]}`, one record per event. The `Idempotency-Key` header is optional for events.

```sh
curl -X POST https://barua.ai/api/integrations/v1/events \
  -H "Authorization: Bearer $BARUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"event_id":"signed_up:4812","name":"signed_up","external_id":"4812","occurred_at":"2026-09-23T10:15:00Z","properties":{"email":"ada@example.com","marketing_opt_in":true}}]}'
```

Send `signed_up` before a user's other events. Barua ties each event to its user through `external_id`, and an event whose `signed_up` hasn't arrived is held for at least 36 seconds, and up to about 10 minutes when little else is queued. Then it fails with `unknown_identity`. Resend it once the `signed_up` is in.

Send history with `"mode": "backfill"`: `{"mode": "backfill", "records": [...]}`. Live is the default mode. The workspace's `deploy_live_key` step finishes when a `signed_up` sent in live mode, and received within 72 hours of its `occurred_at`, applies through an active live key. A request in backfill mode never finishes it, so sending history that way leaves the step to your product's own signups. In a backfill, send every user's `signed_up` first, and send their other events once those requests have finished applying. Each 202 has a `receipt_id`, and `GET /api/integrations/v1/receipts/{receipt_id}` shows when its events have settled.

A 202 means Barua stored every event with a disposition. An invalid event is kept with its reasons and never fails the whole request. `records` has one entry per event, in the order you sent them, each with `ordinal`, `disposition`, `reason`, and for a quarantined event `reasons`, each with the `field` it names.

| Disposition | What it means |
| --- | --- |
| `pending` | Accepted. Barua applies it to its user shortly. |
| `applied` | Stored on the user. |
| `duplicate` | Barua already has this `event_id` with the same content. Nothing changed. |
| `quarantined` | The event failed a check. Barua keeps its reasons for seven days and applies nothing. |
| `failed` | It passed every check but couldn't be applied. `reason` says why. |
| `erased` | The user asked to be erased. |
| `validated` | Test keys only. The event passed every check, and Barua stopped there. |

## Limits

| Request | Limit |
| --- | --- |
| `POST /events`, `live` mode (the default) | 100 events, 256 KiB |
| `POST /events`, `backfill` mode | 1,000 events, 2 MiB |
| Test key events | 10,000 at once per workspace, refilling at 10,000 per 24 hours |
| `POST /plan` | 256 KiB, and 50 new proposals per workspace in 24 hours |
| `PUT /brand` | 32 KiB per request. The proposal Barua stores, the normalized tokens and `sources` as compact UTF-8 JSON, is at most 14 KiB, and a larger one answers 400 `brand_invalid`. |
| `POST /people/erase` | 1 KiB |

A 429 carries `Retry-After`. Wait that long, then send the same request again.

## Reason codes

A quarantined event lists up to 10 reasons, each with a `field` path such as `properties.title`. The last six codes come from applying an event to its user, so a test key never reports them.

<!-- docs-check:reason-codes -->
| Code | Meaning | Fix |
| --- | --- | --- |
| `invalid_event` | The event is not a JSON object. | Send each event as an object with `event_id`, `name`, `external_id` and `occurred_at`. |
| `missing_field` | A required envelope field is missing. | Add `event_id`, `name`, `external_id` and `occurred_at` to every event. |
| `unknown_field` | The envelope has a field Barua doesn't accept. | Move event data into `properties`. |
| `unknown_event` | Barua doesn't know this event name. | Use a core@1 event. To add a new one, propose it with `POST /api/integrations/v1/plan`. It works once the owner approves it. |
| `invalid_event_id` | event_id must look like name:id, for example created:4812. When the event's plan entry has id_from, the id is the value id_from names. When id_from names several, the id is their values joined by colons. | Build it from the event name and the source row id, joined by a colon. An event without id_from gets one id per occurrence. |
| `invalid_external_id` | `external_id` must be your user id, 1 to 256 characters. | Send the id your backend uses for this user, as a string. |
| `invalid_occurred_at` | `occurred_at` must be an ISO 8601 timestamp with a timezone, after 2000. | Send the source row's timestamp, for example `2026-09-23T10:15:00Z`. |
| `occurred_in_future` | `occurred_at` is more than 5 minutes after Barua received the event. | Send the time the fact became true, taken from the source row. If this repeats, check the server clock. |
| `missing_property` | A required property is missing. | Add the property named in `field`. `GET /api/integrations/v1/plan` lists what each event needs. |
| `invalid_property` | A property has the wrong type or format. | Send the type that `GET /api/integrations/v1/plan` names for this property. |
| `unknown_property` | This event doesn't define that property. | Remove it. For a custom event, add it to the plan with `POST /api/integrations/v1/plan` first. |
| `properties_too_large` | `properties` is larger than 8 KiB. | Send ids and short values. Barua needs only the fact the event records. |
| `unknown_identity` | Barua doesn't know this user yet. | First send this user's `signed_up` event, or their record on `POST /api/integrations/v1/identities`. Then resend this one. Resending is safe. |
| `identity_conflict` | This user's email clashes with a record Barua trusts more. | Check the email and `external_id` you send for this user. |
| `event_id_conflict` | This `event_id` was already used for a different event. | Give every occurrence its own `event_id`, like `activated:<row id>`. |
| `ownership_conflict` | This order already belongs to another user. | Give every order its own id. |
| `version_conflict` | Barua already has a different version of this record with the same timestamp. | Send each change with a later timestamp than the one before it. |
| `retry_exhausted` | Barua gave up applying this record after five attempts. | Resend it. Resending is safe. If it fails again, email chris@barua.ai. |
<!-- /docs-check:reason-codes -->

## Errors

Every error from `/api/integrations/v1` has the body `{"code": "...", "message": "...", "fix": "..."}`. Branch on `code`: it always comes from this table, and a code is never renamed or removed. `message` describes this request; `fix` says what to do next.

<!-- docs-check:error-codes -->
| Code | Status | Fix |
| --- | --- | --- |
| `invalid_key` | 401 | Send Authorization: Bearer ik_... with an active integration key. A workspace owner creates one with `POST /api/integrations/keys`. Keep it in your server's secret store. |
| `invalid_request` | 400 | Check the request against this endpoint's section of this page. For events, `GET /api/integrations/v1/plan` returns the schema. |
| `unsupported_media_type` | 415 | Send uncompressed JSON with `Content-Type: application/json`. |
| `too_large` | 413 | Send a smaller request. This page lists each endpoint's limit. |
| `idempotency_conflict` | 409 | Reuse an `Idempotency-Key` only with the exact same bytes. A new request needs a new key. |
| `rate_limited` | 429 | Wait for `Retry-After`, then send the same request again. Keep its `Idempotency-Key` if it has one. |
| `not_found` | 404 | Check the path and id. Receipts expire seven days after they complete. |
| `intake_disabled` | 503 | This workspace can't send records yet. Write to chris@barua.ai to enable it. |
| `unavailable` | 503 | Retry the same request with backoff. Repeating it is safe. |
| `plan_invalid` | 400 | Fix the fields named in `message`, then propose the full plan again. Names are snake_case, and core event names are taken. |
| `test_key_not_allowed` | 403 | Test keys can't change live data or read people. Make this call from production with the live key. |
| `feed_not_enabled` | 403 | Keep using your test key. Email chris@barua.ai to switch live events on. |
| `send_in_flight` | 409 | A message to this person is finishing. Retry in two minutes. |
| `brand_invalid` | 400 | Fix the token named in `message` and send the whole proposal again. Send only tokens you found in the repo. |
<!-- /docs-check:error-codes -->

## Custom events

For a moment only your product has, such as a report export, propose custom events with `POST /api/integrations/v1/plan`. Send the full set every time: an approved event you leave out is removed once the new version is approved. Use `not_emitted` for each declarable core event your product has no source for.

```json
{
  "events": [
    {
      "name": "report_exported",
      "description": "Someone exported a report. Sent when the export row commits.",
      "properties": {
        "report_name": { "type": "string", "required": true, "use": "copy", "max_length": 120 }
      }
    }
  ],
  "not_emitted": [{ "name": "purchased", "reason": "We have no payments yet." }]
}
```

<!-- docs-check:plan-rules -->
| Field | Rule |
| --- | --- |
| `events` | Up to 25 custom events. `[]` removes them all. |
| `name` | Matches `^[a-z][a-z0-9_]{0,63}$`, for example `report_exported`. It can't be a core event name or start with `barua_`, and `constructor` and `prototype` are reserved. It appears once per plan. |
| `description` | 1 to 280 characters, trimmed, with no control characters or unpaired UTF-16 surrogates. Say when the event fires in business terms. The owner reads it before approving. |
| `properties` | Up to 20. Each key matches the same pattern as `name`. `event_id`, `occurred_at`, `copy`, `constructor` and `prototype` are reserved: the first two belong to the envelope. Leave it out or send `{}` for none. `null` is refused. |
| `type` | One of `string`, `number`, `integer`, `boolean`, `timestamp`, `url`, `currency`. Send email addresses only as `signed_up.email`. |
| `required` | `true` or `false`. |
| `use` | `copy` or `targeting`, with the same meaning as for core properties. |
| `max_length` | Strings only, 1 to 500 characters. It defaults to 200. A `url` is always at most 2048. |
| `not_emitted` | Up to 4 declarations, each `{name, reason}`. `name` is a declarable core event: `activated`, `created`, `purchased` or `churned`, each at most once. `signed_up` is required and can't be declared. `reason` follows the `description` rule. Leave it out or send `[]` for none. `null` is refused. |
<!-- /docs-check:plan-rules -->

A new proposal answers 201 with a `needs_human` object, `{step, url, why, resume}`. Give the workspace owner `url` and `why`, then follow `resume`. Barua accepts a custom event only after the owner approves the version that defines it. Until then it arrives as `unknown_event`, and verify lists it under `awaiting_approval`. Sending the same plan again is safe: it answers 200 with the same version. When it matches the approved plan, the answer is `"status": "approved"` with `needs_human: null`, which means nothing changed.

## Check what arrived

`GET /api/integrations/v1/events/status?since=<ISO 8601 time>` reports, per event, what Barua received since that time, for test and live keys apart. Leave `since` out for the last 24 hours. It reaches back at most 7 days. The answer holds counts, reason codes and times, never a user's id or a property value, so a test key can read the live half too.

`verdict.test` and `verdict.live` each carry `exit`: 3 when `missing` or `invalid` has an entry (or more than 10,000 events failed), 4 when only a person can move it on (`needs_human`), and 0 when nothing is left. The skill's `scripts/verify.mjs` prints the verdict for one mode and exits with it. When more than 10,000 failed, `failures_truncated` is `true` and the exit stays 3 for any window that still holds those failures, so fix what is listed and check again with a `since` after your fix.

## What a person still does

`GET /api/integrations/v1/setup` returns `{complete, needs_human, optional, done}`. Each entry is a `needs_human` object, `{step, url, why, resume}`. Give the owner `url` and `why`, then follow `resume`. The workspace owner sees the same steps on the Setup screen, worked out from the same facts. The steps, in the order they're listed:

<!-- docs-check:needs-human -->
| Step | Pending while |
| --- | --- |
| `create_keys` | The workspace has no active test key, or no active live key. |
| `verify_domain` | The sending domain isn't verified, or the From address doesn't align with it. |
| `approve_tracking_plan` | A plan proposal waits for the owner. |
| `forward_email` | Optional, and listed under `optional`. Nobody has forwarded one of your emails yet. Barua reuses its design; without one, Barua uses its own. |
| `confirm_brand` | The owner hasn't confirmed a brand yet. Once confirmed it stays done, and a later proposal changes nothing. |
| `approve_templates` | The brand is confirmed and some play's email waits for the owner's review, or Barua couldn't write a play's emails and nothing is retrying them: the owner sees why under Plays, and an edit to the brand or playbook tries again. While Barua is still writing them, nothing is listed. |
| `enable_play_emails` | Every template is approved, but play emails aren't on. Approving templates doesn't turn them on: the owner does that on the Setup screen. Ask for it before the live deploy, because an event from before play emails are first on never starts a play. |
| `enable_live_events` | Both keys exist and the test events have passed, but live events aren't switched on for the workspace. |
| `deploy_live_key` | Live events are on and the test events have passed, but no live `signed_up` has applied through an active live key. Live means sent in `live` mode and received within 72 hours of its `occurred_at`. A backfill never counts. While play emails are off it isn't listed, so the account that proves the deploy can also start a play. |
<!-- /docs-check:needs-human -->

## Brand tokens

`PUT /api/integrations/v1/brand` saves brand tokens you found in the repo as a proposal. Nothing changes until the workspace owner confirms it, so send only tokens you found, with the `file:line` each came from in `sources`.

```json
{
  "tokens": {
    "from_name": "Acme",
    "voice": "Plain and warm. Short sentences.",
    "template": { "accent_color": "#e4572e", "logo_url": "https://acme.example/logo.png", "font_family": "Inter, sans-serif", "footer_name": "Acme Inc" }
  },
  "sources": {
    "from_name": "web/app/layout.tsx:8",
    "voice": "docs/brand.md:3",
    "template.accent_color": "web/tailwind.config.ts:12",
    "template.logo_url": "web/app/layout.tsx:14",
    "template.font_family": "web/tailwind.config.ts:20",
    "template.footer_name": "web/components/Footer.tsx:5"
  }
}
```

The tokens are `from_name`, `voice`, `language_policy` and `template` with `accent_color`, `logo_url`, `font_family` and `footer_name`. A proposal can't set `site_url`, `from_email`, `reply_to`, `send_policy`, `template.colors` or `template.html`: the owner sets those in Settings, or they come from a forwarded email. Any other key, or an empty string, answers 400 `brand_invalid`. The same tokens again answer `replayed: true` and keep the proposal waiting since the first time, with the `sources` you sent last. Once the owner has confirmed a brand, nothing is stored and the answer has `"status": "confirmed"` and `needs_human: null`. A replay with no `sources`, left out or `{}`, keeps the ones the proposal has.

## Erase a person

When someone deletes their account in your product, read their email before the delete, and in the same transaction write an erase job that keeps the user's id and that email: a row in an outbox table, or a job in a queue that commits with the transaction. When the delete runs outside your database, such as through an auth provider's API, write the job just before the delete and remove it if the delete fails. That job waits until the account is gone before it calls erase, so an erase never reaches someone whose delete failed. The erase job calls `POST /api/integrations/v1/people/erase` from your server with the live key, twice: once with `external_id` and once with `email`, as `{"external_id": "4812"}` and then `{"email": "ada@example.com"}`. A request carries one of the two, never both. With `external_id`, Barua erases the address it holds for that user, which came from their `signed_up` event or identity record and is an old one when the email changed since.

The job retries each call until it answers 200 with `"erased": true`, unless the table below says to stop. It's finished once both calls have answered that way, and no other answer finishes it. Calling erase again is safe: a call that already went through gets the same answer with zero counts.

| Answer | What the job does |
| --- | --- |
| 200 with `"erased": true` | That call is done. |
| 409 `send_in_flight` | An email to them is on its way, and nothing was erased. Retry in two minutes. |
| 429 | Retry once `Retry-After` has passed. |
| 5xx, or no answer within 30 seconds | Retry with backoff, doubling the wait up to an hour. A 503 that says the erasure ran out of time fails the same way until Barua's team finishes it by hand, so keep retrying about once an hour, and write to chris@barua.ai if it keeps failing. |
| Any other answer, such as another 4xx or a 2xx without `"erased": true` | A retry fails the same way, so stop retrying and log the answer's status, with its `code` and `fix` when it has them. Keep the job, so it can run again once the cause is fixed. A test key's 403 `test_key_not_allowed` is one of these. |

Log each failed attempt with the job's id and the answer's `code`, never the email or the key.

Never make the erase a call inside the deletion request, awaited or under `waitUntil`. A 409 asks for two minutes and a 503 can last hours, longer than any request waits, and once the account is deleted nothing else in your product holds the id and the email. A call that fails there leaves the person's data in Barua for good. If your product has no job queue, add a small outbox table for erase jobs, written in the delete's transaction, and a scheduled job that runs the ones that are due and records each answer.
