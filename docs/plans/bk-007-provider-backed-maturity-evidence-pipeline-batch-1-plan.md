# Plan: BK-007 Provider-backed Maturity Evidence Pipeline (Batch 1)

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `BK-007`
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - `PB-001` is evaluated by directly running targeted parity tests inside `self-host:maturity`.
  - `PB-002` checks only for existence/schema/provider keys in `docs/metrics/reports/self-host-provider-backed-latest.json`.
  - No deterministic in-repo publisher exists to generate and refresh the provider-backed evidence artifact.
- Target behavior:
  - Publish and maintain deterministic provider-backed evidence artifact schema `self_host_provider_backed_report.v1`.
  - Add a deterministic generation/publication command path for `docs/metrics/reports/self-host-provider-backed-latest.json`.
  - Make `PB-001` and `PB-002` objectively verifiable from published evidence without weakening `deterministic-local` CI requirements.
- Why this change is needed:
  - `BK-007` is the next backlog item in execution order and is required for objective provider-backed maturity evidence.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Maturity gate runner | `scripts/self-host-maturity.js`, `packages/cli/src/self-host-maturity.test.ts` | Evaluates `DL-*`, `PB-*`, `AU-*`; `PB-001` executes tests directly; `PB-002` inspects report presence/schema | `PB-*` should consume deterministic published evidence |
| Maturity ladder contract | `docs/self-hosting-maturity-ladder.md` | Declares `PB-001` parity and `PB-002` published report requirements | Needs explicit generator/publication hook reference |
| Provider parity evidence source | `packages/core/src/handlers/codergen.test.ts`, `packages/core/src/llm/index.test.ts` | Deterministic mocked-provider parity checks exist for openai/anthropic | Reuse as objective inputs for published report |
| CLI scripts and commands | `package.json` | Has `self-host:maturity`, no provider-backed publisher command | Add first-class script command for publication |
| Reporting destination | `docs/metrics/reports/` | Weekly compound reports exist; no provider-backed latest JSON | Add deterministic `self-host-provider-backed-latest.json` publication |

## External Constraints
- API/provider constraints:
  - Must not require live external provider credentials for default CI gating path.
- Runtime/environment constraints:
  - Script must be deterministic, machine-readable, and runnable in local/CI Node environments.
- Backward compatibility constraints:
  - Preserve existing deterministic-local gate behavior and CI requirement (`--require-level deterministic-local`).

## Design Outline
- Proposed approach:
  - Add `scripts/self-host-provider-backed-report.js` that:
    - runs deterministic parity test commands,
    - records pass/fail outcomes,
    - publishes report schema `self_host_provider_backed_report.v1`,
    - writes/updates `docs/metrics/reports/self-host-provider-backed-latest.json` deterministically.
  - Add npm command `self-host:provider-backed` for deterministic report generation/publication.
  - Refactor `self-host:maturity` provider-backed gates:
    - `PB-001` validates objective parity evidence status from published report fields,
    - `PB-002` validates schema/provider pass keys from the same report.
  - Add/extend tests for report generator schema contract + maturity PB gate evaluation behavior.
  - Update maturity ladder docs and roadmap execution artifacts for BK-007 closure evidence.
- Rejected alternatives and why:
  - Keep `PB-001` as an in-band test execution only: rejected because it does not publish durable provider-backed evidence artifacts.
  - Publish ad-hoc markdown-only evidence: rejected because it is harder to validate objectively in tooling.
- Affected interfaces and contracts:
  - New report contract: `self_host_provider_backed_report.v1`.
  - New deterministic command path: `npm run self-host:provider-backed`.
  - Provider-backed maturity gate semantics in `scripts/self-host-maturity.js`.

## Edge Cases
- Edge case 1:
  - Missing report file should keep provider-backed status non-eligible while leaving deterministic-local required-level checks unaffected.
- Edge case 2:
  - Partial provider success (openai pass, anthropic fail) must produce deterministic gate failure details.
- Failure mode handling:
  - Publication command exits non-zero on parity failures but still writes diagnostic report fields when feasible.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK007-INV-01 | Provider-backed maturity claims are evidence-backed and machine-verifiable | Enforce `self_host_provider_backed_report.v1` schema + deterministic status fields | Validate report schema and required provider keys in tests + `PB-002` gate |
| BK007-INV-02 | `PB-001` and `PB-002` rely on objective published evidence | Derive both PB gates from published report fields/path checks instead of transient-only process state | Run `self-host:maturity` and confirm PB gates reflect report contract |
| BK007-INV-03 | Deterministic-local CI gate remains intact | Keep `--require-level deterministic-local` path unchanged and independent of PB gate pass requirement | `npm run self-host:maturity -- --require-level deterministic-local` remains green |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK007-01` Add deterministic provider-backed report generation/publication script and schema contract.
  - `BK007-02` Make maturity `PB-001`/`PB-002` objectively verifiable from published provider-backed evidence.
  - `BK007-03` Add/refresh deterministic tests for provider-backed report and maturity gate behavior.
  - `BK007-04` Converge docs/roadmap artifacts and completion references for BK-007 batch closure.
- Implementer scope statement (batch-limited):
  - Implement only `BK007-01` through `BK007-04` for provider-backed evidence pipeline and documentation convergence.
- Verifier scope statement (batch-only):
  - Verify only `BK007-01` through `BK007-04` with pass/fail evidence; do not introduce new issue IDs in verification.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
