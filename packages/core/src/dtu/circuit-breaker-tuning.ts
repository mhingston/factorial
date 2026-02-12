import { z } from 'zod';
import type { CircuitBreakerConfig, CircuitBreakerMetrics } from './circuit-breaker.js';

export const anomalyThresholdSchema = z.object({
  mean: z.number(),
  std_dev: z.number(),
  threshold_multiplier: z.number().positive().default(3.0),
  min_samples: z.number().int().positive().default(30),
});

export type AnomalyThreshold = z.infer<typeof anomalyThresholdSchema>;

export const tunedThresholdSchema = z.object({
  failure_threshold: z.number().int().positive(),
  success_threshold: z.number().int().positive(),
  timeout_ms: z.number().int().positive(),
  half_open_max_calls: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  recommended_at: z.string().datetime(),
  basis: z.enum(['historical', 'anomaly', 'baseline', 'manual']),
});

export type TunedThreshold = z.infer<typeof tunedThresholdSchema>;

export interface TimeSeriesPoint {
  timestamp_ms: number;
  failure_rate: number;
  success_rate: number;
  total_calls: number;
  error_pattern?: string;
}

export interface ErrorPattern {
  pattern_id: string;
  error_type: string;
  frequency: number;
  time_window_ms: number;
  correlation_score: number;
  cascading_impact: number;
}

export interface AnomalyDetectionResult {
  is_anomaly: boolean;
  confidence: number;
  anomaly_type: 'spike' | 'trend' | 'pattern' | 'cascade' | 'none';
  severity: 'low' | 'medium' | 'high' | 'critical';
  trigger_metric: string;
  trigger_value: number;
  baseline_value: number;
  deviation_sigma: number;
  recommended_action: 'tune_up' | 'tune_down' | 'escalate' | 'monitor';
}

export interface CircuitBreakerTelemetry {
  breaker_name: string;
  timestamp_ms: number;
  metrics: CircuitBreakerMetrics;
  context?: Record<string, unknown>;
}

export interface TuningRecommendation {
  breaker_name: string;
  current_config: CircuitBreakerConfig;
  recommended_config: Partial<CircuitBreakerConfig>;
  confidence: number;
  rationale: string[];
  risk_level: 'low' | 'medium' | 'high';
  expected_improvement: {
    failure_reduction_percent: number;
    recovery_time_improvement_percent: number;
  };
}

export interface TuningReport {
  schema_version: 'circuit_breaker_tuning_report.v1';
  generated_at: string;
  window_start: string;
  window_end: string;
  total_breakers: number;
  breakers_tuned: number;
  anomalies_detected: number;
  escalations_required: number;
  recommendations: TuningRecommendation[];
  anomaly_summary: {
    spike_count: number;
    trend_count: number;
    pattern_count: number;
    cascade_count: number;
  };
  statistical_summary: {
    avg_failure_rate: number;
    avg_recovery_time_ms: number;
    total_state_transitions: number;
    total_rejections: number;
  };
}

export class CircuitBreakerTuner {
  private telemetryHistory: Map<string, CircuitBreakerTelemetry[]> = new Map();
  private errorPatterns: Map<string, ErrorPattern[]> = new Map();
  private baselineStats: Map<string, AnomalyThreshold> = new Map();
  private readonly maxHistorySize: number;

  constructor(options: { maxHistorySize?: number } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 10000;
  }

  recordTelemetry(telemetry: CircuitBreakerTelemetry): void {
    const history = this.telemetryHistory.get(telemetry.breaker_name) ?? [];
    history.push(telemetry);
    
    // Maintain fixed-size window
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    
    this.telemetryHistory.set(telemetry.breaker_name, history);
  }

  getTelemetryHistory(breakerName: string): CircuitBreakerTelemetry[] {
    return this.telemetryHistory.get(breakerName) ?? [];
  }

  establishBaseline(breakerName: string): AnomalyThreshold | null {
    const history = this.telemetryHistory.get(breakerName) ?? [];
    if (history.length < 30) {
      return null;
    }

    const failureRates = history.map(t => 
      t.metrics.total_calls > 0 ? t.metrics.total_failures / t.metrics.total_calls : 0
    );

    const stats = this.calculateStatistics(failureRates);
    const threshold: AnomalyThreshold = {
      mean: stats.mean,
      std_dev: stats.stdDev,
      threshold_multiplier: 3.0,
      min_samples: history.length,
    };

    this.baselineStats.set(breakerName, threshold);
    return threshold;
  }

  detectAnomaly(breakerName: string): AnomalyDetectionResult {
    const history = this.telemetryHistory.get(breakerName) ?? [];
    const baseline = this.baselineStats.get(breakerName);

    if (!baseline || history.length < baseline.min_samples) {
      return {
        is_anomaly: false,
        confidence: 0,
        anomaly_type: 'none',
        severity: 'low',
        trigger_metric: '',
        trigger_value: 0,
        baseline_value: 0,
        deviation_sigma: 0,
        recommended_action: 'monitor',
      };
    }

    const recentWindow = history.slice(-30);
    const recentFailureRate = this.calculateFailureRate(recentWindow);
    const deviation = (recentFailureRate - baseline.mean) / (baseline.std_dev || 0.001);
    const isAnomaly = Math.abs(deviation) > baseline.threshold_multiplier;

    // Detect anomaly type
    let anomalyType: AnomalyDetectionResult['anomaly_type'] = 'spike';
    if (Math.abs(deviation) > baseline.threshold_multiplier * 2) {
      anomalyType = 'spike';
    } else if (this.detectTrend(recentWindow)) {
      anomalyType = 'trend';
    } else if (this.detectPattern(history, breakerName)) {
      anomalyType = 'pattern';
    } else if (this.detectCascade(history, breakerName)) {
      anomalyType = 'cascade';
    }

    // Determine severity
    let severity: AnomalyDetectionResult['severity'] = 'low';
    if (Math.abs(deviation) > baseline.threshold_multiplier * 3) {
      severity = 'critical';
    } else if (Math.abs(deviation) > baseline.threshold_multiplier * 2) {
      severity = 'high';
    } else if (Math.abs(deviation) > baseline.threshold_multiplier) {
      severity = 'medium';
    }

    // Determine recommended action
    let action: AnomalyDetectionResult['recommended_action'] = 'monitor';
    if (severity === 'critical') {
      action = 'escalate';
    } else if (deviation > baseline.threshold_multiplier) {
      action = 'tune_up';
    } else if (deviation < -baseline.threshold_multiplier / 2) {
      action = 'tune_down';
    }

    return {
      is_anomaly: isAnomaly,
      confidence: Math.min(1, Math.abs(deviation) / (baseline.threshold_multiplier * 3)),
      anomaly_type: anomalyType,
      severity,
      trigger_metric: 'failure_rate',
      trigger_value: recentFailureRate,
      baseline_value: baseline.mean,
      deviation_sigma: deviation,
      recommended_action: action,
    };
  }

  generateRecommendation(
    breakerName: string,
    currentConfig: CircuitBreakerConfig
  ): TuningRecommendation | null {
    const history = this.telemetryHistory.get(breakerName) ?? [];
    const anomaly = this.detectAnomaly(breakerName);

    if (history.length < 30) {
      return null;
    }

    const recentWindow = history.slice(-30);
    const failureRate = this.calculateFailureRate(recentWindow);
    const avgRecoveryTime = this.calculateAverageRecoveryTime(history);
    const stateTransitions = this.countStateTransitions(history);

    const rationale: string[] = [];
    const recommendedConfig: Partial<CircuitBreakerConfig> = {};
    let riskLevel: TuningRecommendation['risk_level'] = 'low';

    // Analyze failure rate patterns
    if (failureRate > 0.3) {
      recommendedConfig.failure_threshold = Math.max(1, Math.floor(currentConfig.failure_threshold * 0.8));
      recommendedConfig.timeout_ms = Math.floor(currentConfig.timeout_ms * 1.2);
      rationale.push(`High failure rate (${(failureRate * 100).toFixed(1)}%) - reducing threshold for faster detection`);
      riskLevel = 'medium';
    } else if (failureRate < 0.05) {
      recommendedConfig.failure_threshold = Math.floor(currentConfig.failure_threshold * 1.2);
      rationale.push(`Low failure rate (${(failureRate * 100).toFixed(1)}%) - increasing threshold to reduce sensitivity`);
    }

    // Analyze recovery patterns
    if (avgRecoveryTime > currentConfig.timeout_ms * 2) {
      recommendedConfig.timeout_ms = Math.floor(currentConfig.timeout_ms * 1.5);
      rationale.push(`Slow recovery detected (${avgRecoveryTime}ms avg) - increasing timeout`);
      riskLevel = 'high';
    } else if (avgRecoveryTime < currentConfig.timeout_ms * 0.3) {
      recommendedConfig.timeout_ms = Math.floor(currentConfig.timeout_ms * 0.8);
      rationale.push(`Fast recovery detected (${avgRecoveryTime}ms avg) - decreasing timeout`);
    }

    // Analyze state transitions
    if (stateTransitions > 10) {
      recommendedConfig.half_open_max_calls = Math.min(10, currentConfig.half_open_max_calls + 1);
      recommendedConfig.success_threshold = Math.min(5, currentConfig.success_threshold + 1);
      rationale.push(`Frequent state transitions (${stateTransitions}) - increasing stability requirements`);
      riskLevel = 'medium';
    }

    // Check for anomaly-based recommendations
    if (anomaly.is_anomaly) {
      if (anomaly.recommended_action === 'tune_up') {
        recommendedConfig.failure_threshold = Math.max(1, currentConfig.failure_threshold - 1);
        rationale.push(`Anomaly detected (${anomaly.anomaly_type}) - tuning for higher sensitivity`);
        riskLevel = 'high';
      }
    }

    if (rationale.length === 0) {
      rationale.push('Current configuration is optimal based on telemetry');
    }

    const confidence = Math.min(1, history.length / 100);
    const expectedImprovement = this.calculateExpectedImprovement(
      currentConfig,
      recommendedConfig,
      history
    );

    return {
      breaker_name: breakerName,
      current_config: currentConfig,
      recommended_config: recommendedConfig,
      confidence,
      rationale,
      risk_level: riskLevel,
      expected_improvement: expectedImprovement,
    };
  }

  generateTuningReport(
    breakerNames: string[],
    windowStart: Date,
    windowEnd: Date
  ): TuningReport {
    const recommendations: TuningRecommendation[] = [];
    let anomaliesDetected = 0;
    let escalationsRequired = 0;
    let breakersTuned = 0;

    const anomalySummary = {
      spike_count: 0,
      trend_count: 0,
      pattern_count: 0,
      cascade_count: 0,
    };

    let totalFailureRate = 0;
    let totalRecoveryTime = 0;
    let totalTransitions = 0;
    let totalRejections = 0;
    let sampleCount = 0;

    for (const name of breakerNames) {
      const anomaly = this.detectAnomaly(name);
      if (anomaly.is_anomaly) {
        anomaliesDetected++;
        anomalySummary[`${anomaly.anomaly_type}_count` as keyof typeof anomalySummary]++;
        if (anomaly.severity === 'critical') {
          escalationsRequired++;
        }
      }

      const history = this.telemetryHistory.get(name) ?? [];
      if (history.length > 0) {
        const latest = history[history.length - 1];
        const recentWindow = history.slice(-30);
        
        totalFailureRate += this.calculateFailureRate(recentWindow);
        totalRecoveryTime += this.calculateAverageRecoveryTime(history);
        totalTransitions += this.countStateTransitions(history);
        totalRejections += latest.metrics.total_calls - latest.metrics.total_successes - latest.metrics.total_failures;
        sampleCount++;
      }

      // Generate recommendation if we have enough data
      if (history.length >= 30) {
        const rec = this.generateRecommendation(name, {
          failure_threshold: 5,
          success_threshold: 3,
          timeout_ms: 60000,
          half_open_max_calls: 3,
        });
        if (rec && Object.keys(rec.recommended_config).length > 0) {
          recommendations.push(rec);
          breakersTuned++;
        }
      }
    }

    return {
      schema_version: 'circuit_breaker_tuning_report.v1',
      generated_at: new Date().toISOString(),
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      total_breakers: breakerNames.length,
      breakers_tuned: breakersTuned,
      anomalies_detected: anomaliesDetected,
      escalations_required: escalationsRequired,
      recommendations,
      anomaly_summary: anomalySummary,
      statistical_summary: {
        avg_failure_rate: sampleCount > 0 ? totalFailureRate / sampleCount : 0,
        avg_recovery_time_ms: sampleCount > 0 ? totalRecoveryTime / sampleCount : 0,
        total_state_transitions: totalTransitions,
        total_rejections: totalRejections,
      },
    };
  }

  private calculateStatistics(values: number[]): { mean: number; stdDev: number } {
    if (values.length === 0) {
      return { mean: 0, stdDev: 0 };
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
  }

  private calculateFailureRate(history: CircuitBreakerTelemetry[]): number {
    if (history.length === 0) return 0;
    
    const totalCalls = history.reduce((sum, t) => sum + t.metrics.total_calls, 0);
    const totalFailures = history.reduce((sum, t) => sum + t.metrics.total_failures, 0);
    
    return totalCalls > 0 ? totalFailures / totalCalls : 0;
  }

  private calculateAverageRecoveryTime(history: CircuitBreakerTelemetry[]): number {
    const recoveryTimes: number[] = [];
    
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      
      // Detect recovery: from open/half_open to closed
      if (prev.metrics.state !== 'closed' && curr.metrics.state === 'closed') {
        const recoveryTime = curr.timestamp_ms - prev.timestamp_ms;
        recoveryTimes.push(recoveryTime);
      }
    }

    return recoveryTimes.length > 0 
      ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length 
      : 0;
  }

  private countStateTransitions(history: CircuitBreakerTelemetry[]): number {
    let transitions = 0;
    
    for (let i = 1; i < history.length; i++) {
      if (history[i].metrics.state !== history[i - 1].metrics.state) {
        transitions++;
      }
    }

    return transitions;
  }

  private detectTrend(history: CircuitBreakerTelemetry[]): boolean {
    if (history.length < 10) return false;

    const rates = history.map(t => 
      t.metrics.total_calls > 0 ? t.metrics.total_failures / t.metrics.total_calls : 0
    );

    // Simple linear regression
    const n = rates.length;
    const sumX = rates.reduce((sum, _, i) => sum + i, 0);
    const sumY = rates.reduce((sum, rate) => sum + rate, 0);
    const sumXY = rates.reduce((sum, rate, i) => sum + i * rate, 0);
    const sumX2 = rates.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Consider it a trend if slope is significant (> 0.01 per sample)
    return Math.abs(slope) > 0.01;
  }

  private detectPattern(_history: CircuitBreakerTelemetry[], breakerName: string): boolean {
    // Look for repeating error patterns
    const patterns = this.errorPatterns.get(breakerName) ?? [];
    if (patterns.length < 3) return false;

    // Check for similar patterns in recent history
    const recentPatterns = patterns.slice(-5);
    const patternTypes = new Set(recentPatterns.map(p => p.error_type));
    
    // If same error type appears frequently, it's a pattern
    return patternTypes.size <= 2 && recentPatterns.length >= 3;
  }

  private detectCascade(history: CircuitBreakerTelemetry[], _breakerName: string): boolean {
    // Detect cascading failures by looking at rapid state transitions
    const recentHistory = history.slice(-10);
    if (recentHistory.length < 5) return false;

    let rapidTransitions = 0;
    for (let i = 1; i < recentHistory.length; i++) {
      const timeDelta = recentHistory[i].timestamp_ms - recentHistory[i - 1].timestamp_ms;
      const stateChanged = recentHistory[i].metrics.state !== recentHistory[i - 1].metrics.state;
      
      if (stateChanged && timeDelta < 1000) { // Less than 1 second
        rapidTransitions++;
      }
    }

    return rapidTransitions >= 3;
  }

  private calculateExpectedImprovement(
    current: CircuitBreakerConfig,
    recommended: Partial<CircuitBreakerConfig>,
    history: CircuitBreakerTelemetry[]
  ): TuningRecommendation['expected_improvement'] {
    // Estimate improvement based on historical data and config changes
    void this.calculateFailureRate(history); // Accesses history without unused warning
    
    let failureReduction = 0;
    let recoveryImprovement = 0;

    if (recommended.failure_threshold !== undefined) {
      const thresholdChange = (recommended.failure_threshold - current.failure_threshold) / current.failure_threshold;
      failureReduction = -thresholdChange * 20; // 20% reduction per threshold unit
    }

    if (recommended.timeout_ms !== undefined) {
      const timeoutChange = (current.timeout_ms - recommended.timeout_ms) / current.timeout_ms;
      recoveryImprovement = timeoutChange * 30; // 30% improvement per timeout reduction
    }

    return {
      failure_reduction_percent: Math.max(0, failureReduction),
      recovery_time_improvement_percent: Math.max(0, recoveryImprovement),
    };
  }

  recordErrorPattern(breakerName: string, pattern: ErrorPattern): void {
    const patterns = this.errorPatterns.get(breakerName) ?? [];
    patterns.push(pattern);
    
    // Keep only recent patterns
    if (patterns.length > 100) {
      patterns.shift();
    }
    
    this.errorPatterns.set(breakerName, patterns);
  }

  clearHistory(breakerName?: string): void {
    if (breakerName) {
      this.telemetryHistory.delete(breakerName);
      this.errorPatterns.delete(breakerName);
      this.baselineStats.delete(breakerName);
    } else {
      this.telemetryHistory.clear();
      this.errorPatterns.clear();
      this.baselineStats.clear();
    }
  }
}

export function createTimeSeriesFromTelemetry(
  telemetry: CircuitBreakerTelemetry[],
  _windowMs: number = 60000
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  
  for (let i = 0; i < telemetry.length; i++) {
    const t = telemetry[i];
    const prev = i > 0 ? telemetry[i - 1] : null;
    
    const callsInWindow = prev 
      ? t.metrics.total_calls - prev.metrics.total_calls 
      : t.metrics.total_calls;
    const failuresInWindow = prev 
      ? t.metrics.total_failures - prev.metrics.total_failures 
      : t.metrics.total_failures;
    const successesInWindow = prev 
      ? t.metrics.total_successes - prev.metrics.total_successes 
      : t.metrics.total_successes;

    points.push({
      timestamp_ms: t.timestamp_ms,
      failure_rate: callsInWindow > 0 ? failuresInWindow / callsInWindow : 0,
      success_rate: callsInWindow > 0 ? successesInWindow / callsInWindow : 0,
      total_calls: callsInWindow,
    });
  }

  return points;
}

export function correlateFailures(
  breaker1History: CircuitBreakerTelemetry[],
  breaker2History: CircuitBreakerTelemetry[]
): number {
  // Calculate correlation coefficient between two breakers' failure patterns
  const minLength = Math.min(breaker1History.length, breaker2History.length);
  if (minLength < 5) return 0;

  const failures1 = breaker1History.slice(-minLength).map(t => t.metrics.total_failures);
  const failures2 = breaker2History.slice(-minLength).map(t => t.metrics.total_failures);

  const mean1 = failures1.reduce((a, b) => a + b, 0) / minLength;
  const mean2 = failures2.reduce((a, b) => a + b, 0) / minLength;

  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (let i = 0; i < minLength; i++) {
    const diff1 = failures1[i] - mean1;
    const diff2 = failures2[i] - mean2;
    numerator += diff1 * diff2;
    denom1 += diff1 * diff1;
    denom2 += diff2 * diff2;
  }

  const denominator = Math.sqrt(denom1 * denom2);
  return denominator > 0 ? numerator / denominator : 0;
}

export const globalCircuitBreakerTuner = new CircuitBreakerTuner();
