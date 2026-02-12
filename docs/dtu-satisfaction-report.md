# DTU Satisfaction Report

Last updated: 2026-02-12

This document describes the deterministic satisfaction report emitted by `factorial dtu-run`.

## Report Schema

```
{
  "schema_version": "dtu_satisfaction_report.v1",
  "generated_at": "2026-02-12T00:00:00.000Z",
  "fixtures_root": "/abs/path/to/fixtures",
  "totals": {
    "total": 0,
    "satisfied": 0,
    "unsatisfied": 0,
    "pass_rate": 0
  },
  "suites": {
    "smoke": { "total": 0, "satisfied": 0, "unsatisfied": 0, "pass_rate": 0 },
    "regression": { "total": 0, "satisfied": 0, "unsatisfied": 0, "pass_rate": 0 },
    "holdout": { "total": 0, "satisfied": 0, "unsatisfied": 0, "pass_rate": 0 }
  },
  "scenario_class_distribution": {
    "success": { "total": 0, "satisfied": 0, "unsatisfied": 0, "pass_rate": 0 },
    "retryable_failure": { "total": 0, "satisfied": 0, "unsatisfied": 0, "pass_rate": 0 },
    "terminal_failure": { "total": 0, "satisfied": 0, "unsatisfied": 0, "pass_rate": 0 }
  },
  "holdout_rate": 0,
  "drift_delta": {
    "pass_rate": 0,
    "holdout_rate": 0
  },
  "failure_mode_coverage": {
    "rate_limit": false,
    "auth_failure": false,
    "timeout": false,
    "malformed_payload": false,
    "partial_outage": false,
    "not_found": false
  },
  "satisfaction_distribution": {
    "mean": 0.85,
    "median": 0.9,
    "min": 0.3,
    "max": 1.0,
    "std_dev": 0.15,
    "quartiles": {
      "q1": 0.75,
      "q2": 0.9,
      "q3": 0.95
    },
    "buckets": {
      "excellent": 8,
      "good": 3,
      "acceptable": 2,
      "poor": 1,
      "failed": 1
    }
  },
  "results": [
    {
      "scenario_id": "example",
      "suite": "smoke",
      "scenario_class": "success",
      "status": "satisfied",
      "satisfaction_score": 1,
      "satisfaction_details": {
        "value": 1,
        "components": {
          "status_match": 1,
          "structure_match": 1,
          "content_match": 1
        },
        "details": ["Full parity match"]
      },
      "reason": "response parity matched fixture expectation",
      "expected_failure_mode": "rate_limit",
      "request": { "twin_id": "", "operation": "", "scenario_id": "", "seed": "", "input": {}, "timing": { "requested_at_ms": 0, "timeout_ms": 0 }, "metadata": {} },
      "expected": { "twin_id": "", "twin_version": "", "operation": "", "status": "success", "output": {}, "error": null, "timing": { "started_at_ms": 0, "completed_at_ms": 0, "latency_ms": 0, "deterministic": true }, "metadata": {} },
      "actual": { "twin_id": "", "twin_version": "", "operation": "", "status": "success", "output": {}, "error": null, "timing": { "started_at_ms": 0, "completed_at_ms": 0, "latency_ms": 0, "deterministic": true }, "metadata": {} }
    }
  ]
}
```

## Field Notes
- `pass_rate` values are rounded to 6 decimal places.
- `drift_delta` compares the current report to an optional baseline report.
- `failure_mode_coverage` is true when at least one satisfied scenario exercises that failure mode.
- `not_found` covers missing resources in external twins (e.g. repo not found).
- `scenario_class_distribution` counts satisfied/unsatisfied totals for success vs retryable/terminal failures.
- `scenario_class` is inferred from the expected response when omitted in fixtures (success vs retryable/terminal errors).
- `satisfaction_score` and `satisfaction_details` use probabilistic parity (0-1) rather than strict equality.
- `satisfaction_distribution` provides probabilistic scoring (0-1) instead of binary pass/fail:
  - **Score components**: status_match (50%), structure_match (30%), content_match (20%)
  - **Status thresholds**: satisfied (≥0.8), marginal (0.5-0.8), unsatisfied (<0.5)
  - **Distribution buckets**: excellent (0.9-1.0), good (0.8-0.9), acceptable (0.5-0.8), poor (0.3-0.5), failed (<0.3)

## CLI Usage

### Run scenarios

```bash
npx factorial dtu-run --fixtures ./fixtures/dtu --report ./reports/dtu_satisfaction_report.json
```

Add `--baseline-report` to compute drift deltas against a prior report.

### Curate scenarios

List existing scenarios:

```bash
npx factorial dtu-curate --fixtures ./fixtures/dtu --list
```

Create a new scenario:

```bash
npx factorial dtu-curate --fixtures ./fixtures/dtu --create \\
  --scenario-id my-test \\
  --twin jira.issue \\
  --suite smoke \\
  --operation issues.create \\
  --description "My test scenario"
```

Validate a scenario template without creating:

```bash
npx factorial dtu-curate --fixtures ./fixtures/dtu --validate \\
  --scenario-id my-test \\
  --twin jira.issue \\
  --suite smoke \\
  --operation issues.create
```

Available twins: `jira.issue`, `slack.channel`, `github.issue`, `aws.s3`, `database.records`

Available suites: `smoke`, `regression`, `holdout`
