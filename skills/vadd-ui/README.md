# vadd-ui agent skill

`SKILL.md` teaches a coding agent when and how to emit vadd-ui visuals. It stands alone: copying that one file is the whole install. Orca plugins cannot ship skills yet, so installing it is separate from Orca.

Run these from a checkout of this repo.

For one user, in `~/.claude/skills/`:

```sh
mkdir -p ~/.claude/skills/vadd-ui
cp skills/vadd-ui/SKILL.md ~/.claude/skills/vadd-ui/
```

For one project, in its `.claude/skills/`, with the project's folder in `PROJECT`:

```sh
mkdir -p "$PROJECT/.claude/skills/vadd-ui"
cp skills/vadd-ui/SKILL.md "$PROJECT/.claude/skills/vadd-ui/"
```

Claude Code finds it at the next session start. The skill expects `vui` on `PATH` (`@vadd/ui-cli`), and falls back as its behavior 6 says when it is not.
