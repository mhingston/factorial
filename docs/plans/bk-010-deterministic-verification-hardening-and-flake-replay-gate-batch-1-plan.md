# Plan: BK-010 Deterministic Verification Hardening and Flake Replay Gate (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-010`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - Multiple CLI/e2e-focused suites (`e2e-smoke`, `self-host-dogfood`, `self-host-maturity`) invoke `npm run build` independently, which can overlap under parallel Vitest workers and mutate shared `dist/` artifacts.
  - Temp/log paths are mostly per-test `mkdtemp(...)` calls without a shared deterministic suite-level isolation contract.
  - There is no deterministic flake replay command/report contract for required suites and no CI gate for flake-threshold violations.
- Target behavior:
  - Introduce deterministic shared prebuild/isolation helpers for CLI/e2e suites so build outputs are prepared once and reused without concurrent rebuild races.
  - Introduce deterministic per-suite temp/log isolation helpers for tests that invoke CLI/build workflows.
  - Add `self_host_flake_report.v1` publication path with replay-count and pass-rate evidence for required suites.
  - Add CI hook that fails when required suite pass-rate falls below configured deterministic threshold.
- Why this change is needed:
  - `BK-010` is the active backlog item and is required to keep CI verdicts stable/reproducible before BK-011 streaming parity and BK-012 autonomous guardrails.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| CLI/e2e suite build usage | `packages/cli/src/e2e-smoke.test.ts`, `packages/cli/src/self-host-dogfood.test.ts`, `packages/cli/src/self-host-maturity.test.ts` | Each suite triggers build directly or invokes scripts that rebuild | Shared mutable `dist/` coupling risk under parallel workers |
| Self-host scripts | `scripts/self-host-dogfood.js`, `scripts/self-host-maturity.js` | Support build-skip env vars but test harness usage is inconsistent | Reuse skip toggles after deterministic prebuild |
| CI gate surface | `.github/workflows/ci.yml` | Has reliability/release/self-host maturity gates; no flake replay gate | Add dedicated flake job + artifact upload |
| Existing report contract pattern | `scripts/reliability-slo-gate.js`, `scripts/release-hardening.js` | Versioned schema + fail-closed exit behavior | Reuse for `self_host_flake_report.v1` |

## External Constraints
- Runtime/environment constraints:
  - Must run in local and CI Linux/macOS Node 20/22 without network requirements.
  - Flake replay must be deterministic and bounded by explicit replay count.
- Process constraints:
  - Implement only BK-010 scoped IDs in this batch.
  - Preserve ratchet rule (no new critique during verification).
- Backward compatibility constraints:
  - Existing commands (`test:run`, `self-host:maturity`, `reliability:slo`, golden tests) must remain compatible.

## Design Outline
- Proposed approach:
  - Add CLI/e2e test utility module that provides:
    - deterministic repository-root build readiness (single prebuild with filesystem lock/sentinel),
    - deterministic per-suite temp/log root allocation helpers,
    - shared subprocess runner helper for suite commands.
  - Refactor CLI/e2e suites that invoke build/CLI commands to use the helper and skip nested rebuilds when prebuild is already ensured.
  - Add `scripts/self-host-flake-replay.js` + npm command to replay required suites for `N` attempts and publish `self_host_flake_report.v1`.
  - Add CI `self-host-flake` hook that executes replay gate and uploads report artifact.
  - Document schema/command path in README/roadmap artifacts.
- Rejected alternatives and why:
  - Disabling Vitest parallelism globally: rejected because it masks race conditions and increases feedback latency.
  - Keeping per-suite independent rebuilds with no shared lock: rejected because it preserves nondeterministic `dist/` mutation risk.
- Affected interfaces and contracts:
  - New script/command: `npm run self-host:flake`.
  - New report schema: `self_host_flake_report.v1`.
  - CI contract: required suites must satisfy configured replay pass-rate threshold.

## Edge Cases
- Edge case 1:
  - Build lock stale/crashed writer path; helper must fail closed with actionable timeout/error rather than hanging indefinitely.
- Edge case 2:
  - Replay command run with invalid replay-count/threshold values; command must reject with explicit argument error.
- Failure mode handling:
  - Always write report artifact with per-suite attempt evidence and fail summary when execution reaches evaluation stage.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK010-INV-01 | CLI/e2e suites must not concurrently rebuild shared `dist/` artifacts | Shared deterministic prebuild helper with lock/sentinel semantics and build-skip env usage in suite invocations | Repeated `npm run test:run` runs remain stable for targeted suites |
| BK010-INV-02 | Suites invoking CLI/build paths must write temp/log artifacts under isolated per-suite roots | Centralized suite path helper used by affected tests | Test assertions still pass while writing under helper-managed roots |
| BK010-INV-03 | Flake replay decision must be deterministic for fixed inputs and threshold config | Versioned report schema + explicit pass-rate computation and fail-closed exit | Replay script tests cover pass/fail threshold behavior |
| BK010-INV-04 | CI must fail when required suites violate deterministic flake threshold | Dedicated CI job invoking replay command and enforcing non-zero on threshold violation | CI workflow includes flake gate job + artifact upload |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK010-01` Remove shared mutable build artifact coupling for CLI/e2e suites via deterministic prebuild helper and suite refactor.
  - `BK010-02` Add deterministic per-suite temp/log isolation helpers for test paths invoking CLI/build commands.
  - `BK010-03` Add deterministic flake replay command/report contract (`self_host_flake_report.v1`) with replay-count and pass-rate evidence.
  - `BK010-04` Add CI hook + docs convergence for deterministic flake-threshold enforcement and reproducible artifact publication.
- Implementer scope statement (batch-limited):
  - Implement only `BK010-01` through `BK010-04` for BK-010 batch 1.
- Verifier scope statement (batch-only):
  - Verify only `BK010-01` through `BK010-04` with pass/fail evidence; do not introduce new issue IDs in verification.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
