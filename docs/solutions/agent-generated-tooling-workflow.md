---
title: "Agent-Generated Tooling Workflow"
category: "process"
tags:
  - "agent-tooling"
  - "code-generation"
  - "pattern-recognition"
  - "automation"
date: "2026-02-13"
trigger: "BK-021 required scaling code quality enforcement via agent-generated tooling"
---

# Problem
Humans write all tooling; recurring patterns in review aren't automated. Code review repeatedly identifies the same pattern violations (date formatting, broken links, drift from golden patterns), but tooling lags behind because humans must write and maintain each tool.

# Solution Pattern
Agents generate tools from recognized patterns; humans review tool code, not violations. Based on OpenAI's experience: review the linter, not the violations it finds.

## Tool Generation Workflow
1. **Pattern Recognition**: Agent identifies recurring pattern worth tooling
2. **Request Creation**: Fill out `docs/templates/tool.md` with pattern details
3. **Human Review**: Human reviews and approves tool request
4. **Tool Generation**: Run `npm run tool:generate -- --name <tool-name>`
5. **Implementation**: Customize generated scaffold with detection logic
6. **Validation**: Run tool locally: `npm run tool:<name>`
7. **CI Integration**: Add to `.github/workflows/ci.yml`
8. **Deployment**: Once merged, tool runs automatically in CI

## Security Invariants (AGT-001 through AGT-005)
All generated tools must enforce:

| ID | Invariant | Verification |
| --- | --- | --- |
| AGT-001 | Deterministic output | Run twice, compare hashes |
| AGT-002 | Run after security gates | CI workflow order |
| AGT-003 | Read-only by default | `--fix` flag required for writes |
| AGT-004 | Input validation | Test with malicious inputs |
| AGT-005 | No secrets exposure | Code review for `process.env` access |

## Seed Examples (Reference Tools)
1. **date-linter** - Detects `new Date()` without explicit timezone
2. **cross-doc-validator** - Validates internal documentation links
3. **drift-detector** - Compares code against golden patterns

## Tool Output Contract
```typescript
{
  schema_version: 'tool_<name>_report.v1',
  generated_at: string,
  summary: {
    overall_status: 'pass' | 'fail',
    failed_check_ids: string[],
    files_scanned: number,
    violations_found: number
  },
  findings: [{
    check_id: string,
    file: string,
    line: number,
    message: string,
    severity: 'error' | 'warning'
  }]
}
```

# Key Insight
**Review the linter, not the violations.** Once a tool is merged and enabled, violations are enforced automatically without human review. The human's job is to review the tool's logic once, then let the tool do the repetitive work forever. This scales pattern enforcement without scaling human review time.

# Implementation References
- Files touched:
  - `docs/templates/tool.md` (tool request template)
  - `scripts/tool-generate.js` (scaffold generator)
  - `scripts/generated/date-linter.js` (seed example)
  - `scripts/generated/cross-doc-validator.js` (seed example)
  - `scripts/generated/drift-detector.js` (seed example)
  - `AGENTS.md` (workflow documentation)
- Tests added/updated:
  - `packages/cli/src/tool-generate.test.ts`
  - Individual tool tests in `scripts/generated/*.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-021-agent-generated-tooling-loop.md`
  - `docs/reviews/bk-021-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - Tool generation template created with complete structure
  - Three seed tools execute successfully and produce valid JSON reports
  - All five security invariants (AGT-001 through AGT-005) satisfied
  - Tools run with `--json` flag and write to `logs/tools/<name>/report.json`
  - Read-only by default verified (all tools require `--fix` for writes)
- What validated reliability over time:
  - `npm run tool:date-lint` (12 violations detected in scripts/)
  - `npm run tool:cross-doc-validate` (291 links validated across 199 files)
  - `npm run tool:drift-check` (0 violations in generated tools)
  - `npm run lint`
  - `npm run typecheck`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern
- Update location:
  - `AGENTS.md` "Agent-Generated Tooling Workflow" section added (lines 153+)
  - Security invariants table documented
  - Available commands listed (`npm run tool:*`)

# Reuse Guidance
- When to apply this pattern:
  - Recurring pattern violations identified in code review
  - Pattern can be detected mechanically (regex, AST parsing)
  - Tool output can be structured JSON for CI consumption
  - Team willing to review tool code once rather than violations repeatedly
- When not to apply:
  - One-off pattern that won't recur
  - Pattern requires semantic understanding beyond mechanical detection
  - Tool would require external API dependencies (network fragility)
  - Violations require human judgment to classify
- Known tradeoffs:
  - Tool generation requires upfront investment in template and workflow
  - Generated tools need maintenance as codebase evolves
  - False positives require tool updates (not violation-by-violation suppression)
  - Tool approval is a bottleneck (human review required before deployment)
