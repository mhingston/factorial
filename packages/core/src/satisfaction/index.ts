import type { ScenarioSuite } from '../dtu/scenario-harness.js';
import type { JudgeEvaluation, LlmSatisfactionScore } from './judge.js';

export { evaluateWithJudge, convertToProbabilisticScore, combineScores } from './judge.js';
export type { RubricDimensions, LlmSatisfactionScore, JudgeEvaluation } from './judge.js';

export interface SatisfactionThresholds {
  smoke: number;
  regression: number;
  holdout: number;
  overall: number;
}

export const DEFAULT_SATISFACTION_THRESHOLDS: SatisfactionThresholds = {
  smoke: 0.95,
  regression: 0.90,
  holdout: 0.80,
  overall: 0.85,
};

export interface ScenarioWeight {
  suite: ScenarioSuite;
  weight: number;
}

export const SCENARIO_DIFFICULTY_WEIGHTS: Record<ScenarioSuite, number> = {
  smoke: 1.0,
  regression: 1.5,
  holdout: 2.0,
};

export interface AggregatedSatisfaction {
  overall: number;
  bySuite: Record<ScenarioSuite, number>;
  weightedOverall: number;
  thresholdStatus: Record<ScenarioSuite, boolean>;
  meetsOverallThreshold: boolean;
}

export interface SatisfactionReport {
  schema_version: 'satisfaction_report.v1';
  generated_at: string;
  thresholds: SatisfactionThresholds;
  aggregated: AggregatedSatisfaction;
  scenarios: ScenarioSatisfaction[];
  summary: {
    total: number;
    satisfied: number;
    marginal: number;
    unsatisfied: number;
    pass_rate: number;
  };
}

export interface ScenarioSatisfaction {
  scenario_id: string;
  suite: ScenarioSuite;
  deterministic_score: number;
  llm_score?: LlmSatisfactionScore;
  combined_score: number;
  status: 'satisfied' | 'marginal' | 'unsatisfied';
  weight: number;
  evaluated_at: string;
}

export function aggregateSatisfaction(
  scenarios: ScenarioSatisfaction[],
  thresholds: SatisfactionThresholds = DEFAULT_SATISFACTION_THRESHOLDS
): AggregatedSatisfaction {
  if (scenarios.length === 0) {
    return {
      overall: 0,
      bySuite: { smoke: 0, regression: 0, holdout: 0 },
      weightedOverall: 0,
      thresholdStatus: { smoke: false, regression: false, holdout: false },
      meetsOverallThreshold: false,
    };
  }

  const bySuite = calculateSuiteAverages(scenarios);
  const overall = calculateOverallAverage(scenarios);
  const weightedOverall = calculateWeightedAverage(scenarios);

  return {
    overall,
    bySuite,
    weightedOverall,
    thresholdStatus: {
      smoke: bySuite.smoke >= thresholds.smoke,
      regression: bySuite.regression >= thresholds.regression,
      holdout: bySuite.holdout >= thresholds.holdout,
    },
    meetsOverallThreshold: weightedOverall >= thresholds.overall,
  };
}

function calculateSuiteAverages(
  scenarios: ScenarioSatisfaction[]
): Record<ScenarioSuite, number> {
  const suites: ScenarioSuite[] = ['smoke', 'regression', 'holdout'];
  const result = {} as Record<ScenarioSuite, number>;

  for (const suite of suites) {
    const suiteScenarios = scenarios.filter(s => s.suite === suite);
    if (suiteScenarios.length === 0) {
      result[suite] = 0;
    } else {
      const sum = suiteScenarios.reduce((acc, s) => acc + s.combined_score, 0);
      result[suite] = Math.round((sum / suiteScenarios.length) * 1000) / 1000;
    }
  }

  return result;
}

function calculateOverallAverage(scenarios: ScenarioSatisfaction[]): number {
  const sum = scenarios.reduce((acc, s) => acc + s.combined_score, 0);
  return Math.round((sum / scenarios.length) * 1000) / 1000;
}

function calculateWeightedAverage(scenarios: ScenarioSatisfaction[]): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const scenario of scenarios) {
    const weight = scenario.weight;
    totalWeight += weight;
    weightedSum += scenario.combined_score * weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 1000) / 1000;
}

export function createScenarioSatisfaction(
  scenario_id: string,
  suite: ScenarioSuite,
  deterministic_score: number,
  llm_evaluation?: JudgeEvaluation
): ScenarioSatisfaction {
  const llm_score = llm_evaluation?.score;
  
  // Combine deterministic and LLM scores
  let combined_score = deterministic_score;
  if (llm_score) {
    const llmProbabilistic = (llm_score.overall - 1) / 4;
    combined_score = deterministic_score * 0.5 + llmProbabilistic * 0.5;
  }

  // Normalize to 0-1
  combined_score = Math.max(0, Math.min(1, combined_score));

  // Determine status based on thresholds
  let status: 'satisfied' | 'marginal' | 'unsatisfied';
  if (combined_score >= 0.8) {
    status = 'satisfied';
  } else if (combined_score >= 0.5) {
    status = 'marginal';
  } else {
    status = 'unsatisfied';
  }

  return {
    scenario_id,
    suite,
    deterministic_score,
    llm_score,
    combined_score,
    status,
    weight: SCENARIO_DIFFICULTY_WEIGHTS[suite],
    evaluated_at: llm_evaluation?.evaluatedAt || new Date().toISOString(),
  };
}

export function generateSatisfactionReport(
  scenarios: ScenarioSatisfaction[],
  thresholds: SatisfactionThresholds = DEFAULT_SATISFACTION_THRESHOLDS
): SatisfactionReport {
  const aggregated = aggregateSatisfaction(scenarios, thresholds);
  
  const satisfied = scenarios.filter(s => s.status === 'satisfied').length;
  const marginal = scenarios.filter(s => s.status === 'marginal').length;
  const unsatisfied = scenarios.filter(s => s.status === 'unsatisfied').length;

  return {
    schema_version: 'satisfaction_report.v1',
    generated_at: new Date().toISOString(),
    thresholds,
    aggregated,
    scenarios,
    summary: {
      total: scenarios.length,
      satisfied,
      marginal,
      unsatisfied,
      pass_rate: scenarios.length > 0 ? Math.round((satisfied / scenarios.length) * 1000) / 1000 : 0,
    },
  };
}

export function checkThresholdCompliance(
  report: SatisfactionReport
): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const suite of ['smoke', 'regression', 'holdout'] as ScenarioSuite[]) {
    const suiteScore = report.aggregated.bySuite[suite];
    const threshold = report.thresholds[suite];
    if (suiteScore < threshold) {
      violations.push(`${suite}: ${suiteScore.toFixed(3)} < ${threshold}`);
    }
  }

  if (!report.aggregated.meetsOverallThreshold) {
    violations.push(`overall: ${report.aggregated.weightedOverall.toFixed(3)} < ${report.thresholds.overall}`);
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

export function formatSatisfactionReport(report: SatisfactionReport): string {
  const lines: string[] = [];
  
  lines.push(`Satisfaction Report (${report.schema_version})`);
  lines.push(`Generated: ${report.generated_at}`);
  lines.push('');
  
  lines.push('Thresholds:');
  lines.push(`  Smoke: ${report.thresholds.smoke}`);
  lines.push(`  Regression: ${report.thresholds.regression}`);
  lines.push(`  Holdout: ${report.thresholds.holdout}`);
  lines.push(`  Overall: ${report.thresholds.overall}`);
  lines.push('');
  
  lines.push('Summary:');
  lines.push(`  Total scenarios: ${report.summary.total}`);
  lines.push(`  Satisfied: ${report.summary.satisfied}`);
  lines.push(`  Marginal: ${report.summary.marginal}`);
  lines.push(`  Unsatisfied: ${report.summary.unsatisfied}`);
  lines.push(`  Pass rate: ${(report.summary.pass_rate * 100).toFixed(1)}%`);
  lines.push('');
  
  lines.push('Aggregated Scores:');
  lines.push(`  Overall (unweighted): ${report.aggregated.overall.toFixed(3)}`);
  lines.push(`  Overall (weighted): ${report.aggregated.weightedOverall.toFixed(3)}`);
  lines.push(`  Meets threshold: ${report.aggregated.meetsOverallThreshold ? 'YES' : 'NO'}`);
  lines.push('');
  
  lines.push('By Suite:');
  for (const suite of ['smoke', 'regression', 'holdout'] as const) {
    const score = report.aggregated.bySuite[suite];
    const meets = report.aggregated.thresholdStatus[suite];
    lines.push(`  ${suite}: ${score.toFixed(3)} ${meets ? '✓' : '✗'}`);
  }
  lines.push('');

  const compliance = checkThresholdCompliance(report);
  if (!compliance.compliant) {
    lines.push('Threshold Violations:');
    for (const violation of compliance.violations) {
      lines.push(`  ✗ ${violation}`);
    }
  } else {
    lines.push('All thresholds met ✓');
  }

  return lines.join('\n');
}
