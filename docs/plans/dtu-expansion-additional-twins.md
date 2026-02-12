# Plan: Digital Twin Universe Expansion - Additional Service Twins

## Metadata
- Date: 2026-02-12
- Author: Agent
- Related issue/PR: DTU-EXP-001
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior: 5 reference twins implemented (Jira, Slack, GitHub, AWS S3, Database)
- Target behavior: Expand to 10+ twins covering major SaaS providers (Stripe, Salesforce, Postgres, Redis, MongoDB, SendGrid, Twilio)
- Why this change is needed: Increase DTU coverage for realistic scenario testing and full-autonomy validation

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| DTU Contracts | `packages/core/src/dtu/contracts.ts` | Interface definitions for twin behavior | New twins must implement these contracts |
| Reference Runtime | `packages/core/src/dtu/runtime.ts` | In-memory twin execution | Can host additional twins |
| Existing Twins | `packages/core/src/dtu/reference-*.ts` | Jira, Slack, etc. implementations | Use as templates |
| Scenario Harness | `packages/core/src/dtu/scenario-harness.ts` | Test scenario runner | Needs new fixtures |

## External Constraints
- API/provider constraints: Must match real API behavior without external dependencies
- Runtime/environment constraints: All twins run in-memory, no Docker/containers required
- Backward compatibility constraints: Existing twins must continue working

## Design Outline
- Proposed approach:
  1. Implement Stripe twin (payments, webhooks, customers)
  2. Implement Postgres twin (SQL queries, transactions, connections)
  3. Implement Redis twin (key-value, pub/sub, TTL)
  4. Implement SendGrid twin (email sending, templates, stats)
  5. Add parity fixtures for each twin
  6. Create scenario catalog entries

- Affected interfaces:
  - New twin implementations in `packages/core/src/dtu/`
  - New CLI command: `factorial dtu:list-twins`

## Edge Cases
- Edge case 1: Twin state persistence across scenarios → Reset state between runs
- Edge case 2: Rate limiting simulation → Configurable rate limit errors
- Edge case 3: Partial failures → Support for degraded mode simulation

## High-Risk Invariants
N/A - DTU twins are test infrastructure, don't affect production data

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: DTU-EXP-001 through DTU-EXP-004
- Implementer scope statement: Implement 4 new DTU twins with parity fixtures
- Verifier scope statement: Verify twin accuracy against real API documentation
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
