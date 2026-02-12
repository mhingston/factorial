# Plan: OP-001 Cross-Doc Claim Synchronization Ratchet

## Metadata
- Date: 2026-02-12
- Author: Agent
- Related issue/PR: OP-001 (operational follow-up)
- Risk level: low

## Requirement / Behavior Delta
- Current behavior: Claims consistency audit (`npm run claims:audit`) detects mismatches between roadmap, spec-conformance-matrix, companion-spec-scope-contract, self-hosting-maturity-ladder, and active-handoff, but does not prevent merge when drift is detected.
- Target behavior: Extend drift checks to enforce synchronized declarations with fail-closed CI enforcement. Any divergence without synchronized updates and evidence refresh fails CI.
- Why this change is needed: Prevents claim inconsistencies from reaching main branch. Ensures roadmap/spec/matrix/maturity declarations stay synchronized as the system evolves.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Claims audit | `scripts/claims-consistency-audit.js` | Parses 5 docs, evaluates 6 checks (CLM-001 to CLM-006), exits 0/1 | Already comprehensive, just needs CI integration |
| CI workflow | `.github/workflows/ci.yml` | Has `claims-consistency` job that runs audit | Currently runs audit but may not fail closed on drift |
| Report contract | `packages/cli/src/claims-consistency-audit.test.ts` | Tests audit behavior with fixtures | Add fixture for drift scenario |
| Fixtures | `tests/fixtures/claims-audit/` | Contains compliant/mismatch test fixtures | Add drift detection fixture |

## External Constraints
- API/provider constraints: N/A - internal documentation consistency only
- Runtime/environment constraints: Must work in CI without additional secrets
- Backward compatibility constraints: Existing `npm run claims:audit` behavior unchanged; only CI enforcement added

## Design Outline
- Proposed approach:
  1. Enhance `scripts/claims-consistency-audit.js` with actionable drift diagnostics (list specific mismatched fields)
  2. Update CI workflow to fail closed when `claims:audit` returns non-zero
  3. Add fixture-based test for drift scenario with unsynchronized declarations
  4. Update AGENTS.md with cross-doc update requirements
- Rejected alternatives and why:
  - Auto-fix drift: Too risky, could introduce unintended changes
  - Warning-only mode: Doesn't enforce the ratchet guarantee
- Affected interfaces and contracts:
  - `npm run claims:audit` output format (add diagnostics field)
  - CI workflow `claims-consistency` job behavior

## Edge Cases
- Edge case 1: New claim document added to set - audit should detect and require synchronization
- Edge case 2: Document temporarily missing during refactor - audit should fail gracefully with clear error
- Edge case 3: Intentional scope change (e.g., declaring autonomous readiness) - requires synchronized updates across all docs
- Failure mode handling: If audit script errors, CI fails closed (treat as drift detected)

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| N/A | No high-risk invariants for documentation consistency checks | - | - |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: OP-001
- Implementer scope statement: Extend claims audit with diagnostics, add drift fixture test, update CI to fail closed
- Verifier scope statement: Verify audit catches drift, CI fails on mismatch, diagnostics are actionable
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
