# Roadmap (Fixture with Operational Queue)

## Claims Consistency Anchors
- Declared current level: `provider-backed`
- Declared next level: `autonomous`
- CAL-DELTA-02 status: `closed`
- ULLM-DELTA-02 status: `closed`
- Companion unattended autonomy scope: `out-of-scope`

Outstanding operational follow-up (captured 2026-02-12):
- `OP-001` (planned): tighten cross-doc claim synchronization.
- `OP-002` (planned): publish deterministic confidence recommendations.

## Agent Session Handoff (Execution-Ready)
Execution order (do not reorder unless blocked):
1. `OP-001`: Cross-doc claim synchronization ratchet.
2. `OP-002`: Reviewable confidence-tuning recommendation publication loop.

### Next
| ID | Item | Status | Exit criteria |
| --- | --- | --- | --- |
| `OP-001` | Cross-doc claim synchronization ratchet | Planned | Drift fails closed. |
| `OP-002` | Reviewable confidence-tuning recommendation loop | Planned | Recommendation artifact is review input. |
