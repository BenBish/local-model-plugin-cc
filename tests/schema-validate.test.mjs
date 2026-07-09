import test from "node:test";
import assert from "node:assert/strict";
import {
  validateReviewOutput,
  extractJsonBlock,
} from "../plugins/local-model/scripts/lib/schema-validate.mjs";

const VALID = {
  verdict: "approve",
  summary: "Looks fine.",
  findings: [],
  next_steps: [],
};

test("validateReviewOutput accepts a minimal valid object", () => {
  const result = validateReviewOutput(VALID);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateReviewOutput accepts a fully populated finding", () => {
  const result = validateReviewOutput({
    verdict: "needs-attention",
    summary: "One issue.",
    findings: [
      {
        severity: "high",
        title: "Bug",
        body: "Explanation",
        file: "src/index.mjs",
        line_start: 10,
        line_end: 12,
        confidence: 0.8,
        recommendation: "Fix it",
      },
    ],
    next_steps: ["Fix the bug"],
  });
  assert.equal(result.valid, true);
});

test("validateReviewOutput rejects unknown verdict", () => {
  const result = validateReviewOutput({ ...VALID, verdict: "maybe" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("verdict")));
});

test("validateReviewOutput rejects missing findings array", () => {
  const { verdict, summary, next_steps } = VALID;
  const result = validateReviewOutput({ verdict, summary, next_steps });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("findings")));
});

test("validateReviewOutput rejects out-of-range confidence", () => {
  const result = validateReviewOutput({
    ...VALID,
    findings: [
      {
        severity: "low",
        title: "t",
        body: "b",
        file: "f",
        line_start: 1,
        line_end: 1,
        confidence: 1.5,
        recommendation: "r",
      },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("confidence")));
});

test("validateReviewOutput rejects unexpected top-level properties", () => {
  const result = validateReviewOutput({ ...VALID, extra: "nope" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("unexpected property")));
});

test("extractJsonBlock pulls a fenced json block out of surrounding prose", () => {
  const text = `Here is my answer:\n\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\`\nDone.`;
  const parsed = extractJsonBlock(text);
  assert.deepEqual(parsed, VALID);
});

test("extractJsonBlock returns null when there is no JSON object", () => {
  assert.equal(extractJsonBlock("no json here"), null);
});
