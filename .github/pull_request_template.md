## Summary
- What changed:
- Why it changed:

## Linked Artifacts
- Plan artifact:
- Structured review artifact:
- Compound artifact (or `N/A` with reason):
- Consensus lock decision (`resolved|reopen`):

## Compound Engineering OS Checklist
- [ ] Plan artifact is linked and uses `docs/templates/plan.md` structure
- [ ] Review findings are structured with severity/confidence/evidence and file references
- [ ] Findings are bounded (high-impact only, max 5 for exploration pass)
- [ ] Implementation is scoped to selected issue IDs
- [ ] Verification reports `pass|fail` per selected issue ID only
- [ ] Consensus lock decision recorded as `resolved` or `reopen`
- [ ] Ratchet rule followed (no new critique while active batch unresolved)
- [ ] A solution doc was added or intentionally skipped with rationale
- [ ] Root `AGENTS.md`/`CLAUDE.md` updated when a pattern should become default guidance

## Validation
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:run`
- [ ] `npm run agent:audit`
