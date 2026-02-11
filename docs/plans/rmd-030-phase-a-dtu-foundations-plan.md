# Plan: RMD-030 Phase A DTU Foundations Vertical Slice

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `RMD-030`, `DTU-01` (Phase A slice)
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - Repository has roadmap-level DTU intent, but no implementation for twin contracts, runtime boundary, or parity fixture checks.
- Target behavior:
  - Add schema-backed DTU twin invocation contracts.
  - Add backend-agnostic runtime boundary abstraction with an in-memory implementation for CI.
  - Add one reference twin stub with deterministic fixture parity tests.
- Why this change is needed:
  - Phase A of `docs/roadmap/0.3-digital-twin-universe-execution-plan.md` requires concrete DTU foundations before scenario harness and failure simulation phases.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Core export surface | `packages/core/src/index.ts`, `index.ts` | Exports engine/types/handlers, no DTU API | DTU module must be additive and non-breaking |
| Runtime architecture | `packages/core/src/engine/index.ts`, `packages/core/src/handlers/builtin.ts` | Engine is deterministic and handler-pluggable | DTU should use pluggable boundary pattern and avoid engine rewrites |
| Existing parity tests | `packages/core/src/reference-parity.test.ts`, `tests/fixtures/reference/*` | Fixture-driven determinism checks already used | Reuse fixture-first parity pattern for DTU |
| Roadmap docs | `ROADMAP.md`, `docs/roadmap/0.3-digital-twin-universe-execution-plan.md` | DTU defined as future milestone | Need explicit cross-links to implemented slice artifacts |

## External Constraints
- API/provider constraints:
  - Keep DTU runtime backend-agnostic per Attractor backend abstraction model.
- Runtime/environment constraints:
  - Must run in CI quickly and deterministically; avoid external network dependencies.
- Backward compatibility constraints:
  - Existing execution engine and handlers must remain unchanged in behavior.

## Design Outline
- Proposed approach:
  - Introduce `packages/core/src/dtu/` with:
    - contract schemas and typed request/response/error/timing models,
    - runtime boundary interfaces,
    - in-memory runtime implementation,
    - reference Jira issue twin stub.
  - Add fixture JSONs and parity tests that:
    - validate fixtures against schema (`AT-01` slice),
    - execute twin and compare exact deterministic response (`AT-02` slice).
  - Export DTU APIs from core/root indices.
  - Add plan/review/compound docs and roadmap cross-references.
- Rejected alternatives and why:
  - Integrating DTU directly into `ExecutionEngine`: rejected for Phase A because it increases risk and violates core-preserving requirement.
  - Building HTTP twin runtime first: rejected because CI determinism and speed are Phase A priorities.
- Affected interfaces and contracts:
  - New `TwinInvocationRequest/Response` schemas.
  - New `TwinRuntimeBoundary` and `TwinRegistryBoundary` interfaces.
  - New `InMemoryTwinRuntime` implementation.

## Edge Cases
- Edge case 1:
  - Invocation references an unregistered twin.
- Edge case 2:
  - Unsupported operation for a registered twin.
- Failure mode handling:
  - Contract-valid error responses with explicit class/code/retryability.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| DTU-INV-001 | Every request/response in parity fixtures is schema-valid | Runtime + fixture parse through strict schema | AT-01 fixture schema test |
| DTU-INV-002 | Twin parity outputs are deterministic for fixed fixture inputs | In-memory runtime with deterministic timing and deterministic twin logic | AT-02 parity replay test |
| DTU-INV-003 | Runtime boundary remains backend-agnostic | Interfaces separate from in-memory implementation | Type-level compile + boundary tests |

## Validation Checklist
- [x] Unit/integration tests updated
- [x] Lint passes
- [x] Typecheck passes
- [x] Relevant golden/regression checks pass
- [x] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `DTU-01A` contract schema + timing/error model
  - `DTU-01B` runtime boundary abstraction + in-memory runtime
  - `DTU-01C` reference twin stub + deterministic fixture parity tests/docs wiring
- Implementer scope statement (batch-limited):
  - Implement only `DTU-01A`, `DTU-01B`, and `DTU-01C` in this batch.
- Verifier scope statement (batch-only):
  - Verify only `DTU-01A`, `DTU-01B`, and `DTU-01C` with explicit `pass|fail` evidence.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.

## Cross References
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- DTU execution plan: [`docs/roadmap/0.3-digital-twin-universe-execution-plan.md`](../roadmap/0.3-digital-twin-universe-execution-plan.md)
