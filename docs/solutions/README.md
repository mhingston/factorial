# Solution Knowledge Base

This folder stores reusable engineering patterns discovered during real implementation and review cycles.

## Naming Convention
- Use kebab-case file names.
- Preferred format: `<domain>-<problem>-<pattern>.md`.
- For calibration/example docs, use an `example-` prefix.

## When to Add a Solution Doc
Add a solution doc when at least one applies:
- The issue class has occurred more than once.
- The fix involved a non-obvious design tradeoff.
- The change reduced repeated review findings or reopens.
- A new invariant/check should become standard for similar work.

## Quality Bar
A solution doc is valid only if it includes:
- clear problem statement,
- reusable pattern (not just one-off patch notes),
- key insight,
- file and test references,
- trigger context,
- AGENTS/CLAUDE update note.

## Linking Policy
- Root `AGENTS.md` (or `CLAUDE.md`) must link to this folder.
- New high-signal patterns should be added to the root context when they become default guidance.
- Keep references current; remove stale links when patterns are superseded.

## Starter Example
- `docs/solutions/example-fastify-raw-body-webhooks.md`
