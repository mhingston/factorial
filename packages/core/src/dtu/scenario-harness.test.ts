import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  loadDtuScenarioFixtures,
  runDtuScenarioHarness,
  scenarioSuiteSchema,
} from './scenario-harness.js';
import { createReferenceTwinRuntime } from './reference-runtime.js';

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
    });
  });
});
