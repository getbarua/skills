# Install the Barua setup skill


```sh
npx skills add getbarua/skills --skill barua-setup
```

Without flags it asks which agents to install for. For one agent without prompts, add `-a claude-code` or `-a codex` and `-y`:

```sh
npx skills add getbarua/skills --skill barua-setup -a claude-code -y
```

If the installer is unavailable, copy `skills/barua-setup/` from the [published repository](https://github.com/getbarua/skills), including its relative dependencies, or copy an existing installation. Do not repair global npm permissions or request a particular model account for setup. Read [SKILL.md](../SKILL.md) and its selected branches directly when native skill loading is unavailable.

Or copy this folder to `.claude/skills/barua-setup/` for Claude Code, or to `.agents/skills/barua-setup/` for Codex.
Install the whole folder. `manage.mjs` needs `review-package.mjs`; `owner.mjs` needs `owner-storage.mjs`; both need `private-input.mjs`. Keep every relative dependency beside its caller.
For customer and email reads, follow [inspection.md](inspection.md). `inspect.mjs` needs `inspect-output.mjs`, `owner-storage.mjs` and `private-input.mjs`; it saves previews privately without loading tracking or unsubscribe links.
The optional task formatters need [`templates/journey-discovery-task.md`](../templates/journey-discovery-task.md), [`templates/journey-review-task.md`](../templates/journey-review-task.md) and [`references/events.md`](events.md). Preserve their relative paths.
