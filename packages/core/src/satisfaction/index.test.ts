import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SATISFACTION_THRESHOLDS,
  SCENARIO_DIFFICULTY_WEIGHTS,
  type ScenarioSatisfaction,
  aggregateSatisfaction,
  checkThresholdCompliance,
  createScenarioSatisfaction,
  formatSatisfactionReport,
  generateSatisfactionReport,
} from './index.js';

describe('satisfaction/index', () => {
  describe('DEFAULT_SATISFACTION_THRESHOLDS', () => {
    it('has correct default thresholds', () => {
      expect(DEFAULT_SATISFACTION_THRESHOLDS.smoke).toBe(0.95);
      expect(DEFAULT_SATISFACTION_THRESHOLDS.regression).toBe(0.90);
      expect(DEFAULT_SATISFACTION_THRESHOLDS.holdout).toBe(0.80);
      expect(DEFAULT_SATISFACTION_THRESHOLDS.overall).toBe(0.85);
    });
  });

  describe('SCENARIO_DIFFICULTY_WEIGHTS', () => {
    it('has correct difficulty weights', () => {
      expect(SCENARIO_DIFFICULTY_WEIGHTS.smoke).toBe(1.0);
      expect(SCENARIO_DIFFICULTY_WEIGHTS.regression).toBe(1.5);
      expect(SCENARIO_DIFFICULTY_WEIGHTS.holdout).toBe(2.0);
    });
  });

  describe('createScenarioSatisfaction', () => {
    it('creates satisfaction without LLM score', () => {
      const satisfaction = createScenarioSatisfaction(
        'test-scenario',
        'smoke',
        0.9,
        undefined
      );

      expect(satisfaction.scenario_id).toBe('test-scenario');
      expect(satisfaction.suite).toBe('smoke');
      expect(satisfaction.deterministic_score).toBe(0.9);
      expect(satisfaction.combined_score).toBe(0.9);
      expect(satisfaction.llm_score).toBeUndefined();
      expect(satisfaction.status).toBe('satisfied');
      expect(satisfaction.weight).toBe(1.0);
    });

    it('classifies as marginal for medium scores', () => {
      const satisfaction = createScenarioSatisfaction(
        'test-scenario',
        'regression',
        0.6,
        undefined
      );

      expect(satisfaction.status).toBe('marginal');
    });

    it('classifies as unsatisfied for low scores', () => {
      const satisfaction = createScenarioSatisfaction(
        'test-scenario',
        'holdout',
        0.3,
        undefined
      );

      expect(satisfaction.status).toBe('unsatisfied');
    });

    it('applies correct suite weights', () => {
      const smoke = createScenarioSatisfaction('s1', 'smoke', 1, undefined);
      const regression = createScenarioSatisfaction('s2', 'regression', 1, undefined);
      const holdout = createScenarioSatisfaction('s3', 'holdout', 1, undefined);

      expect(smoke.weight).toBe(1.0);
      expect(regression.weight).toBe(1.5);
      expect(holdout.weight).toBe(2.0);
    });
  });

  describe('aggregateSatisfaction', () => {
    it('returns zeros for empty array', () => {
      const result = aggregateSatisfaction([]);
      expect(result.overall).toBe(0);
      expect(result.weightedOverall).toBe(0);
      expect(result.bySuite.smoke).toBe(0);
      expect(result.meetsOverallThreshold).toBe(false);
    });

    it('calculates overall average correctly', () => {
      const scenarios: ScenarioSatisfaction[] = [
        createScenarioSatisfaction('s1', 'smoke', 0.8, undefined),
        createScenarioSatisfaction('s2', 'smoke', 0.6, undefined),
      ];

      const result = aggregateSatisfaction(scenarios);
      expect(result.overall).toBeCloseTo(0.7, 3);
    });

    it('calculates suite averages correctly', () => {
      const scenarios: ScenarioSatisfaction[] = [
        createScenarioSatisfaction('s1', 'smoke', 0.9, undefined),
        createScenarioSatisfaction('s2', 'smoke', 0.7, undefined),
        createScenarioSatisfaction('s3', 'regression', 0.8, undefined),
      ];

      const result = aggregateSatisfaction(scenarios);
      expect(result.bySuite.smoke).toBeCloseTo(0.8, 3);
      expect(result.bySuite.regression).toBe(0.8);
      expect(result.bySuite.holdout).toBe(0);
    });

    it('calculates weighted average correctly', () => {
      const scenarios: ScenarioSatisfaction[] = [
        createScenarioSatisfaction('s1', 'smoke', 1.0, undefined),      // weight 1.0
        createScenarioSatisfaction('s2', 'regression', 0.5, undefined), // weight 1.5
      ];

      const result = aggregateSatisfaction(scenarios);
      // (1.0*1.0 + 0.5*1.5) / (1.0 + 1.5) = (1.0 + 0.75) / 2.5 = 0.7
      expect(result.weightedOverall).toBeCloseTo(0.7, 3);
    });

    it('checks threshold compliance correctly', () => {
      const scenarios: ScenarioSatisfaction[] = [
        createScenarioSatisfaction('s1', 'smoke', 0.96, undefined),
        createScenarioSatisfaction('s2', 'regression', 0.91, undefined),
        createScenarioSatisfaction('s3', 'holdout', 0.81, undefined),
      ];

      const result = aggregateSatisfaction(scenarios, DEFAULT_SATISFACTION_THRESHOLDS);
      expect(result.thresholdStatus.smoke).toBe(true);
      expect(result.thresholdStatus.regression).toBe(true);
      expect(result.thresholdStatus.holdout).toBe(true);
      expect(result.meetsOverallThreshold).toBe(true);
    });
  });

  describe('generateSatisfactionReport', () => {
    it('generates report with correct schema version', () => {
      const scenarios = [
        createScenarioSatisfaction('s1', 'smoke', 0.9, undefined),
      ];

      const report = generateSatisfactionReport(scenarios);
      expect(report.schema_version).toBe('satisfaction_report.v1');
      expect(report.generated_at).toBeDefined();
      expect(report.scenarios).toHaveLength(1);
    });

    it('includes summary statistics', () => {
      const scenarios = [
        createScenarioSatisfaction('s1', 'smoke', 0.9, undefined),
        createScenarioSatisfaction('s2', 'smoke', 0.7, undefined),
        createScenarioSatisfaction('s3', 'holdout', 0.4, undefined),
      ];

      const report = generateSatisfactionReport(scenarios);
      expect(report.summary.total).toBe(3);
      expect(report.summary.satisfied).toBe(1);
      expect(report.summary.marginal).toBe(1);
      expect(report.summary.unsatisfied).toBe(1);
      expect(report.summary.pass_rate).toBeCloseTo(0.333, 3);
    });
  });

  describe('checkThresholdCompliance', () => {
    it('returns compliant for passing report', () => {
      const scenarios = [
        createScenarioSatisfaction('s1', 'smoke', 0.96, undefined),
        createScenarioSatisfaction('s2', 'regression', 0.91, undefined),
        createScenarioSatisfaction('s3', 'holdout', 0.81, undefined),
      ];

      const report = generateSatisfactionReport(scenarios, DEFAULT_SATISFACTION_THRESHOLDS);
      const compliance = checkThresholdCompliance(report);
      expect(compliance.compliant).toBe(true);
      expect(compliance.violations).toHaveLength(0);
    });

    it('returns violations for failing suites', () => {
      const scenarios = [
        createScenarioSatisfaction('s1', 'smoke', 0.90, undefined),  // Below 0.95
        createScenarioSatisfaction('s2', 'regression', 0.85, undefined),  // Below 0.90
        createScenarioSatisfaction('s3', 'holdout', 0.75, undefined),  // Below 0.80
      ];

      const report = generateSatisfactionReport(scenarios, DEFAULT_SATISFACTION_THRESHOLDS);
      const compliance = checkThresholdCompliance(report);
      expect(compliance.compliant).toBe(false);
      expect(compliance.violations.length).toBeGreaterThan(0);
    });
  });

  describe('formatSatisfactionReport', () => {
    it('formats report as string', () => {
      const scenarios = [
        createScenarioSatisfaction('s1', 'smoke', 0.96, undefined),
      ];

      const report = generateSatisfactionReport(scenarios);
      const formatted = formatSatisfactionReport(report);

      expect(formatted).toContain('Satisfaction Report');
      expect(formatted).toContain('satisfaction_report.v1');
      expect(formatted).toContain('Total scenarios: 1');
      expect(formatted).toContain('smoke:');
    });

    it('shows violations when present', () => {
      const scenarios = [
        createScenarioSatisfaction('s1', 'smoke', 0.50, undefined),
      ];

      const report = generateSatisfactionReport(scenarios, DEFAULT_SATISFACTION_THRESHOLDS);
      const formatted = formatSatisfactionReport(report);

      expect(formatted).toContain('Threshold Violations:');
      expect(formatted).toContain('smoke:');
    });
  });
});
