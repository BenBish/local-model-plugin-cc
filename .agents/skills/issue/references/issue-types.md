# Issue Types

Use these templates when creating Linear issues. Ask follow-up questions for missing required sections before creating the issue.

## Type Selection

- Use `bug` when something existing is broken, incorrect, regressed, or failing.
- Use `task` when implementation work is needed for a feature, change, cleanup, or operational action.
- Use `spike` when the work is research, discovery, technical investigation, or decision preparation.
- If more than one type fits, ask the user which type to use.

## Task

Required sections:

```markdown
## Description / business case
[Why this work matters and what outcome it supports.]

## User story
[Optional. As a <user/persona>, I want <capability>, so that <benefit>.]

## Tech implementation
[Implementation notes, affected systems, constraints, or proposed approach.]

## Acceptance criteria
- [Observable condition that must be true]
- [Test, workflow, or review condition]
```

Follow-up questions when missing:

- "What is the business case or user impact for this task?"
- "What implementation approach or affected area should be captured?"
- "What acceptance criteria should define done?"
- "Is there a user story you want included, or should I omit that optional section?"

## Bug

Required sections:

```markdown
## Impact / business case
[Who is affected, severity, frequency, and why this matters.]

## Steps to reproduce
1. [First step]
2. [Second step]
3. [Observed failure point]

## Expected behaviour
[What should happen.]

## Actual behaviour
[What happens instead.]
```

Follow-up questions when missing:

- "What is the impact or severity of this bug?"
- "What are the steps to reproduce it?"
- "What was the expected behaviour?"
- "What actual behaviour did you observe?"

## Spike

Required sections:

```markdown
## Description / business case
[What needs to be investigated and why the decision matters.]

## Acceptance criteria
- [Question, decision, or recommendation the spike must answer]
- Create or update a reference document with findings, tradeoffs, recommendation, and next steps.
```

Follow-up questions when missing:

- "What decision or unknown should this spike resolve?"
- "What business case or product/technical risk makes this research necessary?"
- "Where should the reference document live, or should the agent propose a location?"
- "What acceptance criteria should the completed reference document satisfy?"

For every spike, keep the reference document outcome in the acceptance criteria even if the user does not mention it.
