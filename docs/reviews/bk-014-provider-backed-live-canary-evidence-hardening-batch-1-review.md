# Review: BK-014 Provider-Backed Live-Canary Evidence Hardening (Batch 1)

## Metadata
- Date: 2026-02-12
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-014` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK014-01` | reliability | `P1` | `high` | `in-batch` | `scripts/self-host-provider-backed-live-report.js:12` | No bounded live-provider evidence publisher existed for provider-backed claims (`openai`/`anthropic`) with explicit timeout/token guardrails. |
| `BK014-02` | correctness | `P1` | `high` | `in-batch` | `packages/cli/src/self-host-provider-backed-live-report.test.ts:16` | No deterministic regression coverage existed for advisory-vs-required live-canary policy behavior and provider pass/fail/skip states. |
| `BK014-03` | operability | `P1` | `high` | `in-batch` | `.github/workflows/provider-backed-live-canary.yml:1` | No explicitly configured fail-closed nightly/release-style lane existed to enforce live canary only when provider secrets are available. |
| `BK014-04` | process-correctness | `P1` | `high` | `in-batch` | `docs/self-hosting-maturity-ladder.md:22` | Provider-backed claim docs lacked explicit live-canary evidence/freshness references alongside deterministic contract-test evidence. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK014-01`, `BK014-02`, `BK014-03`, `BK014-04`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - BK-014 requires bounded live-provider evidence publication, deterministic policy-mode behavior, explicit configured fail-closed lane, and synchronized claim references in one bounded reliability batch.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK014-01` | `pass` | Added deterministic bounded live-canary publisher with required-provider set, timeout/token bounds, and report schema `self_host_provider_backed_live_report.v1` (`scripts/self-host-provider-backed-live-report.js:12`, `scripts/self-host-provider-backed-live-report.js:175`, `scripts/self-host-provider-backed-live-report.js:359`, `docs/metrics/reports/self-host-provider-backed-live-latest.json:2`, `package.json:49`). | None |
| `BK014-02` | `pass` | Added deterministic regression coverage for require-pass pass/fail and advisory skip behavior (`packages/cli/src/self-host-provider-backed-live-report.test.ts:16`); targeted test command passed. | None |
| `BK014-03` | `pass` | Added secret-gated nightly/dispatch live-canary workflow lane with explicit fail-closed `--require-pass` mode and artifact upload (`.github/workflows/provider-backed-live-canary.yml:1`). | None |
| `BK014-04` | `pass` | Updated maturity/spec/readme/roadmap references to include live-canary artifact and freshness expectation (`docs/self-hosting-maturity-ladder.md:22`, `docs/self-hosting-maturity-ladder.md:77`, `docs/spec-conformance-matrix.md:20`, `README.md:493`, `ROADMAP.md:61`, `ROADMAP.md:344`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - BK-014 selected issues are fully implemented with bounded live-canary evidence publication, deterministic policy behavior, configured fail-closed canary lane, and synchronized documentation/roadmap references.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-014-provider-backed-live-canary-evidence-hardening-batch-1-plan.md`](../plans/bk-014-provider-backed-live-canary-evidence-hardening-batch-1-plan.md)
- Solution: [`docs/solutions/provider-backed-live-canary-evidence-hardening.md`](../solutions/provider-backed-live-canary-evidence-hardening.md)
- Completion report: [`docs/roadmap/backlog-bk-014-provider-backed-live-canary-evidence-hardening-completion.md`](../roadmap/backlog-bk-014-provider-backed-live-canary-evidence-hardening-completion.md)
