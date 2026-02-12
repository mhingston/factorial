import { beforeEach, describe, expect, it } from 'vitest';
import {
  type CircuitBreakerTelemetry,
  CircuitBreakerTuner,
  correlateFailures,
  createTimeSeriesFromTelemetry,
  globalCircuitBreakerTuner,
} from './circuit-breaker-tuning.js';

describe('CircuitBreakerTuner', () => {
  let tuner: CircuitBreakerTuner;

  beforeEach(() => {
    tuner = new CircuitBreakerTuner({ maxHistorySize: 1000 });
  });

  it('records telemetry history', () => {
    const telemetry: CircuitBreakerTelemetry = {
      breaker_name: 'test-breaker',
      timestamp_ms: Date.now(),
      metrics: {
        state: 'closed',
        failure_count: 0,
        success_count: 1,
        last_failure_time_ms: null,
        last_success_time_ms: Date.now(),
        total_calls: 1,
        total_failures: 0,
        total_successes: 1,
        consecutive_successes: 1,
        consecutive_failures: 0,
      },
    };

    tuner.recordTelemetry(telemetry);
    const history = tuner.getTelemetryHistory('test-breaker');

    expect(history).toHaveLength(1);
    expect(history[0].breaker_name).toBe('test-breaker');
  });

  it('maintains max history size', () => {
    const smallTuner = new CircuitBreakerTuner({ maxHistorySize: 5 });

    for (let i = 0; i < 10; i++) {
      smallTuner.recordTelemetry({
        breaker_name: 'test-breaker',
        timestamp_ms: Date.now() + i,
        metrics: {
          state: 'closed',
          failure_count: 0,
          success_count: i + 1,
          last_failure_time_ms: null,
          last_success_time_ms: Date.now() + i,
          total_calls: i + 1,
          total_failures: 0,
          total_successes: i + 1,
          consecutive_successes: i + 1,
          consecutive_failures: 0,
        },
      });
    }

    const history = smallTuner.getTelemetryHistory('test-breaker');
    expect(history).toHaveLength(5);
  });

  it('establishes baseline with sufficient data', () => {
    // Generate 30 telemetry points with consistent failure rate
    for (let i = 0; i < 30; i++) {
      tuner.recordTelemetry({
        breaker_name: 'test-breaker',
        timestamp_ms: Date.now() + i * 1000,
        metrics: {
          state: 'closed',
          failure_count: i % 5 === 0 ? 1 : 0,
          success_count: i % 5 !== 0 ? 1 : 0,
          last_failure_time_ms: i % 5 === 0 ? Date.now() + i * 1000 : null,
          last_success_time_ms: i % 5 !== 0 ? Date.now() + i * 1000 : null,
          total_calls: i + 1,
          total_failures: Math.floor((i + 1) / 5),
          total_successes: i + 1 - Math.floor((i + 1) / 5),
          consecutive_successes: i % 5 !== 0 ? 1 : 0,
          consecutive_failures: i % 5 === 0 ? 1 : 0,
        },
      });
    }

    const baseline = tuner.establishBaseline('test-breaker');
    expect(baseline).not.toBeNull();
    expect(baseline?.mean).toBeGreaterThan(0);
    expect(baseline?.std_dev).toBeGreaterThanOrEqual(0);
    expect(baseline?.min_samples).toBe(30);
  });

  it('returns null baseline with insufficient data', () => {
    tuner.recordTelemetry({
      breaker_name: 'test-breaker',
      timestamp_ms: Date.now(),
      metrics: {
        state: 'closed',
        failure_count: 0,
        success_count: 1,
        last_failure_time_ms: null,
        last_success_time_ms: Date.now(),
        total_calls: 1,
        total_failures: 0,
        total_successes: 1,
        consecutive_successes: 1,
        consecutive_failures: 0,
      },
    });

    const baseline = tuner.establishBaseline('test-breaker');
    expect(baseline).toBeNull();
  });

  it('detects anomaly when failure rate spikes', () => {
    // Establish baseline with normal operation
    for (let i = 0; i < 30; i++) {
      tuner.recordTelemetry({
        breaker_name: 'test-breaker',
        timestamp_ms: Date.now() + i * 1000,
        metrics: {
          state: 'closed',
          failure_count: 0,
          success_count: 1,
          last_failure_time_ms: null,
          last_success_time_ms: Date.now() + i * 1000,
          total_calls: i + 1,
          total_failures: 0,
          total_successes: i + 1,
          consecutive_successes: i + 1,
          consecutive_failures: 0,
        },
      });
    }

    tuner.establishBaseline('test-breaker');

    // Add anomalous data
    for (let i = 30; i < 35; i++) {
      tuner.recordTelemetry({
        breaker_name: 'test-breaker',
        timestamp_ms: Date.now() + i * 1000,
        metrics: {
          state: 'open',
          failure_count: i - 29,
          success_count: 0,
          last_failure_time_ms: Date.now() + i * 1000,
          last_success_time_ms: null,
          total_calls: i + 1,
          total_failures: i - 29,
          total_successes: 30,
          consecutive_successes: 0,
          consecutive_failures: i - 29,
        },
      });
    }

    const anomaly = tuner.detectAnomaly('test-breaker');
    expect(anomaly.is_anomaly).toBe(true);
    expect(anomaly.confidence).toBeGreaterThan(0);
    expect(anomaly.trigger_metric).toBe('failure_rate');
    // Recommended action can be 'tune_up' or 'escalate' depending on severity
    expect(['tune_up', 'escalate']).toContain(anomaly.recommended_action);
  });

  it('returns no anomaly with insufficient data', () => {
    const anomaly = tuner.detectAnomaly('test-breaker');
    expect(anomaly.is_anomaly).toBe(false);
    expect(anomaly.confidence).toBe(0);
    expect(anomaly.recommended_action).toBe('monitor');
  });

  it('generates recommendation with sufficient data', () => {
    // Generate telemetry with high failure rate
    for (let i = 0; i < 30; i++) {
      const isFailure = i % 2 === 0;
      tuner.recordTelemetry({
        breaker_name: 'test-breaker',
        timestamp_ms: Date.now() + i * 1000,
        metrics: {
          state: isFailure ? 'open' : 'closed',
          failure_count: isFailure ? 1 : 0,
          success_count: isFailure ? 0 : 1,
          last_failure_time_ms: isFailure ? Date.now() + i * 1000 : null,
          last_success_time_ms: isFailure ? null : Date.now() + i * 1000,
          total_calls: i + 1,
          total_failures: Math.floor((i + 2) / 2),
          total_successes: Math.floor((i + 1) / 2),
          consecutive_successes: isFailure ? 0 : 1,
          consecutive_failures: isFailure ? 1 : 0,
        },
      });
    }

    const recommendation = tuner.generateRecommendation('test-breaker', {
      failure_threshold: 5,
      success_threshold: 3,
      timeout_ms: 60000,
      half_open_max_calls: 3,
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.breaker_name).toBe('test-breaker');
    expect(recommendation?.rationale.length).toBeGreaterThan(0);
    expect(recommendation?.confidence).toBeGreaterThan(0);
  });

  it('returns null recommendation with insufficient data', () => {
    const recommendation = tuner.generateRecommendation('test-breaker', {
      failure_threshold: 5,
      success_threshold: 3,
      timeout_ms: 60000,
      half_open_max_calls: 3,
    });

    expect(recommendation).toBeNull();
  });

  it('generates comprehensive tuning report', () => {
    const breakerNames = ['breaker-a', 'breaker-b', 'breaker-c'];

    for (const name of breakerNames) {
      for (let i = 0; i < 30; i++) {
        tuner.recordTelemetry({
          breaker_name: name,
          timestamp_ms: Date.now() + i * 1000,
          metrics: {
            state: 'closed',
            failure_count: 0,
            success_count: 1,
            last_failure_time_ms: null,
            last_success_time_ms: Date.now() + i * 1000,
            total_calls: i + 1,
            total_failures: 0,
            total_successes: i + 1,
            consecutive_successes: i + 1,
            consecutive_failures: 0,
          },
        });
      }
    }

    const windowStart = new Date(Date.now() - 86400000); // 1 day ago
    const windowEnd = new Date();

    const report = tuner.generateTuningReport(breakerNames, windowStart, windowEnd);

    expect(report.schema_version).toBe('circuit_breaker_tuning_report.v1');
    expect(report.total_breakers).toBe(3);
    expect(report.recommendations).toBeDefined();
    expect(report.statistical_summary).toBeDefined();
    expect(report.anomaly_summary).toBeDefined();
  });

  it('clears history for specific breaker', () => {
    tuner.recordTelemetry({
      breaker_name: 'breaker-a',
      timestamp_ms: Date.now(),
      metrics: {
        state: 'closed',
        failure_count: 0,
        success_count: 1,
        last_failure_time_ms: null,
        last_success_time_ms: Date.now(),
        total_calls: 1,
        total_failures: 0,
        total_successes: 1,
        consecutive_successes: 1,
        consecutive_failures: 0,
      },
    });

    tuner.recordTelemetry({
      breaker_name: 'breaker-b',
      timestamp_ms: Date.now(),
      metrics: {
        state: 'closed',
        failure_count: 0,
        success_count: 1,
        last_failure_time_ms: null,
        last_success_time_ms: Date.now(),
        total_calls: 1,
        total_failures: 0,
        total_successes: 1,
        consecutive_successes: 1,
        consecutive_failures: 0,
      },
    });

    tuner.clearHistory('breaker-a');

    expect(tuner.getTelemetryHistory('breaker-a')).toHaveLength(0);
    expect(tuner.getTelemetryHistory('breaker-b')).toHaveLength(1);
  });

  it('clears all history when no breaker specified', () => {
    tuner.recordTelemetry({
      breaker_name: 'breaker-a',
      timestamp_ms: Date.now(),
      metrics: {
        state: 'closed',
        failure_count: 0,
        success_count: 1,
        last_failure_time_ms: null,
        last_success_time_ms: Date.now(),
        total_calls: 1,
        total_failures: 0,
        total_successes: 1,
        consecutive_successes: 1,
        consecutive_failures: 0,
      },
    });

    tuner.clearHistory();

    expect(tuner.getTelemetryHistory('breaker-a')).toHaveLength(0);
  });
});

describe('createTimeSeriesFromTelemetry', () => {
  it('creates time series from telemetry', () => {
    const telemetry: CircuitBreakerTelemetry[] = [
      {
        breaker_name: 'test',
        timestamp_ms: 0,
        metrics: {
          state: 'closed',
          failure_count: 0,
          success_count: 1,
          last_failure_time_ms: null,
          last_success_time_ms: 0,
          total_calls: 1,
          total_failures: 0,
          total_successes: 1,
          consecutive_successes: 1,
          consecutive_failures: 0,
        },
      },
      {
        breaker_name: 'test',
        timestamp_ms: 1000,
        metrics: {
          state: 'closed',
          failure_count: 0,
          success_count: 2,
          last_failure_time_ms: null,
          last_success_time_ms: 1000,
          total_calls: 2,
          total_failures: 0,
          total_successes: 2,
          consecutive_successes: 2,
          consecutive_failures: 0,
        },
      },
    ];

    const series = createTimeSeriesFromTelemetry(telemetry);

    expect(series).toHaveLength(2);
    expect(series[0].failure_rate).toBe(0);
    expect(series[0].success_rate).toBe(1);
    expect(series[1].failure_rate).toBe(0);
    expect(series[1].total_calls).toBe(1);
  });

  it('handles empty telemetry', () => {
    const series = createTimeSeriesFromTelemetry([]);
    expect(series).toHaveLength(0);
  });
});

describe('correlateFailures', () => {
  it('calculates correlation between two breakers', () => {
    const breaker1: CircuitBreakerTelemetry[] = [];
    const breaker2: CircuitBreakerTelemetry[] = [];

    for (let i = 0; i < 10; i++) {
      breaker1.push({
        breaker_name: 'breaker1',
        timestamp_ms: i * 1000,
        metrics: {
          state: 'closed',
          failure_count: i % 3 === 0 ? 1 : 0,
          success_count: i % 3 !== 0 ? 1 : 0,
          last_failure_time_ms: i % 3 === 0 ? i * 1000 : null,
          last_success_time_ms: i % 3 !== 0 ? i * 1000 : null,
          total_calls: i + 1,
          total_failures: Math.floor((i + 3) / 3),
          total_successes: i + 1 - Math.floor((i + 3) / 3),
          consecutive_successes: i % 3 !== 0 ? 1 : 0,
          consecutive_failures: i % 3 === 0 ? 1 : 0,
        },
      });

      breaker2.push({
        breaker_name: 'breaker2',
        timestamp_ms: i * 1000,
        metrics: {
          state: 'closed',
          failure_count: i % 3 === 0 ? 1 : 0,
          success_count: i % 3 !== 0 ? 1 : 0,
          last_failure_time_ms: i % 3 === 0 ? i * 1000 : null,
          last_success_time_ms: i % 3 !== 0 ? i * 1000 : null,
          total_calls: i + 1,
          total_failures: Math.floor((i + 3) / 3),
          total_successes: i + 1 - Math.floor((i + 3) / 3),
          consecutive_successes: i % 3 !== 0 ? 1 : 0,
          consecutive_failures: i % 3 === 0 ? 1 : 0,
        },
      });
    }

    const correlation = correlateFailures(breaker1, breaker2);
    expect(correlation).toBeGreaterThan(0);
  });

  it('returns 0 for insufficient data', () => {
    const breaker1: CircuitBreakerTelemetry[] = [
      {
        breaker_name: 'breaker1',
        timestamp_ms: 0,
        metrics: {
          state: 'closed',
          failure_count: 0,
          success_count: 1,
          last_failure_time_ms: null,
          last_success_time_ms: 0,
          total_calls: 1,
          total_failures: 0,
          total_successes: 1,
          consecutive_successes: 1,
          consecutive_failures: 0,
        },
      },
    ];

    const breaker2: CircuitBreakerTelemetry[] = [];

    const correlation = correlateFailures(breaker1, breaker2);
    expect(correlation).toBe(0);
  });
});

describe('globalCircuitBreakerTuner', () => {
  it('is a singleton instance', () => {
    expect(globalCircuitBreakerTuner).toBeDefined();
    expect(globalCircuitBreakerTuner).toBeInstanceOf(CircuitBreakerTuner);
  });
});
