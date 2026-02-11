# Compound Rate Metrics

This document defines how to measure whether engineering learnings are compounding over time.

## Reporting Cadence
- Weekly (calendar week, Monday-Sunday).
- Keep one short report entry per week in PR notes or team docs.
- Standard report location: `docs/metrics/reports/week-YYYY-MM-DD_to_YYYY-MM-DD.md`.

## Metrics and Formulas
- `solutions_created_weekly`
  - Formula: unique solution docs added in week.
  - Source: Git history for `docs/solutions/*.md` (excluding `README.md` and `example-*` if desired).
- `context_updates_weekly`
  - Formula: commits touching root `AGENTS.md` or `CLAUDE.md`.
  - Source: Git history.
- `known_issue_recurrence_rate`
  - Formula: repeated `issue_class` findings / total findings in week.
  - Source: structured review artifacts from `docs/templates/review.md` output.
- `median_cycles_to_close`
  - Formula: median count of `implement -> verify` loops before `consensus_lock=resolved`.
  - Source: review and lock artifacts.
- `reopen_rate`
  - Formula: reopened batches / total batches that reached lock decision.
  - Source: consensus lock records.
- `verifier_agreement_rate`
  - Formula: matching `pass|fail` outcomes across independent verification attempts / total compared outcomes.
  - Source: verification artifacts.

## Collection Commands (Git-Based)
Set week bounds first:

```bash
START="2026-02-09"
END="2026-02-15"
```

Generate a standardized weekly report artifact:

```bash
npm run metrics:compound-weekly -- --start "$START" --end "$END"
```

Count created solution docs:

```bash
git log --since="$START 00:00" --until="$END 23:59" --diff-filter=A --name-only --pretty=format: -- docs/solutions \
  | rg '^docs/solutions/.*\.md$' \
  | rg -v 'README\.md|example-' \
  | sort -u \
  | wc -l
```

Count context updates:

```bash
git log --since="$START 00:00" --until="$END 23:59" --pretty=format:%H -- AGENTS.md CLAUDE.md | wc -l
```

## Artifact Discipline Needed for Remaining Metrics
To compute recurrence, cycles-to-close, reopen rate, and verifier agreement reliably:
- keep `issue_class` populated in review findings,
- keep one explicit consensus lock decision per batch (`resolved|reopen`),
- keep verification results in `issue_id -> pass|fail` form.

These are all encoded by `docs/templates/review.md`.

## Weekly Report Template
```md
Week of YYYY-MM-DD
- solutions_created_weekly:
- context_updates_weekly:
- known_issue_recurrence_rate:
- median_cycles_to_close:
- reopen_rate:
- verifier_agreement_rate:
- Notes / actions:
```

## Current 4-Week Report Set
- [`docs/metrics/reports/week-2026-01-19_to_2026-01-25.md`](./reports/week-2026-01-19_to_2026-01-25.md)
- [`docs/metrics/reports/week-2026-01-26_to_2026-02-01.md`](./reports/week-2026-01-26_to_2026-02-01.md)
- [`docs/metrics/reports/week-2026-02-02_to_2026-02-08.md`](./reports/week-2026-02-02_to_2026-02-08.md)
- [`docs/metrics/reports/week-2026-02-09_to_2026-02-15.md`](./reports/week-2026-02-09_to_2026-02-15.md)
