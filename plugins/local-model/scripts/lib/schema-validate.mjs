// Hand-rolled validator for the review-output schema (see
// plugins/local-model/schemas/review-output.schema.json). No JSON-schema
// library dependency: the plugin ships zero runtime dependencies, since
// Claude Code installs it directly from this git repo without an `npm
// install` step.

const SEVERITIES = new Set(["critical", "high", "medium", "low"]);
const VERDICTS = new Set(["approve", "needs-attention"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value >= 1;
}

function validateFinding(finding, index, errors) {
  const prefix = `findings[${index}]`;
  if (typeof finding !== "object" || finding === null) {
    errors.push(`${prefix}: expected object`);
    return;
  }
  if (!SEVERITIES.has(finding.severity)) {
    errors.push(`${prefix}.severity: expected one of ${[...SEVERITIES].join(", ")}`);
  }
  for (const field of ["title", "body", "file", "recommendation"]) {
    if (!isNonEmptyString(finding[field])) {
      errors.push(`${prefix}.${field}: expected non-empty string`);
    }
  }
  if (!isPositiveInt(finding.line_start)) {
    errors.push(`${prefix}.line_start: expected integer >= 1`);
  }
  if (!isPositiveInt(finding.line_end)) {
    errors.push(`${prefix}.line_end: expected integer >= 1`);
  }
  if (
    typeof finding.confidence !== "number" ||
    finding.confidence < 0 ||
    finding.confidence > 1
  ) {
    errors.push(`${prefix}.confidence: expected number in [0, 1]`);
  }
}

/**
 * Validate a parsed model-output object against the review-output schema.
 * Returns { valid, errors }. Callers should give the model exactly one
 * retry (with the errors fed back as feedback) on invalid output before
 * failing the job — see local-companion.mjs.
 */
export function validateReviewOutput(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { valid: false, errors: ["root: expected a JSON object"] };
  }

  if (!VERDICTS.has(value.verdict)) {
    errors.push(`verdict: expected one of ${[...VERDICTS].join(", ")}`);
  }
  if (!isNonEmptyString(value.summary)) {
    errors.push("summary: expected non-empty string");
  }
  if (!Array.isArray(value.findings)) {
    errors.push("findings: expected array");
  } else {
    value.findings.forEach((finding, index) => validateFinding(finding, index, errors));
  }
  if (!Array.isArray(value.next_steps)) {
    errors.push("next_steps: expected array");
  } else {
    value.next_steps.forEach((step, index) => {
      if (!isNonEmptyString(step)) errors.push(`next_steps[${index}]: expected non-empty string`);
    });
  }

  const allowedKeys = new Set(["verdict", "summary", "findings", "next_steps"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`unexpected property: ${key}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Pull the first fenced ```json ... ``` block (or, failing that, the first
 * top-level {...} object) out of free-form model text, matching how we
 * instruct the review agents to respond.
 */
export function extractJsonBlock(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
