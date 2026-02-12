import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createReferenceTwinRuntime } from './reference-runtime.js';
import {
  inferScenarioClass,
  loadDtuScenarioFixtures,
  runDtuScenarioHarness,
  scenarioSuiteSchema,
} from './scenario-harness.js';

const SCENARIO_FIXTURES_ROOT = fileURLToPath(
  new URL('../../../../tests/fixtures/dtu/scenarios/', import.meta.url)
);

describe('DTU scenario harness', () => {
  it('executes smoke/regression/holdout suites non-interactively (AT-03)', async () => {
    const fixtures = await loadDtuScenarioFixtures(SCENARIO_FIXTURES_ROOT);
    const runtime = createReferenceTwinRuntime();

    const report = await runDtuScenarioHarness({
      runtime,
      fixtures,
      fixtures_root: SCENARIO_FIXTURES_ROOT,
    });

    expect(report.schema_version).toBe('dtu_satisfaction_report.v1');
    expect(report.totals.total).toBeGreaterThan(0);
    expect(report.totals.unsatisfied).toBe(0);
    expect(report.suites.smoke.total).toBeGreaterThan(0);
    expect(report.suites.regression.total).toBeGreaterThan(0);
    expect(report.suites.holdout.total).toBeGreaterThan(0);
  });

  it('emits totals, pass rate, holdout rate, and drift deltas (AT-04)', async () => {
    const fixtures = await loadDtuScenarioFixtures(SCENARIO_FIXTURES_ROOT);
    const runtime = createReferenceTwinRuntime();

    const report = await runDtuScenarioHarness({
      runtime,
      fixtures,
      fixtures_root: SCENARIO_FIXTURES_ROOT,
      baseline: {
        totals: {
          total: 8,
          satisfied: 6,
          unsatisfied: 2,
          pass_rate: 0.75,
        },
        holdout_rate: 0.5,
      },
    });

    expect(report.totals.pass_rate).toBe(1);
    expect(report.holdout_rate).toBe(1);
    expect(report.drift_delta.pass_rate).toBe(0.25);
    expect(report.drift_delta.holdout_rate).toBe(0.5);
  });

  it('deterministically exercises failure-mode simulation coverage (AT-05)', async () => {
    const fixtures = await loadDtuScenarioFixtures(SCENARIO_FIXTURES_ROOT);
    const runtime = createReferenceTwinRuntime();

    const report = await runDtuScenarioHarness({
      runtime,
      fixtures,
      fixtures_root: SCENARIO_FIXTURES_ROOT,
      suites: [
        scenarioSuiteSchema.enum.regression,
        scenarioSuiteSchema.enum.holdout,
      ],
    });

    expect(report.failure_mode_coverage).toEqual({
      rate_limit: true,
      auth_failure: true,
      timeout: true,
      malformed_payload: true,
      partial_outage: true,
      not_found: false,
    });
  });

  it('emits scenario class distribution for success and failure classes (FI-002)', async () => {
    const fixtures = await loadDtuScenarioFixtures(SCENARIO_FIXTURES_ROOT);
    const runtime = createReferenceTwinRuntime();

    const report = await runDtuScenarioHarness({
      runtime,
      fixtures,
      fixtures_root: SCENARIO_FIXTURES_ROOT,
    });

    expect(report.scenario_class_distribution.success.total).toBeGreaterThan(0);
    expect(report.scenario_class_distribution.retryable_failure.total).toBeGreaterThan(0);
    expect(report.scenario_class_distribution.terminal_failure.total).toBeGreaterThan(0);
  });

  it('infers scenario classes from expected response deterministically (FI-002)', () => {
    expect(
      inferScenarioClass({
        twin_id: 'jira.issue',
        twin_version: '0.1.0',
        operation: 'issues.create',
        status: 'success',
        output: {},
        error: null,
        timing: {
          started_at_ms: 1700000000000,
          completed_at_ms: 1700000000001,
          latency_ms: 1,
          deterministic: true,
        },
        metadata: {},
      })
    ).toBe('success');

    expect(
      inferScenarioClass({
        twin_id: 'jira.issue',
        twin_version: '0.1.0',
        operation: 'issues.create',
        status: 'error',
        output: null,
        error: {
          code: 'timeout',
          class: 'transient',
          message: 'Timeout',
          retryable: true,
          details: {},
        },
        timing: {
          started_at_ms: 1700000000000,
          completed_at_ms: 1700000000001,
          latency_ms: 1,
          deterministic: true,
        },
        metadata: {},
      })
    ).toBe('retryable_failure');

    expect(
      inferScenarioClass({
        twin_id: 'jira.issue',
        twin_version: '0.1.0',
        operation: 'issues.create',
        status: 'error',
        output: null,
        error: {
          code: 'auth_failed',
          class: 'auth',
          message: 'Auth failed',
          retryable: false,
          details: {},
        },
        timing: {
          started_at_ms: 1700000000000,
          completed_at_ms: 1700000000001,
          latency_ms: 1,
          deterministic: true,
        },
        metadata: {},
      })
    ).toBe('terminal_failure');
  });
});
