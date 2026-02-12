# Review: BK-008 Release Hardening Gates (Batch 1)

## Metadata
- Date: 2026-02-12
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-008` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK008-01` | security | `P1` | `high` | `in-batch` | `scripts/release-hardening.js:1` | No deterministic release hardening gate existed to generate SBOM/signature artifacts and verify provenance policy with a versioned report contract. |
| `BK008-02` | operability | `P1` | `high` | `in-batch` | `.github/workflows/ci.yml:121` | CI and release workflow lacked an executable release hardening gate; pipeline could drift without explicit SBOM/signing/provenance enforcement before publish. |
| `BK008-03` | reliability | `P2` | `high` | `in-batch` | `packages/cli/src/release-hardening.test.ts:12` | Release hardening behavior had no regression tests for schema conformance and strict fail-closed signing behavior. |
| `BK008-04` | process-correctness | `P2` | `high` | `in-batch` | `ROADMAP.md:47` | Roadmap/docs still treated `BK-008` as backlog-open and lacked completion/process artifact references for release hardening closure. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK008-01`, `BK008-02`, `BK008-03`, `BK008-04`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - BK-008 closure required deterministic hardening evidence generation, enforceable CI/release policy gates, regression coverage, and process/documentation convergence in one bounded batch.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK008-01` | `pass` | Added deterministic release hardening script/report contracts and published artifacts (`scripts/release-hardening.js:15`, `docs/metrics/reports/release-hardening-latest.json:2`, `docs/metrics/reports/release-hardening-latest.json:18`). | None |
| `BK008-02` | `pass` | Added CI `release-hardening` job and release workflow enforcement prior to publish (`.github/workflows/ci.yml:121`, `.github/workflows/release.yml:38`). | None |
| `BK008-03` | `pass` | Added regression tests for pass path + strict missing-key fail-closed behavior (`packages/cli/src/release-hardening.test.ts:13`, `packages/cli/src/release-hardening.test.ts:65`). | None |
| `BK008-04` | `pass` | Updated roadmap/completion/docs references and release guidance (`ROADMAP.md:26`, `ROADMAP.md:47`, `docs/roadmap/backlog-bk-008-release-hardening-gates-completion.md:1`, `RELEASE.md:19`, `AGENTS.md:25`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - Selected issues are implemented with deterministic hardening evidence, enforced policy gates in CI/release workflows, passing verification commands, and converged roadmap/process artifacts.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-008-release-hardening-gates-batch-1-plan.md`](../plans/bk-008-release-hardening-gates-batch-1-plan.md)
- Solution: [`docs/solutions/release-hardening-gates-with-deterministic-sbom-signing-provenance.md`](../solutions/release-hardening-gates-with-deterministic-sbom-signing-provenance.md)
- Completion report: [`docs/roadmap/backlog-bk-008-release-hardening-gates-completion.md`](../roadmap/backlog-bk-008-release-hardening-gates-completion.md)
