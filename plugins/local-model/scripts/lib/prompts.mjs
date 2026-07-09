const SCHEMA_INSTRUCTIONS = `Respond with your findings as a single fenced \`\`\`json code block containing an
object matching exactly this shape (see schemas/review-output.schema.json):

{
  "verdict": "approve" | "needs-attention",
  "summary": "<1-3 sentence overview>",
  "findings": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "title": "<short title>",
      "body": "<explanation of the issue>",
      "file": "<repo-relative path>",
      "line_start": <int>,
      "line_end": <int>,
      "confidence": <0-1>,
      "recommendation": "<concrete fix>"
    }
  ],
  "next_steps": ["<actionable follow-up>", ...]
}

Use your read/glob/grep tools to inspect the actual files before citing a
line — do not guess line numbers. Only include findings you are grounded in
real file content. If there is nothing worth flagging, return an empty
findings array and verdict "approve".`;

// codex exec review's native --uncommitted/--base flags can't be combined
// with a custom prompt (confirmed: "the argument '--uncommitted' cannot be
// used with '[PROMPT]'"), and codex exec review ignores --output-schema
// entirely in favor of its own native "[P1] Title — file:line" text format
// (confirmed empirically). So this plugin uses plain `codex exec` for
// reviews, with the diff target described here in the prompt instead of as
// a CLI flag, and does NOT pass --output-schema at all (see codex-run.mjs):
// with it present, the model was observed to skip investigation entirely
// and answer immediately (wrongly claiming no changes existed when they
// did); without it, the same model reliably ran git status/diff first. The
// explicit numbered "Step 1/2/3" structure below is what actually gets the
// model to investigate before answering — schema conformance is enforced
// by the JSON-shape instructions further down plus the broker's own
// validate-and-retry logic, not by any CLI flag.
function targetInstruction(target) {
  if (target?.base) {
    return `Step 1: run \`git diff ${target.base}\` (and \`git status\` if useful) to see the actual changes between \`${target.base}\` and the current working tree, including uncommitted changes. Do not answer before doing this.`;
  }
  return "Step 1: run `git status` and `git diff` (plus `git diff --cached` if anything is staged) to see the actual uncommitted changes in this repository. Do not answer before doing this.";
}

export function buildReviewPrompt(target) {
  return [
    "You are a careful code reviewer.",
    targetInstruction(target),
    "Step 2: read whatever files you need for context using your read/search tools.",
    "Step 3: focus on correctness bugs, security issues, and clear maintainability problems introduced by these changes. Do not comment on pre-existing code outside the diff unless it is directly relevant to a bug in the diff.",
    SCHEMA_INSTRUCTIONS,
  ].join("\n\n");
}

export function buildAdversarialReviewPrompt(target, focus) {
  return [
    "You are an adversarial reviewer. Assume the author may have missed something.",
    targetInstruction(target),
    "Step 2: read whatever files you need for context using your read/search tools.",
    "Step 3: actively look for unstated design assumptions, failure modes under concurrency/partial failure/adversarial input, and alternative approaches that would have been simpler or safer. Be specific and cite real file/line evidence, not speculation.",
    focus ? `Additional focus requested by the user: ${focus}` : null,
    SCHEMA_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildRescuePrompt(taskText) {
  return [
    `Task: ${taskText}`,
    "You have shell access, sandboxed to this repository's working tree (writes outside it, and to .git internals, will be refused at the OS level). Make the minimal set of file changes needed to complete the task. Prefer small, targeted edits over broad rewrites.",
    "When you are done, reply with a short plain-text summary of what you changed and why. Do not fence it as JSON.",
  ].join("\n\n");
}
