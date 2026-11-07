---
name: barua-setup
description: Sets up and maintains Barua email for a product. Reads repos, writes server-side emitters, manages plans, plays, saved segments and one-off campaigns under an owner's permissions, and verifies fresh delivery. Use for setup, event changes, brand or play updates, campaigns, launch, key rotation, and event errors. Supports full delegation or owner review at selected checkpoints.
license: MIT
metadata:
  version: "2"
---

# Barua setup

Start with the task the owner requested. One custom event or an owner test email is enough. If they only said “set up Barua”, offer those starting points and ask which they want first. Recommend broader setup review once; it is optional.

Read this router, then only the linked task sections you need. Read a named section through the next heading of the same level, including its prerequisites and recovery links. If output is truncated, fetch the missing range before acting. Do not preload whole operation manuals or the bulk docs export.

## Choose your access path

- With `BARUA_MANAGEMENT_KEY`, follow [quickstart](references/quickstart.md) once to verify private access and the exact workspace. Use the actual grant, never an assumed default.
- With only `BARUA_API_KEY`, verify it is a test key before any other Barua call. Follow [one event](references/events.md#start-with-one-event) or [full event-only setup](references/event-only.md), according to the request.
- For a missing key, use [key recovery](references/management.md#recover-a-lost-management-key). For signup, a new connection or owner approval, load the relevant [owner procedure](references/owner.md). Terms acceptance remains the owner's decision.
- For read-only inspection, use [inspection](references/inspection.md). Do not start setup or collect unrelated diagnostics.

## Choose the requested task

These are alternatives, not a sequence.

| Requested outcome | Read before the corresponding action |
| --- | --- |
| Send a test email to the owner | [Owner sample](references/owner-sample.md). No events, DNS or journey plan required. |
| Add or fix one event | [Start with one event](references/events.md#start-with-one-event), its linked event contract and server-delivery rules. Preserve the existing plan and pending work. |
| Prepare a segment or campaign | [Campaign procedure](references/management.md#send-one-campaign-to-a-saved-segment). Preparation and sending have separate permissions. |
| Add or change a Play | [Exact Play procedure](references/management.md#propose-and-operate-a-play). Reconcile the saved revision, policy and previews before approval, even with full delegation. |
| Full setup or launch | [Complete setup](references/management.md#complete-setup-and-later-changes) and [full handoff](references/management.md#finish-and-hand-off). Read each operation's contract before using it. |
| Broader lifecycle strategy, if chosen | [Journey review](references/journey-review.md). Maintain its local HTML/JSON and exact input evidence. |
| Optional pixel or historical import | [Optional setup](references/optional-setup.md). Only when relevant; do not replace installed keys or replay history as live activity. |
| Activity-based suggestions | [Discovery opportunities](references/management.md#discovery-opportunities). |
| Delivery or domain troubleshooting | [Deliverability](references/management.md#deliverability) and the requested [inspection](references/inspection.md). |

## Work and handoff

Lead each update with the owner's outcome and the current step. Keep workspace IDs, permission names and technical evidence out of routine progress unless they explain a concrete blocker. For example: “I’ll prepare a private test for your inbox. Should I use your forwarded design or a brand sample?”

Discover available facts first and reuse supplied answers. Continue authorized routine reads, checks and resumes without asking permission again. Ask only for consequential choices or authority that tools and existing context cannot supply. Discover external access only for the selected task; Barua permission does not grant repo, DNS, hosting, database, browser or email-provider access. Continue independent work while one action waits.

Keep credentials private. Preserve consent, suppression and owner authority. Never fabricate events or customer sends to pass a check. A saved grant is not a connected agent; accepted mail is not delivered mail. Follow the selected task's verification and stop at its requested outcome.

For a narrow task, report its saved version/status, actual check result and exact pending operation, plus the sample preview if made. Do not produce a workspace-wide review package. Full setup uses the linked full handoff; journey artifacts are included only when that review was selected. Use plain language without promotional filler, dramatic fragments or contrast slogans.

## Next onboarding task

After each onboarding milestone, recommend one relevant unfinished task and briefly explain why it comes next. Use current setup facts and the owner's goal; make a scoped read if needed. Respect completed, skipped and deferred steps. When progress is blocked, name the specific action that unblocks it. Keep pending delivery checks honest and reuse the saved operation.

End the milestone summary with `Next: <immediate task and why it matters now>`. Put any required owner action there. Leave later tasks for later milestones and refer only to verified results and available artifacts.

Continue already-authorized work within the owner's onboarding scope and actual grant once its prerequisites and required approvals are satisfied. Until an owner checkpoint is approved, the next task remains blocked. Do not ask permission again for work already authorized. A completed narrow task ends with the recommendation; it does not authorize extra work. Say onboarding is complete only when current evidence confirms its required steps are done. A finished sample or event alone does not establish that. Do not invent another task when setup is complete.

## Install

```sh
npx skills add getbarua/skills --skill barua-setup
```

Read [installation and portable fallback](references/install.md) if the skill is missing or incomplete. Install the whole folder so helpers retain their relative dependencies.

## Start with the agent

Continue with [quickstart](references/quickstart.md), then the selected task above.

## Saved segments and one-off campaigns

Use the [campaign procedure](references/management.md#send-one-campaign-to-a-saved-segment).

## Before you start

The former inline event-only instructions now live in [Before you start](references/event-only.md#before-you-start).

## Steps

Use [event-only steps](references/event-only.md#steps) for full event-only setup.

## Finish an event-only run

Follow [the event-only handoff](references/events.md#finish-an-event-only-run).

## When verify exits 4

See [verification recovery](references/event-only.md#when-verify-exits-4).

## ALWAYS

Read the [event implementation rules](references/event-only.md#always) before changing emitters.

## NEVER

Read the [event safety rules](references/event-only.md#never) before changing emitters.

## Exit codes

The [canonical verifier exit codes](references/event-only.md#exit-codes) remain unchanged.

## Report format

Use the [full event-only report](references/event-only.md#report-format) for full setup; a named event uses its scoped handoff.
