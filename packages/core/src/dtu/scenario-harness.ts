import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  type TwinInvocationResponse,
  twinInvocationRequestSchema,
  twinInvocationResponseSchema,
} from './contracts.js';
import type { TwinRuntimeBoundary } from './runtime.js';
import {
  type SatisfactionDistribution,
  type SatisfactionScore,
  computeSatisfactionDistribution,
  computeSatisfactionScore,
  probabilisticStatus,
} from './satisfaction-scoring.js';

export const scenarioSuiteSchema = z.enum(['smoke', 'regression', 'holdout']);
export type ScenarioSuite = z.infer<typeof scenarioSuiteSchema>;

export const scenarioClassSchema = z.enum(['success', 'retryable_failure', 'terminal_failure']);
export type ScenarioClass = z.infer<typeof scenarioClassSchema>;

export const failureModeSchema = z.enum([
  'rate_limit',
  'auth_failure',
  'timeout',
  'malformed_payload',
  'partial_outage',
  'not_found',
]);

export type FailureMode = z.infer<typeof failureModeSchema>;

export const dtuScenarioFixtureSchema = z.object({
  scenario_id: z.string().min(1),
  suite: scenarioSuiteSchema,
  scenario_class: scenarioClassSchema.optional(),
  description: z.string().min(1),
  request: twinInvocationRequestSchema,
  expected: twinInvocationResponseSchema,
  expected_failure_mode: failureModeSchema.optional(),
  tags: z.array(z.string().min(1)).default([]),
});

export type DtuScenarioFixture = z.infer<typeof dtuScenarioFixtureSchema>;

export interface ScenarioRunResult {
  scenario_id: string;
  suite: ScenarioSuite;
  scenario_class: ScenarioClass;
  status: 'satisfied' | 'unsatisfied' | 'marginal';
  satisfaction_score: number;
  satisfaction_details: SatisfactionScore;
  reason: string;
  expected_failure_mode?: FailureMode;
  request: DtuScenarioFixture['request'];
  expected: TwinInvocationResponse;
  actual: TwinInvocationResponse;
}

export interface ScenarioTotals {
  total: number;
  satisfied: number;
  unsatisfied: number;
  pass_rate: number;
}

export interface DtuSatisfactionReport {
  schema_version: 'dtu_satisfaction_report.v1';
  generated_at: string;
  fixtures_root: string;
  totals: ScenarioTotals;
  suites: Record<ScenarioSuite, ScenarioTotals>;
  scenario_class_distribution: Record<ScenarioClass, ScenarioTotals>;
  holdout_rate: number;
  drift_delta: {
    pass_rate: number;
    holdout_rate: number;
  };
  failure_mode_coverage: Record<FailureMode, boolean>;
  satisfaction_distribution: SatisfactionDistribution;
  results: ScenarioRunResult[];
}

export interface ScenarioHarnessOptions {
  runtime: TwinRuntimeBoundary;
  fixtures: DtuScenarioFixture[];
  fixtures_root: string;
  suites?: ScenarioSuite[];
  baseline?: Pick<DtuSatisfactionReport, 'totals' | 'holdout_rate'> | null;
}

export async function loadDtuScenarioFixtures(fixturesRoot: string): Promise<DtuScenarioFixture[]> {
  const absoluteRoot = resolve(fixturesRoot);
  const files = await listJsonFiles(absoluteRoot);
  const fixtures: DtuScenarioFixture[] = [];

  for (const file of files.sort()) {
    // Only process files in 'scenarios' subdirectory
    if (!file.includes('/scenarios/') && !file.includes('\\scenarios\\')) {
      continue;
    }

    try {
      const raw = await readFile(file, 'utf-8');
      const parsed = dtuScenarioFixtureSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        fixtures.push(parsed.data);
      }
      // Silently skip invalid fixtures
    } catch {
      // Skip files that can't be read or parsed
    }
  }

  return fixtures;
}

export async function runDtuScenarioHarness(
  options: ScenarioHarnessOptions
): Promise<DtuSatisfactionReport> {
  const suites = options.suites && options.suites.length > 0 ? new Set(options.suites) : null;
  const fixtures = options.fixtures.filter(fixture => (suites ? suites.has(fixture.suite) : true));

  const results: ScenarioRunResult[] = [];
  for (const fixture of fixtures) {
    const actual = await options.runtime.invoke(fixture.request);
    const satisfactionDetails = computeSatisfactionScore(fixture.expected, actual);
    const satisfactionScore = satisfactionDetails.value;
    const status = probabilisticStatus(satisfactionScore);
    const satisfied = isDeepStrictEqual(actual, fixture.expected);
    const scenarioClass = fixture.scenario_class ?? inferScenarioClass(fixture.expected);

    results.push({
      scenario_id: fixture.scenario_id,
      suite: fixture.suite,
      scenario_class: scenarioClass,
      status,
      satisfaction_score: satisfactionScore,
      satisfaction_details: satisfactionDetails,
      reason: satisfied ? 'response parity matched fixture expectation' : 'response parity mismatch',
      expected_failure_mode: fixture.expected_failure_mode,
      request: fixture.request,
      expected: fixture.expected,
      actual,
    });
  }

  const suitesSummary: Record<ScenarioSuite, ScenarioTotals> = {
    smoke: summarize(results.filter(result => result.suite === 'smoke')),
    regression: summarize(results.filter(result => result.suite === 'regression')),
    holdout: summarize(results.filter(result => result.suite === 'holdout')),
  };

  const scenarioClassSummary: Record<ScenarioClass, ScenarioTotals> = {
    success: summarize(results.filter(result => result.scenario_class === 'success')),
    retryable_failure: summarize(
      results.filter(result => result.scenario_class === 'retryable_failure')
    ),
    terminal_failure: summarize(
      results.filter(result => result.scenario_class === 'terminal_failure')
    ),
  };

  const totals = summarize(results);
  const holdoutRate = suitesSummary.holdout.pass_rate;
  const failureCoverage = summarizeFailureCoverage(results);
  const satisfactionScores = results.map(r => r.satisfaction_score);
  const satisfactionDistribution = computeSatisfactionDistribution(satisfactionScores);

  return {
    schema_version: 'dtu_satisfaction_report.v1',
    generated_at: new Date().toISOString(),
    fixtures_root: resolve(options.fixtures_root),
    totals,
    suites: suitesSummary,
    scenario_class_distribution: scenarioClassSummary,
    holdout_rate: holdoutRate,
    drift_delta: {
      pass_rate: roundRate(totals.pass_rate - (options.baseline?.totals.pass_rate ?? totals.pass_rate)),
      holdout_rate: roundRate(holdoutRate - (options.baseline?.holdout_rate ?? holdoutRate)),
    },
    failure_mode_coverage: failureCoverage,
    satisfaction_distribution: satisfactionDistribution,
    results,
  };
}

function summarize(results: ScenarioRunResult[]): ScenarioTotals {
  const total = results.length;
  const satisfied = results.filter(result => result.status === 'satisfied').length;
  // marginal counts as unsatisfied for pass rate calculation
  const unsatisfied = total - satisfied;
  const passRate = total === 0 ? 0 : roundRate(satisfied / total);
  return {
    total,
    satisfied,
    unsatisfied,
    pass_rate: passRate,
  };
}

function summarizeFailureCoverage(results: ScenarioRunResult[]): Record<FailureMode, boolean> {
  const coverage: Record<FailureMode, boolean> = {
    rate_limit: false,
    auth_failure: false,
    timeout: false,
    malformed_payload: false,
    partial_outage: false,
    not_found: false,
  };

  for (const result of results) {
    if (result.status !== 'satisfied' || !result.expected_failure_mode) {
      continue;
    }
    coverage[result.expected_failure_mode] = true;
  }

  return coverage;
}

export function inferScenarioClass(expected: TwinInvocationResponse): ScenarioClass {
  if (expected.status === 'success') {
    return 'success';
  }

  return expected.error.retryable ? 'retryable_failure' : 'terminal_failure';
}

function roundRate(value: number): number {
  return Number(value.toFixed(6));
}

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}
