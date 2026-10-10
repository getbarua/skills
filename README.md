# Barua skills

Agent Skills for setting up [Barua](https://barua.ai), lifecycle email that runs on the facts your product's server reports. They run in your coding agent: Claude Code, Codex, Cursor or any agent that reads `SKILL.md`.

## barua-setup

Your agent reads your repos, writes server-side emitters for Barua's events, proposes custom events and brand tokens for you to approve, and checks its work with `scripts/verify.mjs` until the events validate. You approve the plan and the brand, and handle DNS and the live key. The skill tells your agent never to send source code to Barua: only events, the tracking plan, brand tokens and the `file:line` each token came from.

```sh
npx skills add getbarua/skills --skill barua-setup
```

Then tell your agent: "Set up Barua for this project", and name the repos. It needs a Barua test key as `BARUA_API_KEY` in a dev env file that git ignores. The workspace owner gives you one.

To install for one agent without prompts, add `-a claude-code` or `-a codex` and `-y`. Or copy `skills/barua-setup/` into your repo's `.claude/skills/` (Claude Code) or `.agents/skills/` (Codex).

The event contract is also at https://barua.ai/docs/events.md, and the skill at https://barua.ai/skills/barua-setup/SKILL.md.

## Changes

This repository is published from Barua's own codebase, so changes made here are overwritten by the next sync. Write to chris@barua.ai with fixes or questions.
