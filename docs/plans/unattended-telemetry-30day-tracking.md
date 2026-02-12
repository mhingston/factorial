# Plan: Unattended Telemetry - 30-Day Zero-Escalation Tracking

## Metadata
- Date: 2026-02-12
- Author: Agent
- Related issue/PR: FA-008
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior: Telemetry reports exist but lack 30-day aggregation for zero-escalation claims
- Target behavior: Automated 30-day tracking with explicit categorization and out-of-distribution (OOD) detection
- Why this change is needed: Satisfy FA-008 gate requirement for full-autonomy promotion

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Telemetry Collection | `packages/core/src/dtu/full-autonomy-telemetry.ts` | Daily telemetry events | Needs 30-day aggregation |
| OOD Detection | `packages/core/src/dtu/full-autonomy-telemetry.ts` | Statistical anomaly detection | Tune thresholds from data |
| Evidence Reports | `scripts/self-host-full-autonomy-telemetry.js` | Report generation | Extend for 30-day view |
| CI Workflows | `.github/workflows/` | Nightly runs | Add telemetry collection step |

## External Constraints
- API/provider constraints: Requires sustained API access for 30 days
- Runtime/environment constraints: Scheduled CI runs or persistent service
- Backward compatibility constraints: Maintain existing telemetry schema

## Design Outline
- Proposed approach:
  1. Create telemetry storage format with daily snapshots
  2. Implement categorization (workflow types, error classes)
  3. Build 30-day aggregation query
  4. Add OOD detection thresholds from baseline
  5. Create scheduled CI workflow for daily collection
  6. Build alert system for escalation events

- Affected interfaces:
  - Extended report schema: `full_autonomy_telemetry_report.v1` (30-day fields)
  - New CLI flags: `--days 30 --categorize`

## Edge Cases
- Edge case 1: Missing days in 30-day window → Interpolate or mark incomplete
- Edge case 2: Provider API failures → Distinguish from workflow failures
- Edge case 3: Human escalations for valid reasons → Categorize reason codes

## High-Risk Invariants
| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| INV-001 | Telemetry data is tamper-evident | Append-only with hash chain | Verify hash chain integrity |
| INV-002 | OOD detection prevents false autonomy claims | Conservative thresholds + human review | Manual audit of OOD triggers |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: FA-008-TEL-001 through FA-008-TEL-004
- Implementer scope statement: 30-day telemetry aggregation and OOD detection
- Verifier scope statement: Verify 30-day reports accurately reflect operation
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
