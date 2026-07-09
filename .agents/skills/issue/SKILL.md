---
name: issue
description: Create, update, and delete typed Linear issues through the Linear MCP server, not GitHub. Use when the user asks to file an issue, create a bug/task/spike/ticket, update issue fields, change status/assignee/labels/project/priority, add issue context, or delete/remove a Linear issue.
---

# Issue

Manage Linear issues through the Linear MCP server. Do not create or update GitHub issues for this workflow.

Requires an authenticated Linear MCP server, preferably named `linear` and connected to `https://mcp.linear.app/mcp`. For Codex, use the OAuth-based Linear MCP setup (`codex mcp add linear --url https://mcp.linear.app/mcp`, then `codex mcp login linear`) rather than a Linear API-key bearer token. Use the GitHub CLI (`gh`) for GitHub work; do not configure or use the GitHub MCP for this skill.

## Workflow

1. Confirm Linear MCP access.
   - Use the available Linear MCP tools/resources only.
   - If no Linear MCP server or issue mutation tools are available, stop and tell the user Linear MCP is not connected.
   - Do not fall back to GitHub, local files, or direct Linear API calls unless the user explicitly changes the request.

2. Resolve missing issue context.
   - For create requests, determine the issue type: `bug`, `task`, or `spike`.
   - If the type is unclear, ask a follow-up question before creating the issue.
   - Read `references/issue-types.md` before creating typed issues.
   - Gather the title, team, and required fields for the selected issue type.
   - Infer obvious fields from the user request, but ask before guessing destructive or routing-sensitive fields such as team, project, assignee, due date, or priority.
   - Ask concise follow-up questions for missing required issue-type sections. Do not create a vague issue when required sections are missing.
   - For update/delete requests, identify the issue by Linear key (for example `ENG-123`) or by searching Linear when the user gives a title or URL.

3. Create issues.
   - Use the Linear MCP issue creation tool.
   - Format the Linear issue description with the matching template from `references/issue-types.md`.
   - For `spike` issues, always include an acceptance criterion that requires creating or updating a reference document as an outcome.
   - Set team, project, assignee, labels, priority, cycle, estimate, and state only when provided or confidently inferable from Linear context.
   - After creation, return the Linear issue key, title, URL if available, and any fields that were set.

4. Update issues.
   - Fetch the current issue first unless the MCP update tool already provides enough context.
   - Apply only the fields the user requested.
   - Preserve existing description content unless the user asks to replace or rewrite it.
   - For large description changes, summarize the intended edit before applying if the instruction is ambiguous.
   - After update, report the changed fields and issue key.

5. Delete issues.
   - Treat deletion as destructive.
   - Confirm the exact Linear issue key/title before deleting unless the user's request already gives an unambiguous key and explicit delete instruction.
   - Use the Linear MCP delete/remove issue tool when available.
   - If the Linear MCP server does not expose deletion, say so and offer to move the issue to a canceled/closed/archive state only with user confirmation.
   - After deletion, report the issue key and deletion result.

## Gotchas

- "Issue" means Linear issue in this skill, not GitHub issue.
- New Linear issues must use one of the supported issue types: `bug`, `task`, or `spike`.
- Linear MCP tool names vary by client. Select tools by their descriptions and schemas rather than assuming exact names.
- Never delete a Linear issue based only on a fuzzy title match.
- Do not expose private Linear content beyond what is needed to complete the user's request.
- If multiple Linear issues match, show the candidates and ask the user to choose.
- Spikes are research outputs. Always make the reference document explicit in the issue body and acceptance criteria.

## Examples

User: "Create an issue for the settings page crashing on save."
Action: Treat it as a `bug`, ask for missing reproduction details if needed, then create a Linear issue using the bug template.

User: "Create a task to add account export."
Action: Treat it as a `task`, ask for missing business case, implementation, or acceptance criteria, then create the issue.

User: "Create a spike to research which billing provider to use."
Action: Treat it as a `spike`, ask for missing business case or acceptance criteria, and include a required reference document outcome.

User: "Move ENG-123 to In Progress and assign it to Maya."
Action: Fetch `ENG-123`, update only state and assignee, then report the result.

User: "Delete the typo ticket."
Action: Search Linear, show matching candidates, and ask for confirmation before deleting.
