# AGENTS.md

## Project Overview
Factorial is a DOT-based workflow runner for multi-stage AI pipelines.
The system is core-preserving: reliability and operating model improvements should not rewrite the graph
execution engine.

## Stack
- TypeScript (Node.js, ESM)
- Vitest for tests
- Biome for linting
- Graph workflows defined in DOT

## Core Commands
- `npm install`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run test:golden`
- `npm run agent:audit`
- `npm run check:pr-compound`
- `npm run metrics:compound-weekly -- --start YYYY-MM-DD --end YYYY-MM-DD`
- `npm run reliability:slo -- --report docs/metrics/reports/compound-reliability-slo-latest.json`
- `npm run self-host:maturity -- --require-level deterministic-local`
- `npm run self-host:provider-backed`
- `npm run self-host:flake -- --replay-count 2 --min-pass-rate 1 --report docs/metrics/reports/self-host-flake-latest.json`
- `npm run self-host:unattended-telemetry -- --source docs/metrics/reports/self-host-unattended-telemetry-source-latest.json --report docs/metrics/reports/self-host-unattended-telemetry-latest.json`
- `npm run docs:freshness -- --report logs/docs_freshness/report.json`
- `npm run golden:audit` - Run golden principles audit (fails on errors)
- `npm run golden:fix` - Apply automated fixes for golden principles violations
- `npm run release:hardening -- --strict-signing --signing-key-env RELEASE_SIGNING_KEY`

## Mandatory Engineering Loop (Feature Work)
1. Create a plan artifact from `docs/templates/plan.md`.
2. Implement changes scoped to selected issue IDs.
3. Produce structured review findings using `docs/templates/review.md`.
4. Synthesize a bounded issue batch (high-impact items only).
5. Verify selected issue IDs only, with `pass|fail` evidence per issue.
6. Apply consensus lock decision (`resolved` or `reopen`).
7. Record reusable learning in `docs/solutions/*.md` using `docs/templates/compound.md`.
8. Update this file when a new reusable pattern should become default guidance.

Ratchet rule: no new critique is added until the active batch reaches `resolved`.

## Conventions
- Keep changes deterministic and CI-friendly.
- Follow [Golden Principles](docs/golden-principles.md) for code quality patterns. Automated enforcement runs via `npm run golden:audit`.
- Prefer strict schemas and explicit pass/fail routing for workflow quality controls.
- For PR-bound feature work, ensure the PR body passes `npm run check:pr-compound` (plan/review/compound links + lock decision + ratchet reference).
- Publish one weekly compound metrics report under `docs/metrics/reports/` using `npm run metrics:compound-weekly`.
- For reliability SLO claims, require `npm run reliability:slo` to publish `compound_reliability_slo_report.v1` and enforce fail-closed `consensus_lock_decision` (`resolved|reopen`) from explicit thresholds.
- For self-hosting maturity claims, keep `docs/self-hosting-maturity-ladder.md` current and require `npm run self-host:maturity -- --require-level deterministic-local` to stay green in CI.
- Current declared self-hosting level is `full-autonomy`; keep `deterministic-local` as the CI floor and publish provider-backed evidence with `npm run self-host:provider-backed`.
- For deterministic verification hardening claims, require `npm run self-host:flake` to publish `self_host_flake_report.v1` and fail CI when required-suite replay pass-rate falls below threshold.
- For command-surface or backlog-direction documentation changes, require `npm run docs:freshness` to publish `docs_freshness_report.v1` and fail closed on drift.
- Keep `ROADMAP.md` compact by moving historical detail into `docs/roadmap/archive/` and updating `docs/roadmap/active-handoff.md` for active-session context.
- For CLI/e2e suites that invoke build + CLI commands, use deterministic shared prebuild and suite-scoped temp/log isolation helpers instead of per-suite ad-hoc build/temp wiring.
- For release hardening claims, require `npm run release:hardening` evidence artifacts (SBOM/signature/provenance policy checks) to pass in CI/release workflows.
- Current backlog direction is `none` (the active `BK-*` queue is empty in the current roadmap snapshot).
- Treat active `BK-*` items in `ROADMAP.md` as the execution scope; historical PRDs are reference context unless explicitly reactivated in the roadmap.
- For conformance/maturity claim changes, update `ROADMAP.md`, `docs/spec-conformance-matrix.md`, `docs/companion-spec-scope-contract.md`, and `docs/self-hosting-maturity-ladder.md` in the same batch.
- For full-autonomy promotions, synchronize claim-bearing docs first and re-run `npm run claims:audit` before updating evidence freshness or handoff queues.
- For new runtime adapters (including DTU work), define contract schema + in-memory boundary + fixture parity checks before adding external integration layers.
- For codergen/provider work, keep handler orchestration backend-agnostic by routing provider execution through `packages/core/src/llm/` adapter contracts (`complete`/`stream`).
- Use file and line references for review findings.
- Prioritize reliability, security, correctness, and major performance issues over style.

## CI Tier Selection Rules

Factorial uses a three-tier CI system to balance velocity and reliability:

### Tier 1: Fast-Track (~8-12 minutes)
**Use for:** Small, low-risk changes that don't touch security-critical code

**Qualification criteria:**
- Diff size: <50 lines changed
- No security-critical files modified (CI workflows, auth, crypto, secrets)
- 100% coverage on changed lines
- Low risk level in plan.md

**Required gates:** lint, typecheck, test:run (Node 20), coverage on changed lines, worktree parity
**Skipped gates:** DTU harness, golden regression, maturity gates, flake replay, heavy validation

**How to request:**
1. Add `ci_tier: fast` to plan.md metadata
2. Or add PR label `tier:fast` or `fast-track`
3. Automated detection for docs-only changes

### Tier 2: Standard-Track (~90-100 minutes)
**Use for:** Medium/high-risk changes, >50 lines, security-critical files

**Qualification criteria:**
- Default for all PRs
- Any security-critical files modified
- Diff size ≥50 lines
- Medium or high risk level

**Required gates:** Full CI matrix (all 12+ jobs)
**How to request:** Default - no action needed

### Tier 3: Emergency-Fix (~5-8 minutes)
**Use for:** Production hotfixes requiring immediate deployment

**Qualification criteria:**
- Branch name pattern: `hotfix/*` or `emergency/*`
- Or PR label: `emergency-fix`
- Or plan.md: `ci_tier: emergency`

**Required gates:** lint, typecheck, test:run (Node 20)
**Post-merge requirements:**
- Automatic tracking issue created
- 2-hour revert window monitoring
- Post-merge review required within 24 hours

**How to request:**
1. Push to `hotfix/` or `emergency/` branch
2. Or add PR label `emergency-fix`
3. Or declare `ci_tier: emergency` in plan.md

### Tier Selection Priority
1. **Emergency** - Always wins if any signal indicates emergency
2. **Security files** - Any `.github/workflows/`, `**/auth/`, `**/crypto/`, etc. → Standard
3. **Plan.md metadata** - Explicit `ci_tier` field
4. **PR labels** - `tier:fast`, `tier:emergency`
5. **Automated analysis** - Line count, file patterns
6. **Default** - Standard track

### Important Invariants
- **Lint and typecheck are NEVER skipped** in any tier
- **Security-critical files NEVER qualify for fast-track**
- **Tier classifier is deterministic** - same inputs always produce same tier
- **All tier selections are auditable** - reasoning stored in PR comments

## Common Mistakes
- Introducing new findings during batch verification.
- Mixing in style-only feedback during convergence batches.
- Leaving high-risk changes without explicit invariants in the plan.
- Creating solution docs without linking affected files/tests and trigger context.
- Treating a historical PRD as active scope when roadmap handoff points elsewhere.
- Updating one claim document without synchronizing the related claim set.

## Agent-Generated Tooling Workflow

Factorial uses agent-generated tools to scale code quality enforcement. Based on OpenAI's experience: humans review the linter, not the violations it finds.

### Tool Generation Process

1. **Pattern Recognition** - Agent identifies recurring patterns worth tooling
2. **Request Creation** - Fill out `docs/templates/tool.md` with pattern details
3. **Human Review** - Human reviews and approves tool request
4. **Tool Generation** - Run `npm run tool:generate -- --name <tool-name>`
5. **Implementation** - Customize generated scaffold with detection logic
6. **Validation** - Run tool locally: `npm run tool:<name>`
7. **CI Integration** - Add to `.github/workflows/ci.yml` (if not already automated)
8. **Deployment** - Once merged, tool runs automatically in CI

### Available Commands

- `npm run tool:generate -- --name <tool-name>` - Generate new tool scaffold
- `npm run tool:list` - List all generated tools
- `npm run tool:lint` - Lint generated tools directory
- `npm run tool:date-lint` - Enforce deterministic date formatting
- `npm run tool:cross-doc-validate` - Check for broken internal links
- `npm run tool:drift-check` - Compare code against golden patterns

### Security Invariants (AGT-*)

All generated tools must enforce these invariants:

| ID | Invariant | Verification |
| --- | --- | --- |
| AGT-001 | Deterministic output | Run twice, compare hashes |
| AGT-002 | Run after security gates | CI workflow order |
| AGT-003 | Read-only by default | `--fix` flag required for writes |
| AGT-004 | Input validation | Test with malicious inputs |
| AGT-005 | No secrets exposure | Code review for `process.env` access |

### Tool Location

- Templates: `docs/templates/tool.md`
- Generated tools: `scripts/generated/`
- Tool logs: `logs/tools/<tool-name>/report.json`
- npm scripts: `tool:*` prefix

### Seed Examples

Three reference tools are included:
1. **date-linter** - Detects `new Date()` without explicit timezone
2. **cross-doc-validator** - Validates internal documentation links
3. **drift-detector** - Compares code against golden patterns

## Golden Principles and Automated Pattern Enforcement

Factorial encodes recurring code quality patterns as machine-readable "golden principles" with automated detection and fix PRs. This prevents "AI slop" accumulation through continuous automated cleanup rather than manual debt paydown.

### Available Principles

| ID | Principle | Severity | Auto-fixable |
| --- | --- | --- | --- |
| GP-001 | Prefer shared test harness utilities over hand-rolled helpers | warning | Yes |
| GP-002 | Solution docs must link affected files and tests | warning | No |
| GP-003 | Validate all external API boundary contracts | error | No |

### Commands

- `npm run golden:audit` - Scan codebase for principle violations
- `npm run golden:fix` - Apply auto-fixable violations
- `npm run golden:cleanup` - Weekly cleanup with PR creation

### Report Schema

Violations are reported to `logs/golden-principles/report.json` with:
- Principle ID, severity, file, line, context
- Fix suggestions for auto-fixable violations
- Support for `// golden-ignore: GP-XXX <reason>` comments

### When to Add New Principles

1. Pattern observed 3+ times in code review
2. Pattern has clear detection criteria (regex/AST)
3. Pattern improves codebase legibility for agents
4. Human approves principle addition via plan/review/compound

## Reference Docs
- Active execution source of truth: `docs/roadmap/active-handoff.md` (compact start point) + `ROADMAP.md` (canonical status/board)
- Historical PRD (implemented baseline): `docs/plans/rmd-020-subagent-orchestration-prd.md`
- When to update this section:
  - Update "Active execution source of truth" whenever the primary planning/execution entrypoint changes.
  - Update "Historical PRD" only when a different PRD becomes the implemented baseline.
- Templates:
  - `docs/templates/plan.md`
  - `docs/templates/review.md`
  - `docs/templates/compound.md`
  - `docs/templates/tool.md`
- Knowledge base:
  - `docs/solutions/README.md`
  - `docs/solutions/*.md`
- Metrics:
  - `docs/metrics/compound-rate.md`
