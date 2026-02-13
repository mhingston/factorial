# Plan: Agent-Generated Tooling Loop

## Metadata
- Date: 2026-02-13
- Author: Factorial Agent
- Related issue/PR: BK-021
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior: Humans manually author all 30+ scripts in the `scripts/` directory. When patterns emerge during code reviews (e.g., "this is the 5th time I've asked for deterministic date formatting"), humans recognize the pattern, file a ticket, and eventually hand-craft a tool to enforce the pattern.
- Target behavior: Agents recognize recurring patterns during code review, generate tooling automatically, and humans review the tool (not each violation). Learning from OpenAI's experience: humans review the linter, not the violations it finds.
- Why this change is needed: Currently, pattern recognition and tool creation is a bottleneck that requires human attention. By shifting to agent-generated tooling, we can scale enforcement of code quality patterns without scaling human review burden. This aligns with Factorial's goal of full autonomy.

## Codebase Research

| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Script patterns | `scripts/*.js` (32 scripts) | Parse args, read files, evaluate checks, build report, exit with code | Common structure: parseArgs() → read inputs → evaluate checks → build structured report → write JSON + exit code |
| Claims audit | `scripts/claims-consistency-audit.js` | Parse docs → detect drift → report with `checkResult()` pattern | Uses `evaluateChecks()` returning array of check objects with `id`, `status`, `summary`, `evidence`, `details` |
| Confidence publish | `scripts/confidence-tune-publish.js` | Aggregate artifacts → emit recommendations | Walks log directories, aggregates `confidence_result.json` files, publishes recommendations only (no auto-apply) |
| Docs freshness | `scripts/docs-freshness-audit.js` | Cross-doc validation helper | Validates AGENTS.md commands match package.json scripts and README docs; line count budgets |
| PR compound check | `scripts/check-pr-compound-artifacts.js` | Validate PR body structure | Simple validation that plan/review/compound artifacts are present with consensus lock decision |
| Review template | `docs/templates/review.md` | Structured review findings | Max 5 high-impact issues per explore phase; explicit verification table with `pass/fail` per issue |
| Plan template | `docs/templates/plan.md` | Plan artifact structure | Standard sections: Metadata, Behavior Delta, Research, Design, Invariants, Checklist |
| Compound template | `docs/templates/compound.md` | Solution documentation | Pattern recording for reuse in `docs/solutions/*.md` |

## External Constraints
- API/provider constraints: Generated tools must work deterministically without requiring external API calls during CI execution (unless explicitly designed as provider-backed checks)
- Runtime/environment constraints: All generated tools must be Node.js ESM scripts compatible with the existing scripts/ infrastructure; must run in CI without special permissions
- Backward compatibility constraints: New generated tools must not break existing npm scripts or CI workflows; must follow existing CLI conventions (`--report`, `--json`, exit codes)

## Design Outline

### Proposed Approach

1. **Template Structure** (`docs/templates/tool.md`): Standard template for tool generation requests including:
   - Pattern observed (with examples)
   - Expected behavior of the tool
   - Input/output contracts
   - Integration points (npm scripts, CI)
   - Human review checklist

2. **Trigger Mechanism**: Agent recognizes a pattern worth tooling when:
   - Same feedback given 3+ times in review cycle
   - Pattern is deterministic (can be programmatically detected)
   - Pattern is high-impact (reliability, security, correctness)
   - Human confirms via prompt: "This looks like a recurring pattern. Generate a tool?"

3. **Workflow**:
   ```
   Pattern observed in review → Generate tool request (docs/templates/tool.md)
   → Human reviews tool request → Agent generates tool script
   → Human reviews the generated tool → Tool deployed to scripts/
   → Tool added to npm scripts → Tool runs in CI
   → Tool enforces pattern automatically
   ```

4. **Seed Examples**:
   - **Linter for deterministic date formatting**: Detect usage of `new Date()` without explicit timezone; enforce ISO-8601 with `Z` suffix or explicit offset
   - **Cross-doc validation helper**: Validate that code examples in README match actual CLI output (similar to docs-freshness-audit but generalized)
   - **Drift detection utility**: Monitor for when `AGENTS.md` commands drift from `package.json` scripts (extract common logic from docs-freshness-audit.js)

5. **Integration**:
   - Generated tools follow existing script patterns: parse args, evaluate checks, build report, exit non-zero on failure
   - Tools are registered in `package.json` scripts with `npm run tool:<name>` convention
   - CI runs all `tool:*` scripts as part of quality gate
   - Tools emit structured JSON reports to `logs/tools/<name>/report.json`

6. **Human Review Workflow** (OpenAI lesson applied):
   - Human reviews the tool code (not individual violations)
   - Human approves tool via PR review
   - Once merged, tool runs automatically and violations are enforced by CI
   - No human review of individual violations (the tool IS the review)

### Rejected Alternatives and Why

- **Auto-deployment without human review**: Rejected due to security risk. Generated tools could have bugs or malicious patterns. Human must review tool before it gains CI enforcement power.
- **Rule-based generation only**: Rejected because it limits agent creativity. Agents should recognize novel patterns, not just apply predefined rules.
- **Separate tooling repository**: Rejected to keep the feedback loop tight. Tools live in `scripts/` alongside existing automation.

### Affected Interfaces and Contracts

- New template: `docs/templates/tool.md`
- New directory: `logs/tools/` for tool reports
- npm scripts naming convention: `tool:*` prefix for generated tools
- Report schema: Tools emit reports following existing schema patterns with `schema_version`, `generated_at`, `summary`, `checks` array

## Edge Cases

- Edge case 1: **Tool conflicts with existing tool**: If generated tool overlaps with existing tool, human review must merge or deduplicate. Detection: Both tools fail on same file.
- Edge case 2: **Tool has false positives**: Tool incorrectly flags valid code. Mitigation: Tool must have `--fix` dry-run mode; human reviews sample of violations before enabling enforcement.
- Edge case 3: **Tool performance degrades CI**: Tool takes too long or uses too much memory. Mitigation: Tools must complete within 30 seconds on typical repo; CI timeout enforces this.
- Failure mode handling: Tool crashes → CI fails with non-zero exit code; report includes stack trace in `details` field.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| AGT-001 | Generated tools must be deterministic | Tool produces same output on same input; no randomness, no external API calls unless mocked | Run tool twice on same repo state; compare report hashes |
| AGT-002 | Generated tools must not skip security gates | Tool runs in CI after existing security checks; cannot bypass required reviews | CI workflow enforces order: security checks → tool checks → deploy |
| AGT-003 | Generated tools must not modify source code without explicit --fix flag | Default mode is read-only; modifications require explicit opt-in | Test that tool without --fix does not write any files |
| AGT-004 | Generated tools must validate all inputs | No shell injection via file paths; sanitize all user-provided paths | Static analysis + unit tests with malicious inputs |
| AGT-005 | Generated tools must not expose secrets | No logging of environment variables or file contents that may contain secrets | Code review + grep for process.env access patterns |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: AGT-001, AGT-002, AGT-003
- Implementer scope statement (batch-limited): Implement the tool template structure and the three seed example tools (date linter, cross-doc validator, drift detector). Do not implement the trigger mechanism or automated generation in this batch.
- Verifier scope statement (batch-only): Verify that the three seed tools follow the template, emit correct report schemas, integrate with npm scripts, and pass all invariants.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
