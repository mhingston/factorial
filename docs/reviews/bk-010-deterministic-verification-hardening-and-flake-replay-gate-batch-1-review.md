# Review: BK-010 Deterministic Verification Hardening and Flake Replay Gate (Batch 1)

## Metadata
- Date: 2026-02-12
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-010` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK010-01` | reliability | `P1` | `high` | `in-batch` | `packages/cli/src/test-harness.ts:65` | CLI/e2e-focused suites lacked deterministic single-prebuild coordination, allowing shared mutable `dist/` coupling under parallel test workers. |
| `BK010-02` | correctness | `P1` | `high` | `in-batch` | `packages/cli/src/e2e-smoke.test.ts:21` | CLI/build-invoking suites lacked a shared deterministic temp/log isolation contract, increasing cross-suite artifact collision risk. |
| `BK010-03` | operability | `P1` | `high` | `in-batch` | `scripts/self-host-flake-replay.js:1` | No deterministic flake replay command/report existed to quantify pass-rate stability over repeated required-suite runs. |
| `BK010-04` | operability | `P1` | `high` | `in-batch` | `.github/workflows/ci.yml:121` | CI had no deterministic flake-threshold gate for required suites, allowing unstable replay behavior to merge without objective evidence. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK010-01`, `BK010-02`, `BK010-03`, `BK010-04`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - BK-010 closure required deterministic build/isolation hardening and an enforceable replay-based flake evidence gate in one bounded reliability batch.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK010-01` | `pass` | Added deterministic CLI prebuild lock/sentinel helper and wired build-invoking suites through it (`packages/cli/src/test-harness.ts:65`, `packages/cli/src/self-host-dogfood.test.ts:15`, `packages/cli/src/self-host-maturity.test.ts:15`). | None |
| `BK010-02` | `pass` | Added deterministic per-suite isolation helpers and migrated CLI/e2e suite temp/log paths to suite-scoped roots (`packages/cli/src/test-harness.ts:73`, `packages/cli/src/e2e-smoke.test.ts:23`, `packages/cli/src/e2e-smoke.test.ts:131`). | None |
| `BK010-03` | `pass` | Added deterministic flake replay command/report contract + tests and published reproducible report artifact (`scripts/self-host-flake-replay.js:81`, `package.json:48`, `packages/cli/src/self-host-flake-replay.test.ts:13`, `docs/metrics/reports/self-host-flake-latest.json:2`). | None |
| `BK010-04` | `pass` | Added CI flake replay gate and artifact upload, plus roadmap/process convergence references (`.github/workflows/ci.yml:121`, `ROADMAP.md:51`, `docs/roadmap/backlog-bk-010-deterministic-verification-hardening-and-flake-replay-gate-completion.md:1`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - Selected BK-010 issues are fully implemented with deterministic suite isolation, replay-rate evidence publication (`self_host_flake_report.v1`), CI threshold enforcement, and completed roadmap/process artifacts.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-010-deterministic-verification-hardening-and-flake-replay-gate-batch-1-plan.md`](../plans/bk-010-deterministic-verification-hardening-and-flake-replay-gate-batch-1-plan.md)
- Solution: [`docs/solutions/deterministic-cli-suite-isolation-and-flake-replay-gate.md`](../solutions/deterministic-cli-suite-isolation-and-flake-replay-gate.md)
- Completion report: [`docs/roadmap/backlog-bk-010-deterministic-verification-hardening-and-flake-replay-gate-completion.md`](../roadmap/backlog-bk-010-deterministic-verification-hardening-and-flake-replay-gate-completion.md)
