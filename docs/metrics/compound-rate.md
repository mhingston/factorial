# Compound Rate Metrics

This document defines how to measure whether engineering learnings are compounding over time.

## Reporting Cadence
- Weekly (calendar week, Monday-Sunday).
- Keep one short report entry per week in PR notes or team docs.
- Standard report location: `docs/metrics/reports/week-YYYY-MM-DD_to_YYYY-MM-DD.md`.
- Reliability SLO gate report location: `docs/metrics/reports/compound-reliability-slo-latest.json`.
- Unattended telemetry report location: `docs/metrics/reports/self-host-unattended-telemetry-latest.json`.

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
- `cost_per_merged_pr_proxy`
  - Formula: proxy cost per merged PR from unattended telemetry report.
  - Source: `docs/metrics/reports/self-host-unattended-telemetry-latest.json`.
- `reverted_pr_count`
  - Formula: merged PRs reverted within maintenance window.
  - Source: `docs/metrics/reports/self-host-unattended-telemetry-latest.json`.
- `churned_pr_count`
  - Formula: merged PRs with churn commits within maintenance window.
  - Source: `docs/metrics/reports/self-host-unattended-telemetry-latest.json`.
- `total_churn_commits`
  - Formula: total post-merge churn commits within maintenance window.
  - Source: `docs/metrics/reports/self-host-unattended-telemetry-latest.json`.
- `revert_rate`
  - Formula: reverted PRs / merged PRs within maintenance window.
  - Source: `docs/metrics/reports/self-host-unattended-telemetry-latest.json`.
- `churn_pr_rate`
  - Formula: churned PRs / merged PRs within maintenance window.
  - Source: `docs/metrics/reports/self-host-unattended-telemetry-latest.json`.
- `average_churn_commits_per_merged_pr`
  - Formula: total churn commits / merged PRs within maintenance window.
  - Source: `docs/metrics/reports/self-host-unattended-telemetry-latest.json`.
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

Or use the first-class CLI helper:

```bash
npx factorial compound-weekly --start "$START" --end "$END"
```

Evaluate reliability SLO thresholds and publish deterministic policy evidence:

```bash
npm run reliability:slo -- --report docs/metrics/reports/compound-reliability-slo-latest.json
```

Evaluate unattended-run outcome/economics telemetry contract:

```bash
npm run self-host:unattended-telemetry -- \
  --source docs/metrics/reports/self-host-unattended-telemetry-source-latest.json \
  --report docs/metrics/reports/self-host-unattended-telemetry-latest.json
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

## Reliability SLO Policy (BK-009)
Reliability SLO gate schema: `compound_reliability_slo_report.v1`.

Thresholds enforced by `npm run reliability:slo`:
- `lock_resolution_rate >= 0.80`
- `reopen_ratio <= 0.20`
- `cadence_age_days <= 7` (based on latest weekly report end date)

Policy hook behavior:
- If all thresholds pass: `consensus_lock_decision = resolved`.
- If any threshold fails or weekly evidence is invalid/missing: `consensus_lock_decision = reopen` (fail closed).

## Weekly Report Template
```md
Week of YYYY-MM-DD
- solutions_created_weekly:
- context_updates_weekly:
- known_issue_recurrence_rate:
- median_cycles_to_close:
- reopen_rate:
- cost_per_merged_pr_proxy:
- reverted_pr_count:
- churned_pr_count:
- total_churn_commits:
- revert_rate:
- churn_pr_rate:
- average_churn_commits_per_merged_pr:
- verifier_agreement_rate:
- review_artifacts_counted:
- Notes / actions:
```

## Current 4-Week Report Set
- [`docs/metrics/reports/week-2026-01-19_to_2026-01-25.md`](./reports/week-2026-01-19_to_2026-01-25.md)
- [`docs/metrics/reports/week-2026-01-26_to_2026-02-01.md`](./reports/week-2026-01-26_to_2026-02-01.md)
- [`docs/metrics/reports/week-2026-02-02_to_2026-02-08.md`](./reports/week-2026-02-02_to_2026-02-08.md)
- [`docs/metrics/reports/week-2026-02-09_to_2026-02-15.md`](./reports/week-2026-02-09_to_2026-02-15.md)
