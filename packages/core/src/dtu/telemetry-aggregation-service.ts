import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { FullAutonomyTelemetrySource } from './full-autonomy-telemetry.js';

export interface DailyRunOutcome {
  run_id: string;
  category: string;
  status: 'success' | 'fail';
  escalations_count: number;
  ood_detected: boolean;
  self_healing_triggered: boolean;
  circuit_breaker_triggered: boolean;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  metadata?: Record<string, unknown>;
}

export interface AnomalyThresholds {
  max_escalation_rate: number;
  max_ood_rate: number;
  max_failure_rate: number;
  min_daily_runs: number;
  max_consecutive_failures: number;
}

export interface DetectedAnomaly {
  id: string;
  type: 'escalation_spike' | 'ood_spike' | 'failure_spike' | 'insufficient_data' | 'consecutive_failures';
  severity: 'warning' | 'critical';
  detected_at: string;
  description: string;
  metric_value: number;
  threshold_value: number;
  affected_runs: string[];
}

export interface TelemetryAggregate {
  date: string;
  runs: DailyRunOutcome[];
  summary: {
    total_runs: number;
    success_count: number;
    failure_count: number;
    escalation_count: number;
    ood_count: number;
    self_healing_count: number;
    circuit_breaker_count: number;
    avg_duration_ms: number;
  };
  anomalies: DetectedAnomaly[];
  ci_signature?: string;
}

export const fullAutonomyBurnInReportSchema = z.object({
  schema_version: z.literal('full_autonomy_burn_in_report.v1'),
  generated_at: z.string().datetime(),
  window: z.object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    total_days: z.number().int().min(1).max(30),
  }),
  ci_attestation: z.object({
    runner_id: z.string(),
    signature: z.string(),
    signed_at: z.string().datetime(),
  }),
  aggregate_summary: z.object({
    total_runs: z.number().int().nonnegative(),
    zero_escalation_rate: z.number().min(0).max(1),
    ood_rate: z.number().min(0).max(1),
    self_healing_rate: z.number().min(0).max(1),
    circuit_breaker_rate: z.number().min(0).max(1),
    success_rate: z.number().min(0).max(1),
    avg_daily_runs: z.number().min(0),
    categories_covered: z.number().int().nonnegative(),
    days_with_data: z.number().int().min(0).max(30),
    days_with_gaps: z.number().int().min(0).max(30),
  }),
  daily_aggregates: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    total_runs: z.number().int().nonnegative(),
    success_count: z.number().int().nonnegative(),
    failure_count: z.number().int().nonnegative(),
    escalation_count: z.number().int().nonnegative(),
    ood_count: z.number().int().nonnegative(),
    self_healing_count: z.number().int().nonnegative(),
    circuit_breaker_count: z.number().int().nonnegative(),
    avg_duration_ms: z.number().nonnegative(),
    has_anomaly: z.boolean(),
  })),
  anomalies: z.array(z.object({
    id: z.string(),
    type: z.enum(['escalation_spike', 'ood_spike', 'failure_spike', 'insufficient_data', 'consecutive_failures']),
    severity: z.enum(['warning', 'critical']),
    detected_at: z.string().datetime(),
    description: z.string(),
    metric_value: z.number(),
    threshold_value: z.number(),
    affected_runs: z.array(z.string()),
  })),
  thresholds: z.object({
    max_escalation_rate: z.number().min(0).max(1),
    max_ood_rate: z.number().min(0).max(1),
    max_failure_rate: z.number().min(0).max(1),
    min_daily_runs: z.number().int().positive(),
    max_consecutive_failures: z.number().int().positive(),
  }),
  checks: z.array(z.object({
    id: z.string(),
    status: z.enum(['pass', 'fail']),
    summary: z.string(),
  })),
  validation: z.object({
    passed: z.boolean(),
    checks: z.array(z.object({
      id: z.string(),
      status: z.enum(['pass', 'fail']),
      summary: z.string(),
    })),
  }),
  burn_in_status: z.enum(['pass', 'fail']),
});

export type FullAutonomyBurnInReport = z.infer<typeof fullAutonomyBurnInReportSchema>;

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  max_escalation_rate: 0.05,
  max_ood_rate: 0.02,
  max_failure_rate: 0.10,
  min_daily_runs: 1,
  max_consecutive_failures: 3,
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function generateCISignature(payload: string, runnerId: string): string {
  const timestamp = new Date().toISOString();
  const data = `${payload}:${runnerId}:${timestamp}`;
  return createHash('sha256').update(data).digest('hex');
}

function getRunnerId(): string {
  return process.env.GITHUB_RUN_ID 
    || process.env.CI_RUNNER_ID 
    || process.env.HOSTNAME 
    || 'local-runner';
}

export class TelemetryAggregationService {
  private storagePath: string;
  private thresholds: AnomalyThresholds;
  private retryQueue: Array<{ attempt: number; maxAttempts: number; operation: () => Promise<void> }> = [];
  private isProcessingQueue = false;

  constructor(storagePath: string, thresholds?: Partial<AnomalyThresholds>) {
    this.storagePath = storagePath;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  async initialize(): Promise<void> {
    await mkdir(this.storagePath, { recursive: true });
    this.startRetryQueueProcessor();
  }

  private startRetryQueueProcessor(): void {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    
    // Use a more frequent check interval for responsiveness
    setInterval(async () => {
      await this.processQueue();
    }, 100);
  }

  private async processQueue(): Promise<void> {
    if (this.retryQueue.length === 0) return;
    
    const item = this.retryQueue.shift();
    if (!item) return;
    
    try {
      await item.operation();
    } catch (error) {
      if (item.attempt < item.maxAttempts) {
        const delay = Math.pow(2, item.attempt) * 1000;
        setTimeout(() => {
          this.retryQueue.push({
            ...item,
            attempt: item.attempt + 1,
          });
        }, delay);
      }
    }
  }

  async flush(): Promise<void> {
    // Process all pending items in the queue
    while (this.retryQueue.length > 0) {
      await this.processQueue();
    }
  }

  async recordRunOutcome(outcome: DailyRunOutcome): Promise<void> {
    const date = formatDate(new Date(outcome.started_at));
    const datePath = join(this.storagePath, `${date}.json`);

    const operation = async () => {
      let aggregate: TelemetryAggregate;
      
      try {
        const existing = await readFile(datePath, 'utf-8');
        aggregate = JSON.parse(existing) as TelemetryAggregate;
      } catch {
        aggregate = {
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
      }

      aggregate.runs.push(outcome);
      this.updateSummary(aggregate);
      this.detectAnomalies(aggregate);
      
      await mkdir(dirname(datePath), { recursive: true });
      await writeFile(datePath, JSON.stringify(aggregate, null, 2));
    };

    this.retryQueue.push({
      attempt: 0,
      maxAttempts: 3,
      operation,
    });
  }

  private updateSummary(aggregate: TelemetryAggregate): void {
    const runs = aggregate.runs;
    const totalDuration = runs.reduce((sum, run) => sum + run.duration_ms, 0);
    
    aggregate.summary = {
      total_runs: runs.length,
      success_count: runs.filter(r => r.status === 'success').length,
      failure_count: runs.filter(r => r.status === 'fail').length,
      escalation_count: runs.filter(r => r.escalations_count > 0).length,
      ood_count: runs.filter(r => r.ood_detected).length,
      self_healing_count: runs.filter(r => r.self_healing_triggered).length,
      circuit_breaker_count: runs.filter(r => r.circuit_breaker_triggered).length,
      avg_duration_ms: runs.length > 0 ? totalDuration / runs.length : 0,
    };
  }

  private detectAnomalies(aggregate: TelemetryAggregate): void {
    const summary = aggregate.summary;
    const newAnomalies: DetectedAnomaly[] = [];

    if (summary.total_runs > 0) {
      const escalationRate = summary.escalation_count / summary.total_runs;
      if (escalationRate > this.thresholds.max_escalation_rate) {
        newAnomalies.push({
          id: randomUUID(),
          type: 'escalation_spike',
          severity: 'critical',
          detected_at: new Date().toISOString(),
          description: `Escalation rate ${(escalationRate * 100).toFixed(1)}% exceeds threshold ${(this.thresholds.max_escalation_rate * 100).toFixed(1)}%`,
          metric_value: escalationRate,
          threshold_value: this.thresholds.max_escalation_rate,
          affected_runs: aggregate.runs.filter(r => r.escalations_count > 0).map(r => r.run_id),
        });
      }

      const oodRate = summary.ood_count / summary.total_runs;
      if (oodRate > this.thresholds.max_ood_rate) {
        newAnomalies.push({
          id: randomUUID(),
          type: 'ood_spike',
          severity: 'critical',
          detected_at: new Date().toISOString(),
          description: `OOD detection rate ${(oodRate * 100).toFixed(1)}% exceeds threshold ${(this.thresholds.max_ood_rate * 100).toFixed(1)}%`,
          metric_value: oodRate,
          threshold_value: this.thresholds.max_ood_rate,
          affected_runs: aggregate.runs.filter(r => r.ood_detected).map(r => r.run_id),
        });
      }

      const failureRate = summary.failure_count / summary.total_runs;
      if (failureRate > this.thresholds.max_failure_rate) {
        newAnomalies.push({
          id: randomUUID(),
          type: 'failure_spike',
          severity: 'warning',
          detected_at: new Date().toISOString(),
          description: `Failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(this.thresholds.max_failure_rate * 100).toFixed(1)}%`,
          metric_value: failureRate,
          threshold_value: this.thresholds.max_failure_rate,
          affected_runs: aggregate.runs.filter(r => r.status === 'fail').map(r => r.run_id),
        });
      }
    }

    if (summary.total_runs < this.thresholds.min_daily_runs) {
      newAnomalies.push({
        id: randomUUID(),
        type: 'insufficient_data',
        severity: 'warning',
        detected_at: new Date().toISOString(),
        description: `Only ${summary.total_runs} runs recorded (minimum: ${this.thresholds.min_daily_runs})`,
        metric_value: summary.total_runs,
        threshold_value: this.thresholds.min_daily_runs,
        affected_runs: [],
      });
    }

    let consecutiveFailures = 0;
    for (const run of aggregate.runs) {
      if (run.status === 'fail') {
        consecutiveFailures++;
        if (consecutiveFailures >= this.thresholds.max_consecutive_failures) {
          newAnomalies.push({
            id: randomUUID(),
            type: 'consecutive_failures',
            severity: 'critical',
            detected_at: new Date().toISOString(),
            description: `${consecutiveFailures} consecutive failures detected`,
            metric_value: consecutiveFailures,
            threshold_value: this.thresholds.max_consecutive_failures,
            affected_runs: aggregate.runs.slice(-consecutiveFailures).map(r => r.run_id),
          });
          break;
        }
      } else {
        consecutiveFailures = 0;
      }
    }

    aggregate.anomalies = [...aggregate.anomalies, ...newAnomalies];
  }

  async generateBurnInReport(days: number = 30): Promise<FullAutonomyBurnInReport> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    
    const dailyAggregates: Array<{
      date: string;
      total_runs: number;
      success_count: number;
      failure_count: number;
      escalation_count: number;
      ood_count: number;
      self_healing_count: number;
      circuit_breaker_count: number;
      avg_duration_ms: number;
      has_anomaly: boolean;
    }> = [];
    
    const allAnomalies: DetectedAnomaly[] = [];
    const allRuns: DailyRunOutcome[] = [];
    const categories = new Set<string>();

    let daysWithData = 0;
    let daysWithGaps = 0;

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = formatDate(currentDate);
      const datePath = join(this.storagePath, `${dateStr}.json`);

      try {
        const data = await readFile(datePath, 'utf-8');
        const aggregate = JSON.parse(data) as TelemetryAggregate;
        
        dailyAggregates.push({
          date: dateStr,
          total_runs: aggregate.summary.total_runs,
          success_count: aggregate.summary.success_count,
          failure_count: aggregate.summary.failure_count,
          escalation_count: aggregate.summary.escalation_count,
          ood_count: aggregate.summary.ood_count,
          self_healing_count: aggregate.summary.self_healing_count,
          circuit_breaker_count: aggregate.summary.circuit_breaker_count,
          avg_duration_ms: aggregate.summary.avg_duration_ms,
          has_anomaly: aggregate.anomalies.length > 0,
        });

        allAnomalies.push(...aggregate.anomalies);
        allRuns.push(...aggregate.runs);
        aggregate.runs.forEach(run => categories.add(run.category));
        daysWithData++;
      } catch {
        daysWithGaps++;
        dailyAggregates.push({
          date: dateStr,
          total_runs: 0,
          success_count: 0,
          failure_count: 0,
          escalation_count: 0,
          ood_count: 0,
          self_healing_count: 0,
          circuit_breaker_count: 0,
          avg_duration_ms: 0,
          has_anomaly: false,
        });
      }
    }

    const totalRuns = allRuns.length;
    const escalationCount = allRuns.filter(r => r.escalations_count > 0).length;
    const oodCount = allRuns.filter(r => r.ood_detected).length;
    const selfHealingCount = allRuns.filter(r => r.self_healing_triggered).length;
    const circuitBreakerCount = allRuns.filter(r => r.circuit_breaker_triggered).length;
    const successCount = allRuns.filter(r => r.status === 'success').length;

    const aggregateSummary = {
      total_runs: totalRuns,
      zero_escalation_rate: totalRuns > 0 ? 1 - (escalationCount / totalRuns) : 0,
      ood_rate: totalRuns > 0 ? oodCount / totalRuns : 0,
      self_healing_rate: totalRuns > 0 ? selfHealingCount / totalRuns : 0,
      circuit_breaker_rate: totalRuns > 0 ? circuitBreakerCount / totalRuns : 0,
      success_rate: totalRuns > 0 ? successCount / totalRuns : 0,
      avg_daily_runs: daysWithData > 0 ? totalRuns / daysWithData : 0,
      categories_covered: categories.size,
      days_with_data: daysWithData,
      days_with_gaps: daysWithGaps,
    };

    const hasEscalationSpike = allAnomalies.some(a => a.type === 'escalation_spike');
    const hasOODSpike = allAnomalies.some(a => a.type === 'ood_spike');
    const hasFailureSpike = allAnomalies.some(a => a.type === 'failure_spike');
    const hasConsecutiveFailures = allAnomalies.some(a => a.type === 'consecutive_failures');

    const checks = [
      {
        id: 'BURN-IN-WINDOW',
        status: (daysWithData >= 30 ? 'pass' : 'fail') as 'pass' | 'fail',
        summary: daysWithData >= 30 
          ? `Complete 30-day window with data for ${daysWithData} days`
          : `Incomplete window: only ${daysWithData} days of data (required: 30)`,
      },
      {
        id: 'BURN-IN-GAPS',
        status: (daysWithGaps <= 5 ? 'pass' : 'fail') as 'pass' | 'fail',
        summary: daysWithGaps <= 5
          ? `Acceptable data gaps: ${daysWithGaps} days`
          : `Excessive data gaps: ${daysWithGaps} days (max: 5)`,
      },
      {
        id: 'BURN-IN-ESCALATION',
        status: (!hasEscalationSpike ? 'pass' : 'fail') as 'pass' | 'fail',
        summary: !hasEscalationSpike
          ? 'No escalation rate anomalies detected'
          : 'Escalation rate anomalies detected',
      },
      {
        id: 'BURN-IN-OOD',
        status: (!hasOODSpike ? 'pass' : 'fail') as 'pass' | 'fail',
        summary: !hasOODSpike
          ? 'No OOD detection anomalies detected'
          : 'OOD detection anomalies detected',
      },
      {
        id: 'BURN-IN-FAILURES',
        status: (!hasFailureSpike && !hasConsecutiveFailures ? 'pass' : 'fail') as 'pass' | 'fail',
        summary: !hasFailureSpike && !hasConsecutiveFailures
          ? 'No failure anomalies detected'
          : hasConsecutiveFailures
            ? 'Consecutive failure anomaly detected'
            : 'Failure rate anomaly detected',
      },
      {
        id: 'BURN-IN-CATEGORIES',
        status: (categories.size >= 2 ? 'pass' : 'fail') as 'pass' | 'fail',
        summary: categories.size >= 2
          ? `Multiple categories covered: ${categories.size}`
          : `Insufficient category coverage: ${categories.size} (min: 2)`,
      },
    ];

    const validationPassed = checks.every(c => c.status === 'pass');

    const runnerId = getRunnerId();
    const payload = JSON.stringify({
      aggregate_summary: aggregateSummary,
      daily_aggregates: dailyAggregates,
      generated_at: new Date().toISOString(),
    });
    const signature = generateCISignature(payload, runnerId);

    return {
      schema_version: 'full_autonomy_burn_in_report.v1',
      generated_at: new Date().toISOString(),
      window: {
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        total_days: days,
      },
      ci_attestation: {
        runner_id: runnerId,
        signature,
        signed_at: new Date().toISOString(),
      },
      aggregate_summary: aggregateSummary,
      daily_aggregates: dailyAggregates,
      anomalies: allAnomalies.map(a => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        detected_at: a.detected_at,
        description: a.description,
        metric_value: a.metric_value,
        threshold_value: a.threshold_value,
        affected_runs: a.affected_runs,
      })),
      thresholds: this.thresholds,
      checks,
      validation: {
        passed: validationPassed,
        checks,
      },
      burn_in_status: validationPassed ? 'pass' : 'fail',
    };
  }

  async importFromTelemetrySource(source: FullAutonomyTelemetrySource): Promise<void> {
    for (const run of source.runs) {
      const startedAt = new Date(run.started_at);
      const endedAt = new Date(run.ended_at);
      
      const outcome: DailyRunOutcome = {
        run_id: run.run_id,
        category: run.category,
        status: run.status,
        escalations_count: run.escalations_count,
        ood_detected: run.ood_detected,
        self_healing_triggered: false,
        circuit_breaker_triggered: false,
        started_at: run.started_at,
        ended_at: run.ended_at,
        duration_ms: endedAt.getTime() - startedAt.getTime(),
      };

      await this.recordRunOutcome(outcome);
    }
  }

  async listAvailableDates(): Promise<string[]> {
    try {
      const files = await readdir(this.storagePath);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
        .sort();
    } catch {
      return [];
    }
  }
}

export function createTelemetryAggregationService(
  storagePath: string,
  thresholds?: Partial<AnomalyThresholds>
): TelemetryAggregationService {
  const service = new TelemetryAggregationService(storagePath, thresholds);
  void service.initialize();
  return service;
}

export function validateBurnInReport(report: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    fullAutonomyBurnInReportSchema.parse(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      for (const issue of error.errors) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`);
      }
    } else {
      errors.push(String(error));
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function recordRunOutcomeFireAndForget(
  service: TelemetryAggregationService,
  outcome: DailyRunOutcome
): Promise<void> {
  void service.recordRunOutcome(outcome).catch(() => {
    // Silently fail - telemetry should never block execution
  });
}
