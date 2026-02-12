# Plan: BK-008 Release Hardening Gates (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-008`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - Release workflow (`.github/workflows/release.yml`) runs quality checks, build, dry-run pack, and `npm publish --provenance`, but there is no deterministic repository gate that validates SBOM/signing/provenance policy before release.
  - No stable release-hardening evidence artifact is generated/published in-repo.
- Target behavior:
  - Add deterministic release-hardening gate command that generates SBOM evidence, produces artifact signature evidence, and verifies provenance policy constraints.
  - Enforce release hardening in CI and release workflow so pipeline fails closed when hardening requirements are missing/invalid.
  - Publish reproducible release hardening evidence artifact(s) and link them in roadmap/process docs.
- Why this change is needed:
  - `BK-008` is the next active backlog item and is required before higher-confidence release/promotion claims.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Release workflow | `.github/workflows/release.yml`, `RELEASE.md` | Performs lint/typecheck/tests/build and publishes with provenance | Missing deterministic SBOM/signature/provenance verification gate command and artifacts |
| CI policy hooks | `.github/workflows/ci.yml` | No dedicated release hardening gate job | Add non-tag CI gate for release hardening policy drift |
| Self-host maturity / promotion policy context | `scripts/self-host-maturity.js`, `docs/self-hosting-maturity-ladder.md` | Staged maturity gates exist (`DL-*`, `PB-*`, `AU-*`) | BK-008 focuses release hardening policy; keep deterministic-local maturity gate intact |
| Scripts/tooling | `scripts/*.js`, `package.json` | No `release:hardening` command | Add deterministic script + npm command |
| Evidence docs | `ROADMAP.md`, `docs/roadmap/*.md`, `docs/solutions/*.md` | BK-008 still backlog-open | Close with plan/review/solution/completion references |

## External Constraints
- Runtime/environment constraints:
  - Must remain deterministic in CI and local execution, without requiring interactive tooling.
- Security constraints:
  - Signing checks must fail closed when required key/config is absent in release context.
- Backward compatibility constraints:
  - Do not weaken existing `self-host:maturity -- --require-level deterministic-local` CI requirement.

## Design Outline
- Proposed approach:
  - Add `scripts/release-hardening.js` command that:
    - generates SBOM artifact from lockfile/package metadata into deterministic JSON,
    - computes artifact digest + signature evidence for release tarball,
    - verifies provenance-policy requirements by asserting `npm publish --provenance` and required workflow permissions in `release.yml`,
    - writes report contract `release_hardening_report.v1` under `docs/metrics/reports/release-hardening-latest.json` (or explicit output path).
  - Add npm command: `npm run release:hardening`.
  - Add tests validating report schema and fail-closed behavior for missing signing key/provenance policy mismatch.
  - Integrate gate command in:
    - CI (new job `release-hardening`),
    - release workflow (must pass prior to publish step).
  - Update `RELEASE.md`, `README.md`, and `ROADMAP.md` with hardening command and evidence references.
- Rejected alternatives and why:
  - Rely only on release workflow ad-hoc steps without a reusable script: rejected; difficult to validate deterministically in CI and tests.
  - External signing/SBOM services as required runtime dependency: rejected for deterministic local/CI friendliness.
- Affected interfaces and contracts:
  - New report contract: `release_hardening_report.v1`.
  - New command path: `npm run release:hardening`.
  - CI/release workflow policy gates for hardening enforcement.

## Edge Cases
- Edge case 1:
  - Missing signing key in strict mode should fail with explicit diagnostics.
- Edge case 2:
  - Workflow drift (e.g., removed `--provenance`) must fail policy verification deterministically.
- Failure mode handling:
  - Script writes report with failing check statuses when possible, then exits non-zero.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK008-INV-01 | Releases are blocked when provenance policy is weakened | Verify release workflow includes required permissions and `npm publish --provenance` | Failing policy test/script run exits non-zero |
| BK008-INV-02 | Artifact signing evidence is generated deterministically and validated | Compute stable digest/signature metadata in report contract and enforce strict key requirement in release context | Unit/integration test + CI/release gate execution |
| BK008-INV-03 | SBOM evidence is always emitted for gated release hardening runs | Generate deterministic SBOM artifact and reference in report | Report schema/tests and command output validation |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK008-01` Add deterministic release-hardening script/report contract (`release_hardening_report.v1`) with SBOM + signing + provenance checks.
  - `BK008-02` Add CI and release-workflow enforcement for release hardening gates.
  - `BK008-03` Add/refresh deterministic tests for release hardening schema and fail-closed behavior.
  - `BK008-04` Converge docs/roadmap artifacts and completion references for BK-008 closure.
- Implementer scope statement (batch-limited):
  - Implement only `BK008-01` through `BK008-04` for release hardening gates and documentation convergence.
- Verifier scope statement (batch-only):
  - Verify only `BK008-01` through `BK008-04` with pass/fail evidence; do not introduce new issue IDs in verification.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
