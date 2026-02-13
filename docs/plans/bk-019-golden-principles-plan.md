# Plan: Golden Principles and Automated Pattern Enforcement

## Metadata
- Date: 2026-02-13
- Author: Agent
- Related issue/PR: BK-019
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior: Recurring code review patterns (e.g., "use shared utilities over hand-rolled helpers", "validate external API boundaries") are discovered during human review, documented in solution docs, but rely on human vigilance to prevent recurrence. This leads to "AI slop" - repeated similar mistakes across batches.
- Target behavior: High-impact patterns from solutions docs are encoded as machine-readable "golden principles" with automated detection via static analysis and periodic cleanup PRs. Principles are enforced through CI with human-reviewed exceptions.
- Why this change is needed: Prevents repeated review cycles for the same pattern violations; aligns with OpenAI harness engineering approach of automated cleanup to reduce cognitive overhead and improve codebase consistency.

## Codebase Research

| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Solution docs | `docs/solutions/*.md` (45+ files) | Capture recurring patterns post-hoc; no automated enforcement | Rich source of patterns: worktree isolation, deterministic verification, docs freshness, claims consistency, compound metrics |
| Lint infrastructure | `packages/core/src/lint/index.ts`, `index.test.ts` | Rule-based graph validation with Diagnostic interface (error/warning/info) | 25+ rules for DOT workflow validation; extensible `LintRule` interface |
| Audit scripts | `scripts/claims-consistency-audit.js`, `scripts/docs-freshness-audit.js` | Parse markdown/JSON, enforce cross-doc invariants, publish reports | Pattern: read source docs → evaluate checks → build report → exit non-zero on failure |
| CI workflows | `.github/workflows/ci.yml`, `weekly-evidence-refresh.yml` | Daily CI checks, weekly scheduled jobs | Can add weekly golden-cleanup scheduled job |
| Quality gates | `npm run lint`, `npm run typecheck`, `npm run test:golden` | Deterministic verification suite | New principles should integrate with existing gate structure |
| AGENTS.md conventions | `AGENTS.md` section "Common Mistakes" | Static list of mistakes | Should reference golden principles doc dynamically |

## External Constraints
- API/provider constraints: N/A (local static analysis only)
- Runtime/environment constraints: Must work in CI (GitHub Actions) with Node.js 20+
- Backward compatibility constraints: Existing solution docs remain as-is; new `docs/golden-principles.md` is additive; no breaking changes to lint API

## Design Outline

### Proposed Approach

1. **Create Golden Principles Registry** (`docs/golden-principles.md`)
   - Machine-readable YAML frontmatter + human-readable explanation
   - Each principle has: ID, severity (error/warning/info), category, detection strategy, fix strategy, example violations

2. **Implement Detection Engine** (`scripts/golden-principles-audit.js`)
   - AST-based and regex-based detection for TypeScript/JavaScript/Markdown
   - Reads principles registry, scans codebase, produces `golden_principles_report.v1`
   - Exit non-zero on error-level violations

3. **Example Principles to Start** (3 principles):

   **GP-001: Prefer Shared Test Harness Utilities**
   - **Detection**: Find `beforeAll`/`beforeEach` blocks in test files that manually configure temp dirs, builds, or worktrees (pattern: `mkdir.*temp`, `execa.*build`, `mkdtemp`)
   - **Fix**: Replace with ` DeterministicTestHarness` from `packages/cli/src/test-harness.ts`
   - **Auto-fixable**: Yes, with structured replacement
   - **Evidence**: `docs/solutions/deterministic-cli-suite-isolation-and-flake-replay-gate.md`

   **GP-002: Solution Docs Must Link Affected Files**
   - **Detection**: Parse `docs/solutions/*.md` frontmatter; verify `implementation_references.files` array has ≥1 entry
   - **Fix**: Report missing file references; require manual fix (needs human judgment)
   - **Auto-fixable**: No (requires human review)
   - **Evidence**: `docs/solutions/README.md` quality bar

   **GP-003: Validate External API Boundary Contracts**
   - **Detection**: Find handler implementations without explicit input validation (Zod schemas, type guards) for external-facing handlers
   - **Fix**: Add Zod schema validation at handler entry points
   - **Auto-fixable**: No (requires domain knowledge)
   - **Evidence**: `docs/solutions/companion-spec-scope-contract-and-claims-policy.md`

4. **Weekly Cleanup Automation** (`.github/workflows/golden-cleanup.yml`)
   - Scheduled weekly (Sundays 02:00 UTC)
   - Runs detection engine
   - Auto-fixes principles marked `auto_fixable: true`
   - Creates PR with fixes + report summary
   - Human review required for merge

5. **CI Integration**
   - Add `npm run golden:audit` script (fails on error-level violations)
   - Run in CI on PRs (diff-only mode for performance)
   - Weekly full scan in scheduled job

6. **Documentation Updates**
   - Link `docs/golden-principles.md` from `AGENTS.md` conventions
   - Update `docs/solutions/README.md` to mention principles as "active enforcement"

### Rejected Alternatives and Why

- **Biome/ESLint custom rules**: Rejected - principles span beyond syntax (markdown structure, cross-file patterns) and we want principle definitions to live in markdown for human review
- **Fully automated fixes without human review**: Rejected - medium risk; some fixes require domain knowledge even when mechanically possible
- **Git hooks**: Rejected - slows local dev; CI enforcement is sufficient

### Affected Interfaces and Contracts

- New file: `docs/golden-principles.md` (principle registry)
- New file: `scripts/golden-principles-audit.js` (detection engine)
- New file: `.github/workflows/golden-cleanup.yml` (cleanup automation)
- New npm script: `golden:audit` (package.json)
- Modified: `AGENTS.md` (conventions section)
- New report schema: `golden_principles_report.v1`

## Edge Cases

- **Edge case 1**: Principle detection false positives on intentionally hand-rolled code
  - **Handling**: Allow inline ignore comments (`// golden-ignore: GP-001`) with mandatory justification
  - **Reporting**: Track ignore frequency per principle; high frequency triggers principle revision

- **Edge case 2**: Auto-fix produces invalid TypeScript
  - **Handling**: Auto-fix PRs must pass `npm run typecheck` and `npm run test:run` before being marked ready
  - **CI gate**: Auto-fix workflow runs full verification suite

- **Edge case 3**: Principle conflicts (e.g., two principles suggest opposite fixes)
  - **Handling**: Principles have priority weights; lower weight principle yields; conflict reported in audit output

- **Edge case 4**: Large codebase causes audit to timeout in CI
  - **Handling**: Diff-only mode for PR checks (scan changed files only); full scan only in weekly job

- **Failure mode handling**: If audit script crashes, CI fails open (reports error but doesn't block merge) to prevent CI paralysis; weekly job reports crash to maintainers

## High-Risk Invariants (Required for security, money, data integrity, concurrency)

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| N/A | No security/money/data integrity/concurrency risk in this feature | Static analysis only reads files; no code execution | Code review of audit script confirms no `eval`, `exec`, or network calls |

**Reason**: This is a static analysis and documentation feature. The audit script only reads files and produces reports. Auto-fixes are submitted as PRs requiring human review before merge. No runtime behavior changes.

## Validation Checklist
- [ ] Unit/integration tests for detection engine (test files in `tests/fixtures/golden-principles/`)
- [ ] Biome lint passes
- [ ] TypeScript typecheck passes
- [ ] Golden/regression tests pass (`npm run test:golden`)
- [ ] Manual test: `npm run golden:audit` produces valid report
- [ ] Manual test: Weekly workflow dry-run succeeds
- [ ] Documentation: `docs/golden-principles.md` created and linked
- [ ] AGENTS.md conventions updated with principles reference

## Convergence Setup
- Initial issue batch target IDs: BK-019
- Implementer scope statement (batch-limited): Create principle registry with 3 example principles, detection engine, weekly cleanup workflow, CI integration
- Verifier scope statement (batch-only): Verify principles detect real violations in codebase; verify auto-fixes produce valid code; verify CI integration works
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
