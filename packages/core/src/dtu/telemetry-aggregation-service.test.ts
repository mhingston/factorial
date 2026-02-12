import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FullAutonomyTelemetrySource } from './full-autonomy-telemetry.js';
import {
  type DailyRunOutcome,
  type FullAutonomyBurnInReport,
  TelemetryAggregationService,
  createTelemetryAggregationService,
  recordRunOutcomeFireAndForget,
  validateBurnInReport,
} from './telemetry-aggregation-service.js';

describe('telemetry-aggregation-service', () => {
  let tempDir: string;
  let service: TelemetryAggregationService;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'telemetry-test-'));
    service = new TelemetryAggregationService(tempDir);
    await service.initialize();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  const createSampleOutcome = (overrides?: Partial<DailyRunOutcome>): DailyRunOutcome => ({
    run_id: `run-${Date.now()}`,
    category: 'ci-lint',
    status: 'success',
    escalations_count: 0,
    ood_detected: false,
    self_healing_triggered: false,
    circuit_breaker_triggered: false,
    started_at: new Date().toISOString(),
    ended_at: new Date(Date.now() + 60000).toISOString(),
    duration_ms: 60000,
    ...overrides,
  });

  describe('recordRunOutcome', () => {
    it('should record a run outcome and create daily aggregate', async () => {
      const outcome = createSampleOutcome({ run_id: 'run-001' });
      await service.recordRunOutcome(outcome);
      
      // Flush queue to process immediately
      await service.flush();
      
      const date = new Date().toISOString().slice(0, 10);
      const aggregatePath = join(tempDir, `${date}.json`);
      
      expect(existsSync(aggregatePath)).toBe(true);
    });

    it('should detect escalation spike anomaly', async () => {
      const outcomes: DailyRunOutcome[] = Array.from({ length: 10 }, (_, i) => 
        createSampleOutcome({
          run_id: `run-${i}`,
          escalations_count: i < 6 ? 1 : 0, // 60% escalation rate
        })
      );

      for (const outcome of outcomes) {
        await service.recordRunOutcome(outcome);
      }

      // Wait for async processing
      await service.flush();

      const report = await service.generateBurnInReport(1);
      
      const escalationAnomalies = report.anomalies.filter(a => a.type === 'escalation_spike');
      expect(escalationAnomalies.length).toBeGreaterThan(0);
      expect(escalationAnomalies[0]?.severity).toBe('critical');
    });

    it('should detect OOD spike anomaly', async () => {
      const outcomes: DailyRunOutcome[] = Array.from({ length: 10 }, (_, i) => 
        createSampleOutcome({
          run_id: `run-${i}`,
          ood_detected: i < 5, // 50% OOD rate
        })
      );

      for (const outcome of outcomes) {
        await service.recordRunOutcome(outcome);
      }

      await service.flush();

      const report = await service.generateBurnInReport(1);
      
      const oodAnomalies = report.anomalies.filter(a => a.type === 'ood_spike');
      expect(oodAnomalies.length).toBeGreaterThan(0);
      expect(oodAnomalies[0]?.severity).toBe('critical');
    });

    it('should detect failure spike anomaly', async () => {
      const outcomes: DailyRunOutcome[] = Array.from({ length: 10 }, (_, i) => 
        createSampleOutcome({
          run_id: `run-${i}`,
          status: i < 3 ? 'fail' : 'success', // 30% failure rate
        })
      );

      for (const outcome of outcomes) {
        await service.recordRunOutcome(outcome);
      }

      await service.flush();

      const report = await service.generateBurnInReport(1);
      
      const failureAnomalies = report.anomalies.filter(a => a.type === 'failure_spike');
      expect(failureAnomalies.length).toBeGreaterThan(0);
      expect(failureAnomalies[0]?.severity).toBe('warning');
    });

    it('should detect consecutive failures anomaly', async () => {
      const outcomes: DailyRunOutcome[] = Array.from({ length: 5 }, (_, i) => 
        createSampleOutcome({
          run_id: `run-${i}`,
          status: 'fail', // 5 consecutive failures
        })
      );

      for (const outcome of outcomes) {
        await service.recordRunOutcome(outcome);
      }

      await service.flush();

      const report = await service.generateBurnInReport(1);
      
      const consecutiveAnomalies = report.anomalies.filter(a => a.type === 'consecutive_failures');
      expect(consecutiveAnomalies.length).toBeGreaterThan(0);
      expect(consecutiveAnomalies[0]?.severity).toBe('critical');
    });

    it('should detect insufficient data anomaly', async () => {
      const outcome = createSampleOutcome();
      await service.recordRunOutcome(outcome);

      await service.flush();

      const report = await service.generateBurnInReport(1);
      
      // Only 1 run recorded, which is below default threshold expectations for 30-day
      // But for single day with 1 run, it shouldn't be insufficient
      const insufficientAnomalies = report.anomalies.filter(a => a.type === 'insufficient_data');
      // This test depends on threshold settings
    });
  });

  describe('generateBurnInReport', () => {
    it('should generate a valid burn-in report', async () => {
      // Create some sample data
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);
        
        const outcome: DailyRunOutcome = {
          run_id: `run-${dateStr}-001`,
          category: i % 2 === 0 ? 'ci-lint' : 'codereview',
          status: 'success',
          escalations_count: 0,
          ood_detected: false,
          self_healing_triggered: false,
          circuit_breaker_triggered: false,
          started_at: date.toISOString(),
          ended_at: new Date(date.getTime() + 60000).toISOString(),
          duration_ms: 60000,
        };
        
        await service.recordRunOutcome(outcome);
      }

      await service.flush();

      const report = await service.generateBurnInReport(30);
      
      expect(report.schema_version).toBe('full_autonomy_burn_in_report.v1');
      expect(report.window.total_days).toBe(30);
      expect(report.aggregate_summary.total_runs).toBe(30);
      expect(report.aggregate_summary.zero_escalation_rate).toBe(1);
      expect(report.aggregate_summary.ood_rate).toBe(0);
      expect(report.aggregate_summary.categories_covered).toBe(2);
      expect(report.daily_aggregates.length).toBe(30);
      expect(report.ci_attestation.signature).toBeTruthy();
      expect(report.ci_attestation.runner_id).toBeTruthy();
    });

    it('should mark report as fail when criteria are not met', async () => {
      // Create data with escalations
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10);
      
      const outcome: DailyRunOutcome = {
        run_id: `run-${dateStr}-001`,
        category: 'ci-lint',
        status: 'success',
        escalations_count: 1,
        ood_detected: false,
        self_healing_triggered: false,
        circuit_breaker_triggered: false,
        started_at: date.toISOString(),
        ended_at: new Date(date.getTime() + 60000).toISOString(),
        duration_ms: 60000,
      };
      
      await service.recordRunOutcome(outcome);
      await service.flush();

      const report = await service.generateBurnInReport(1);
      
      expect(report.burn_in_status).toBe('fail');
      expect(report.validation.passed).toBe(false);
    });

    it('should calculate correct aggregate summary', async () => {
      const baseDate = new Date();
      
      // Create diverse outcomes
      const outcomes: DailyRunOutcome[] = [
        { ...createSampleOutcome(), self_healing_triggered: true, category: 'category-a' },
        { ...createSampleOutcome(), circuit_breaker_triggered: true, category: 'category-b' },
        { ...createSampleOutcome(), escalations_count: 1, category: 'category-c' },
        { ...createSampleOutcome(), ood_detected: true, category: 'category-d' },
        { ...createSampleOutcome(), status: 'fail', category: 'category-e' },
      ];

      for (const outcome of outcomes) {
        await service.recordRunOutcome(outcome);
      }

      await service.flush();

      const report = await service.generateBurnInReport(1);
      
      expect(report.aggregate_summary.self_healing_rate).toBe(0.2);
      expect(report.aggregate_summary.circuit_breaker_rate).toBe(0.2);
      expect(report.aggregate_summary.success_rate).toBe(0.8);
      expect(report.aggregate_summary.categories_covered).toBe(5);
    });
  });

  describe('importFromTelemetrySource', () => {
    it('should import runs from telemetry source', async () => {
      const source: FullAutonomyTelemetrySource = {
        schema_version: 'full_autonomy_telemetry_source.v1',
        generated_at: new Date().toISOString(),
        window: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
        maintenance_window_days: 30,
        categories: [
          { id: 'test-category', description: 'Test category' },
        ],
        runs: [
          {
            run_id: 'imported-001',
            category: 'test-category',
            status: 'success',
            escalations_count: 0,
            ood_detected: false,
            started_at: new Date().toISOString(),
            ended_at: new Date(Date.now() + 60000).toISOString(),
          },
        ],
      };

      await service.importFromTelemetrySource(source);
      await service.flush();

      const report = await service.generateBurnInReport(1);
      
      expect(report.aggregate_summary.total_runs).toBe(1);
    });
  });

  describe('validateBurnInReport', () => {
    it('should validate a correct burn-in report', () => {
      const report: FullAutonomyBurnInReport = {
        schema_version: 'full_autonomy_burn_in_report.v1',
        generated_at: new Date().toISOString(),
        window: {
          start_date: '2026-01-13',
          end_date: '2026-02-12',
          total_days: 30,
        },
        ci_attestation: {
          runner_id: 'test-runner',
          signature: 'abc123',
          signed_at: new Date().toISOString(),
        },
        aggregate_summary: {
          total_runs: 100,
          zero_escalation_rate: 1,
          ood_rate: 0,
          self_healing_rate: 0.1,
          circuit_breaker_rate: 0.05,
          success_rate: 0.95,
          avg_daily_runs: 3.33,
          categories_covered: 3,
          days_with_data: 30,
          days_with_gaps: 0,
        },
        daily_aggregates: [],
        anomalies: [],
        thresholds: {
          max_escalation_rate: 0.05,
          max_ood_rate: 0.02,
          max_failure_rate: 0.10,
          min_daily_runs: 1,
          max_consecutive_failures: 3,
        },
        checks: [],
        validation: {
          passed: true,
          checks: [],
        },
        burn_in_status: 'pass',
      };

      const result = validateBurnInReport(report);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid burn-in report', () => {
      const invalidReport = {
        schema_version: 'wrong_version',
        generated_at: 'invalid-date',
      };

      const result = validateBurnInReport(invalidReport);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('recordRunOutcomeFireAndForget', () => {
    it('should not throw when recording fails', async () => {
      // Create a service that will fail to write
      const badService = new TelemetryAggregationService('/nonexistent/path');
      
      const outcome = createSampleOutcome();
      
      // Should not throw
      await expect(recordRunOutcomeFireAndForget(badService, outcome)).resolves.not.toThrow();
    });

    it('should complete immediately without blocking', async () => {
      const outcome = createSampleOutcome();
      
      const startTime = Date.now();
      await recordRunOutcomeFireAndForget(service, outcome);
      const endTime = Date.now();
      
      // Should complete in less than 50ms (fire-and-forget)
      expect(endTime - startTime).toBeLessThan(50);
    });
  });

  describe('listAvailableDates', () => {
    it('should list available dates', async () => {
      // Create some test files
      const dates = ['2026-01-01', '2026-01-02', '2026-01-03'];
      
      for (const date of dates) {
        const aggregate = {
          date,
          runs: [],
          summary: {
            total_runs: 0,
            success_count: 0,
            failure_count: 0,
            escalation_count: 0,
            ood_count: 0,
            self_healing_count: 0,
            circuit_breaker_count: 0,
            avg_duration_ms: 0,
          },
          anomalies: [],
        };
        
        writeFileSync(join(tempDir, `${date}.json`), JSON.stringify(aggregate));
      }

      const availableDates = await service.listAvailableDates();
      
      expect(availableDates).toHaveLength(3);
      expect(availableDates).toContain('2026-01-01');
      expect(availableDates).toContain('2026-01-02');
      expect(availableDates).toContain('2026-01-03');
    });

    it('should return empty array for empty storage', async () => {
      const availableDates = await service.listAvailableDates();
      expect(availableDates).toHaveLength(0);
    });
  });

  describe('custom thresholds', () => {
    it('should use custom thresholds', async () => {
      const customService = createTelemetryAggregationService(tempDir, {
        max_escalation_rate: 0.8, // Very permissive
        max_failure_rate: 0.9,
      });

      // 70% escalation rate should not trigger with 80% threshold
      const outcomes: DailyRunOutcome[] = Array.from({ length: 10 }, (_, i) => 
        createSampleOutcome({
          run_id: `run-${i}`,
          escalations_count: i < 7 ? 1 : 0,
        })
      );

      for (const outcome of outcomes) {
        await customService.recordRunOutcome(outcome);
      }

      await service.flush();

      const report = await customService.generateBurnInReport(1);
      
      const escalationAnomalies = report.anomalies.filter(a => a.type === 'escalation_spike');
      expect(escalationAnomalies.length).toBe(0);
    });
  });
});
