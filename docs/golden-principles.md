---
schema_version: golden_principles.v1
generated_at: 2026-02-13
---

# Golden Principles

Machine-readable code quality principles with automated detection and enforcement.

## Overview

Golden principles encode high-impact patterns from solution docs as enforceable rules. They are automatically checked via static analysis and can be auto-fixed where safe.

## Schema

Each principle follows this structure:

```yaml
id: GP-XXX                    # Unique identifier
severity: error|warning|info  # Enforcement level
category: string              # Classification for grouping
detection:
  strategy: regex|ast|markdown
  patterns: string[]          # Detection patterns
  file_globs: string[]        # Files to scan
  ignore_comments: string[]   # Inline ignore patterns
fix:
  auto_fixable: boolean       # Whether safe to auto-fix
  replacement: string|null    # Fix template (if applicable)
  requires_human_review: boolean
evidence:
  solution_doc: string        # Source solution doc
  example_violations: string[]
```

## Principles

### GP-001: Prefer Shared Test Harness Utilities

**Severity:** `warning`

**Category:** `testing`

**Description:** Test files should use the shared deterministic test harness (`createSuiteIsolation`, `ensureDeterministicCliBuild`) instead of manually configuring temp directories or builds.

**Detection:**
- Strategy: `regex`
- File globs: `**/*.test.ts`, `**/*.spec.ts`
- Patterns:
  - `mkdtemp` - Direct mkdtemp usage in tests
  - `execa.*build` - Manual build invocation
  - `spawn.*npm.*run.*build` - Manual npm build
- Ignore patterns:
  - `// golden-ignore: GP-001`

**Fix:**
- Auto-fixable: `true`
- Replacement: Use `import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js'`
- Requires human review: `false` (mechanical replacement)

**Evidence:**
- Solution doc: `docs/solutions/deterministic-cli-suite-isolation-and-flake-replay-gate.md`
- Example violations:
  - `const tmpDir = await mkdtemp(join(os.tmpdir(), 'test-'));`
  - `await execa('npm', ['run', 'build']);`

---

### GP-002: Solution Docs Must Link Affected Files

**Severity:** `error`

**Category:** `documentation`

**Description:** All solution documents must include an `implementation_references.files` array in their frontmatter or body with at least one file reference.

**Detection:**
- Strategy: `regex`
- File globs: `docs/solutions/*.md`
- Patterns:
  - `Files touched:`
  - `Implementation References`

**Fix:**
- Auto-fixable: `false`
- Requires human review: `true` (requires human judgment to identify affected files)

**Evidence:**
- Solution doc: `docs/solutions/README.md`
- Example violations:
  - Solution doc without `## Implementation References` section
  - Solution doc with empty files list

---

### GP-003: Validate External API Boundary Contracts

**Severity:** `warning`

**Category:** `security`

**Description:** External-facing handlers (HTTP endpoints, webhook handlers, CLI commands) must validate inputs using explicit schemas (Zod, type guards) before processing.

**Detection:**
- Strategy: `regex`
- File globs: `packages/**/src/handlers/*.ts`, `packages/**/src/server/*.ts`, `tests/fixtures/golden-principles/gp-003*.ts`
- Patterns:
  - `req\.body` - Destructuring request body without validation
  - `request\.body` - Alternative request body access
- Ignore patterns:
  - `// golden-ignore: GP-003`

**Fix:**
- Auto-fixable: `false`
- Requires human review: `true` (requires domain knowledge to define proper schema)

**Evidence:**
- Solution doc: `docs/solutions/companion-spec-scope-contract-and-claims-policy.md`
- Example violations:
  - Handler that directly destructures request body without validation
  - CLI command that parses args without schema validation

---

## Ignore Comments

To suppress a principle violation, add an inline comment with justification:

```typescript
// golden-ignore: GP-001 Intentionally hand-rolled for edge case testing
const tmpDir = await mkdtemp(join(os.tmpdir(), 'test-'));
```

Justification is mandatory. High ignore frequency for a principle triggers principle revision.

## Report Schema

Audit reports follow `golden_principles_report.v1`:

```json
{
  "schema_version": "golden_principles_report.v1",
  "generated_at": "ISO8601",
  "summary": {
    "overall_status": "pass|fail",
    "total_violations": 0,
    "principles_checked": ["GP-001", "GP-002", "GP-003"],
    "violation_counts": {
      "GP-001": 0,
      "GP-002": 0,
      "GP-003": 0
    }
  },
  "violations": [
    {
      "principle_id": "GP-001",
      "severity": "warning",
      "file": "relative/path/to/file.ts",
      "line": 42,
      "column": 10,
      "message": "Manual temp directory creation detected",
      "context": "const tmpDir = await mkdtemp...",
      "fixable": true,
      "suggested_fix": "Use createSuiteIsolation from test-harness"
    }
  ],
  "fixes_applied": [
    {
      "principle_id": "GP-001",
      "file": "relative/path/to/file.ts",
      "original": "...",
      "replacement": "..."
    }
  ]
}
```

## CI Integration

- **PR Checks:** Diff-only mode (scan changed files only)
- **Weekly Cleanup:** Full scan with auto-fix for safe principles
- **Exit Codes:**
  - `0` - All checks passed or only info/warning violations
  - `1` - Error-level violations found
  - `2` - Audit script failure (CI fails open)

## Commands

```bash
# Run audit (fails on errors)
npm run golden:audit

# Run audit with auto-fix (only for safe principles)
npm run golden:fix

# Run weekly cleanup with full scan
npm run golden:cleanup
```
