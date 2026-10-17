# Barua skills

Agent Skills for setting up [Barua](https://barua.ai), lifecycle email that runs on the facts your product's server reports. They run in your coding agent: Claude Code, Codex, Cursor or any agent that reads `SKILL.md`.

## barua-setup

Your agent reads your repos, writes server-side emitters and checks their events with `scripts/verify.mjs`. A management connection lets it finish setup and maintain the workspace through the API. You choose its permissions and whether the plan, brand, plays or launch need your review. It uses your already authorized tools for DNS and production secrets, and proves a new event reaches a delivered email. It sends product facts and configuration to Barua, never source code or environment secrets.

```sh
npx skills add getbarua/skills --skill barua-setup
```

Then tell your agent: "Set up Barua for this project", and name the repos. Give it an owner-authorized `BARUA_MANAGEMENT_KEY` through your secret store. With only a test key as `BARUA_API_KEY` in an ignored dev env file, it can still implement and validate events and hand over the remaining steps. The helper keeps new credentials out of its output; see [management access](barua-setup/references/management.md).

To install for one agent without prompts, add `-a claude-code` or `-a codex` and `-y`. Or copy `skills/barua-setup/` into your repo's `.claude/skills/` (Claude Code) or `.agents/skills/` (Codex).

The event contract is also at https://barua.ai/docs/events.md, and the skill at https://barua.ai/skills/barua-setup/SKILL.md.

## Changes

This repository is published from Barua's own codebase, so changes made here are overwritten by the next sync. Write to chris@barua.ai with fixes or questions.
