# Plan: Factory Improvements Docs & Reporting

## Metadata
- Date: 2026-02-12
- Author: Amp
- Related issue/PR: N/A
- Risk level: low

## Requirement / Behavior Delta
- Current behavior: README mentions DTU but does not describe scenario satisfaction reporting; event stream schema is not documented; companion spec scope contract does not define an escape hatch policy for provider-native features.
- Target behavior: README includes a scenario satisfaction section and references the DTU report; documentation publishes the execution event stream schema and a consumption example; companion spec scope contract includes an explicit provider-native escape hatch policy.
- Why this change is needed: Align public documentation with software-factory expectations (scenario satisfaction and event-driven telemetry) and clarify advanced provider usage boundaries.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| README positioning | `README.md` | DTU described, no explicit satisfaction metrics or report schema | Add scenario satisfaction + link to docs |
| Event stream definition | `packages/core/src/types/index.ts` | `ExecutionEvent` type defines event names + payload | Document schema and sample consumer |
| Companion spec scope | `docs/companion-spec-scope-contract.md` | No escape hatch policy text | Add section on provider-native feature usage |

## External Constraints
- API/provider constraints: None (documentation-only).
- Runtime/environment constraints: None.
- Backward compatibility constraints: None (no runtime changes).

## Design Outline
- Proposed approach:
  - Add README section describing DTU scenario satisfaction report and `dtu-run` output.
  - Publish `docs/execution-event-stream.md` documenting `ExecutionEvent` schema and a sample consumer.
  - Extend companion spec scope contract with an explicit provider-native escape hatch policy.
- Rejected alternatives and why:
  - Adding new CLI commands: not needed because `dtu-run` already emits satisfaction reports.
- Affected interfaces and contracts:
  - Documentation only; no runtime contracts modified.

## Edge Cases
- Documentation references stale schema fields if `ExecutionEvent` changes later.
- README examples must match actual CLI behavior.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
N/A - documentation-only change.

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: DOC-001, DOC-002, DOC-003
- Implementer scope statement (batch-limited): Update docs only for scenario satisfaction reporting, event stream schema, and escape hatch policy.
- Verifier scope statement (batch-only): Verify docs reflect current CLI and event schema; no new issues added.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
