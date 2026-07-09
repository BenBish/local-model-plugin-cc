# Harness Compatibility

Use the open Agent Skills format as the portable baseline. Add harness-specific fields only when they are needed for that harness and accepted by the user.

## Portable Baseline

Portable skill folders contain `SKILL.md` with YAML frontmatter and Markdown instructions.

Required frontmatter:

- `name`: 1-64 characters, lowercase letters, digits, hyphens, no leading/trailing/doubled hyphens, matching the directory name.
- `description`: 1-1024 characters describing what the skill does and when to use it.

Portable optional frontmatter:

- `license`
- `compatibility`
- `metadata`
- `allowed-tools` (support varies)

Portable optional directories:

- `references/`: context to load only when needed.
- `scripts/`: deterministic helpers the agent can run.
- `assets/`: templates and static resources used in outputs.

## Location Guidance

Use `.agents/skills/<skill-name>/` for repo-local, harness-agnostic source skills.

Use harness-native mirrors only when needed:

- Claude Code project skills: `.claude/skills/<skill-name>/`.
- Claude Code personal skills: `~/.claude/skills/<skill-name>/`.
- Codex/OpenAI personal skills often live under `~/.codex/skills/` or `$CODEX_HOME/skills/` when that harness is available.
- OpenCode agents use Markdown agent files in OpenCode config locations; treat those as separate adapters, not as the canonical skill source, unless current OpenCode documentation says otherwise.

When maintaining multiple locations, keep `.agents/skills/<skill-name>/` canonical and copy or adapt outward.

## Claude Code Notes

Claude Code follows the Agent Skills standard and supports additional frontmatter such as `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `context`, and `agent`.

Do not add Claude-only fields to portable skills by default. Add them when:

- The user explicitly targets Claude Code.
- The behavior cannot be represented with portable `description` and instructions.
- The user accepts reduced portability.

Claude Code also supports dynamic context injection and `${CLAUDE_SKILL_DIR}` substitutions. These are powerful but not portable; avoid them in `.agents/skills` unless a Claude-specific adapter is being created.

## Codex/OpenAI Notes

Codex-compatible skills use the same `SKILL.md` baseline in this workspace. UI metadata can live in `agents/openai.yaml` with fields such as `interface.display_name`, `interface.short_description`, and `interface.default_prompt`.

Keep `agents/openai.yaml` additive:

- Do not duplicate procedural instructions there.
- Ensure `default_prompt` mentions the literal `$skill-name`.
- Do not rely on it for skill activation or correctness.

## OpenCode Notes

OpenCode documentation currently emphasizes custom agents as Markdown files with YAML frontmatter such as `description`, `mode`, and `permission`.

For a portable skill request, create the Agent Skills folder in `.agents/skills`. If the user asks for OpenCode-native integration, create an adapter agent file separately and have it reference or summarize the skill. Do not put OpenCode agent-only fields into portable `SKILL.md` unless the user wants an OpenCode-specific file.

## Compatibility Checklist

- `SKILL.md` has valid YAML frontmatter.
- Frontmatter includes only portable fields unless a harness-specific adapter is intentional.
- Directory name equals `name`.
- Description contains trigger phrases and artifact types.
- Bundled references are linked directly from `SKILL.md`.
- Scripts are executable or have explicit interpreter commands.
- No generated placeholder text remains.
- Optional harness metadata is consistent with `SKILL.md` but not required for correctness.
