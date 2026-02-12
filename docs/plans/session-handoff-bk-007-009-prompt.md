# New Session Handoff Prompt (BK-007 -> BK-009)

Use this prompt to start a new coding session:

```text
Continue implementation from /Users/markhingston/Downloads/strange-attractor/ROADMAP.md.

Context:
- BK-001 through BK-006 are complete.
- Current self-host maturity level is deterministic-local.
- Active backlog queue is BK-007, BK-008, BK-009 in that order.

Execution order (do not reorder unless blocked):
1) BK-007 Provider-backed maturity evidence pipeline
2) BK-008 Release hardening gates (SBOM/signing/provenance)
3) BK-009 Reliability SLO gates and auto-reopen policy hooks

Required process loop (must follow AGENTS.md):
1. Create a plan artifact from docs/templates/plan.md for the selected BK item.
2. Implement only selected issue IDs for that batch.
3. Produce a review artifact from docs/templates/review.md with bounded high-impact findings.
4. Verify selected issue IDs only with pass|fail evidence.
5. Apply consensus lock decision (resolved or reopen).
6. Create/update solution artifact from docs/templates/compound.md.
7. Update ROADMAP.md status, execution order, and completion references.
8. Update AGENTS.md only if a new reusable default pattern was introduced.

BK-007 target outcomes:
- Publish provider-backed evidence report schema: self_host_provider_backed_report.v1.
- Add deterministic generation/publication path for docs/metrics/reports/self-host-provider-backed-latest.json.
- Ensure self-host maturity PB-001/PB-002 become objectively verifiable without weakening deterministic-local CI gates.

Quality bar:
- Keep deterministic behavior and CI friendliness.
- Do not introduce style-only churn.
- Use file/line references in review findings.
- Run and report: npm run lint, npm run typecheck, npm run test:run, npm run test:golden, npm run self-host:maturity -- --require-level deterministic-local.

Start now with BK-007 batch 1 and produce the plan artifact first.
```
