# Plan: BK-001 Replay/Provenance UX Improvements (Batch 1)

## Metadata
- Date: 2026-02-11
- Author: Codex (GPT-5)
- Related issue/PR: `BK-001`
- Risk level: `low`

## Requirement / Behavior Delta
- Current behavior:
  - `run_manifest.json` contains rich replay/provenance data, but users must manually parse large JSON payloads to diagnose replay drift.
  - There is no first-class CLI command for concise, deterministic replay/provenance summaries or run-to-replay comparisons.
- Target behavior:
  - Add a CLI command that summarizes replay-critical manifest fields and optionally diffs two manifests on replay/provenance dimensions.
  - Provide deterministic JSON output for tooling and human-readable text output for terminal debugging.
- Why this change is needed:
  - `BK-001` focuses incident debugging ergonomics after adapter/governance completion; this closes a high-friction manual analysis gap.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| CLI replay/manifests | `packages/cli/src/index.ts` | Reads/writes `run_manifest.v1` and supports replay execution | Natural extension point for a `manifest` inspection command |
| CLI smoke tests | `packages/cli/src/e2e-smoke.test.ts` | Covers run/resume/replay and manifest existence/provenance fields | Extend with manifest summary/diff verification |
| User docs | `README.md` | Documents replay and manifest schema only | Add new command usage and debugging workflow |
| Roadmap | `ROADMAP.md` | `BK-001` remains backlog | Update status/artifacts once batch converges |

## External Constraints
- Runtime/environment constraints:
  - Preserve deterministic output for CI and tooling use.
- Backward compatibility constraints:
  - Additive CLI command only; no manifest schema change.

## Design Outline
- Proposed approach:
  - Add `factorial manifest` command:
    - required `--manifest <path>`
    - optional `--compare <path>`
    - optional `--json`
  - Emit compact summary:
    - outcome, graph id, replay config profile, completed/failing nodes, provenance rollups.
  - When `--compare` is provided, emit replay-focused diff:
    - graph metadata, run config backend/provider/model, node outcome status deltas, provenance per-node backend/provider/model/operation/output mode deltas.
  - Add e2e smoke test using a run manifest compared to replay manifest with deterministic JSON assertions.
  - Update README and roadmap/process artifacts.
- Rejected alternatives and why:
  - Full TUI/log viewer: out of scope for a bounded, CI-friendly batch.
- Affected interfaces and contracts:
  - New CLI command surface only; `run_manifest.v1` remains unchanged.

## Edge Cases
- Edge case 1:
  - Missing/invalid manifest schema -> fail with explicit error.
- Edge case 2:
  - Compare target missing nodes/provenance entries -> report as added/removed entries.
- Failure mode handling:
  - Non-zero exit on parsing/schema errors; deterministic zero exit for valid summaries/diffs.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK001-INV-01 | Existing run/resume/replay behavior must not regress | Additive command only; keep manifest schema intact | Existing CLI e2e replay tests remain green |
| BK001-INV-02 | Manifest diff semantics remain deterministic | Stable sorting and normalized key comparisons | New e2e test asserts structured JSON summary/diff |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK001-01` CLI manifest summary command
  - `BK001-02` replay-focused manifest diff output
  - `BK001-03` docs and roadmap convergence
- Implementer scope statement (batch-limited):
  - Implement `manifest` command, add e2e coverage, and update docs/roadmap artifacts only.
- Verifier scope statement (batch-only):
  - Verify only selected IDs with explicit pass/fail evidence; no new scope.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
