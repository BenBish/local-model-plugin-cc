---
name: create-skill
description: Create or update portable Agent Skills with SKILL.md frontmatter, concise progressive-disclosure instructions, optional scripts/references/assets, and validation. Use when the user asks to create a skill, make a custom skill, convert repeated instructions into a skill, or improve an existing skill for Codex, Claude Code, OpenCode, or other agent harnesses.
---

# Create Skill

Create skills as portable Agent Skills first, then add harness-specific metadata only when it is useful and non-conflicting.

## Workflow

1. Clarify the job the skill must perform.
   - Capture 2-4 realistic user prompts that should trigger it.
   - Identify prompts that should not trigger it if over-triggering is likely.
   - Confirm the target location. Prefer repo-local `.agents/skills/<skill-name>/` for portable project skills unless the user asks for a harness-specific location.

2. Choose the skill shape.
   - Keep the skill focused on one coherent capability.
   - Put non-obvious procedure, domain context, gotchas, output templates, and validation steps in `SKILL.md`.
   - Put detailed or conditional material in `references/`.
   - Put deterministic repeated logic in `scripts/`.
   - Put templates, sample files, images, and other output resources in `assets/`.

3. Create or update the directory.
   - Name the directory and frontmatter `name` with lowercase letters, digits, and hyphens only.
   - Keep the name under 64 characters, with no leading, trailing, or doubled hyphens.
   - Make the directory name exactly match frontmatter `name`.

4. Write `SKILL.md`.
   - Use only open-standard frontmatter by default: `name`, `description`, and optional `license`, `compatibility`, `metadata`, or `allowed-tools`.
   - Put all trigger guidance in `description`; the body loads only after activation.
   - Keep `description` under 1024 characters and put the strongest trigger first.
   - Keep the body concise, normally under 500 lines.
   - Use imperative instructions and concrete examples.
   - Reference bundled files with paths relative to the skill root and explain when to read or run each file.

5. Add optional harness metadata conservatively.
   - For Codex/OpenAI UI metadata, use `agents/openai.yaml` only as an additive interface file.
   - For Claude Code-only behavior such as `when_to_use`, `disable-model-invocation`, `user-invocable`, `context`, or `agent`, avoid adding it to the portable `SKILL.md` unless the user explicitly wants Claude-specific behavior.
   - For OpenCode, do not assume `SKILL.md` is its native agent format; keep the portable skill useful as instructions, and add OpenCode agent files separately only when requested.
   - Read `references/harness-compatibility.md` before adding harness-specific fields or install-location advice.

6. Validate and iterate.
   - Run the best available validator. Prefer `skills-ref validate <skill-dir>` if installed; otherwise run any repo or harness validator present.
   - Check manually that frontmatter parses, required files exist, references are relative and real, and no placeholder text remains.
   - Forward-test complex skills with fresh context when practical: ask an agent to use the skill on a realistic task without leaking the intended answer.
   - Revise based on execution traces, false triggers, missed steps, and user corrections.

## Portable Structure

Use this structure unless the task needs less:

```text
skill-name/
├── SKILL.md
├── references/
├── scripts/
└── assets/
```

Only create directories that are actually useful. Avoid extra README, changelog, installation, or process notes inside the skill folder.

## SKILL.md Template

```markdown
---
name: skill-name
description: Does the specific work. Use when the user asks for trigger phrase, related task, or relevant artifact type.
---

# Skill Name

One sentence describing the capability.

## Workflow

1. Do the first required step.
2. Use `references/specific-guide.md` when the task includes the specific condition.
3. Run `scripts/validator.py <input>` before finalizing if validation is required.

## Gotchas

- Capture concrete mistakes an agent would otherwise make.

## Output

Use this format when the user has not requested another format:

```text
[short template]
```
```

## Quality Bar

A good skill is:

- Grounded in real tasks, project artifacts, or user corrections.
- Specific where the workflow is fragile and flexible where context should decide.
- Short enough that loading it helps more than it distracts.
- Explicit about when to load each bundled reference.
- Validated by real use, not just by clean formatting.
