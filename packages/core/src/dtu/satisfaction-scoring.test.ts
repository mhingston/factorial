import { describe, expect, it } from 'vitest';
import type { TwinInvocationResponse } from './contracts.js';
import {
  type SatisfactionScore,
  computeSatisfactionDistribution,
  computeSatisfactionScore,
  probabilisticStatus,
} from './satisfaction-scoring.js';

describe('satisfaction-scoring', () => {
  describe('computeSatisfactionScore', () => {
    it('returns perfect score for identical responses', () => {
      const response: TwinInvocationResponse = {
        twin_id: 'test.twin',
        twin_version: '1.0.0',
        operation: 'test.op',
        status: 'success',
        output: { data: 'test' },
        error: null,
        timing: {
          started_at_ms: 1000,
          completed_at_ms: 1010,
          latency_ms: 10,
          deterministic: true,
        },
        metadata: {},
      };

      const score = computeSatisfactionScore(response, response);
      expect(score.value).toBe(1.0);
      expect(score.components.status_match).toBe(1.0);
      expect(score.components.structure_match).toBe(1.0);
      expect(score.components.content_match).toBe(1.0);
    });

    it('returns zero for status mismatch', () => {
      const expected: TwinInvocationResponse = {
        twin_id: 'test.twin',
        twin_version: '1.0.0',
        operation: 'test.op',
        status: 'success',
        output: { data: 'test' },
        error: null,
        timing: {
          started_at_ms: 1000,
          completed_at_ms: 1010,
          latency_ms: 10,
          deterministic: true,
        },
        metadata: {},
      };

      const actual: TwinInvocationResponse = {
        ...expected,
        status: 'error',
        output: null,
        error: {
          code: 'test_error',
          class: 'transient',
          message: 'Test error',
          retryable: true,
          details: {},
        },
      };

      const score = computeSatisfactionScore(expected, actual);
      expect(score.value).toBe(0.0);
      expect(score.components.status_match).toBe(0.0);
    });

    it('handles partial content matches', () => {
      const expected: TwinInvocationResponse = {
        twin_id: 'test.twin',
        twin_version: '1.0.0',
        operation: 'test.op',
        status: 'success',
        output: { id: 123, name: 'test', value: 456 },
        error: null,
        timing: {
          started_at_ms: 1000,
          completed_at_ms: 1010,
          latency_ms: 10,
          deterministic: true,
        },
        metadata: {},
      };

      const actual: TwinInvocationResponse = {
        ...expected,
        output: { id: 123, name: 'different', value: 789 },
      };

      const score = computeSatisfactionScore(expected, actual);
      expect(score.value).toBeGreaterThan(0.5);
      expect(score.value).toBeLessThan(1.0);
    });

    it('compares error responses', () => {
      const expected: TwinInvocationResponse = {
        twin_id: 'test.twin',
        twin_version: '1.0.0',
        operation: 'test.op',
        status: 'error',
        output: null,
        error: {
          code: 'rate_limited',
          class: 'rate_limit',
          message: 'Rate limit exceeded',
          retryable: true,
          details: { retry_after_ms: 60000 },
        },
        timing: {
          started_at_ms: 1000,
          completed_at_ms: 1010,
          latency_ms: 10,
          deterministic: true,
        },
        metadata: {},
      };

      // Same error code and class, different message
      const actual: TwinInvocationResponse = {
        ...expected,
        error: {
          ...expected.error,
          message: 'Different rate limit message',
        },
      };

      const score = computeSatisfactionScore(expected, actual);
      expect(score.value).toBeGreaterThan(0.7); // Code and class match give high score
      expect(score.value).toBeLessThan(1.0); // But not perfect due to message difference
    });
  });

  describe('computeSatisfactionDistribution', () => {
    it('computes distribution for empty array', () => {
      const dist = computeSatisfactionDistribution([]);
      expect(dist.mean).toBe(0);
      expect(dist.median).toBe(0);
      expect(dist.buckets.excellent).toBe(0);
    });

    it('computes distribution correctly', () => {
      const scores = [0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15, 0.05];
      const dist = computeSatisfactionDistribution(scores);

      expect(dist.mean).toBeCloseTo(0.5, 1);
      expect(dist.median).toBeCloseTo(0.5, 1);
      expect(dist.min).toBe(0.05);
      expect(dist.max).toBe(0.95);

      // Check buckets (based on ranges: excellent >=0.9, good 0.8-0.9, acceptable 0.5-0.8, poor 0.3-0.5, failed <0.3)
      expect(dist.buckets.excellent).toBe(1); // 0.95
      expect(dist.buckets.good).toBe(1);      // 0.85
      expect(dist.buckets.acceptable).toBe(3); // 0.75, 0.65, 0.55
      expect(dist.buckets.poor).toBe(2);      // 0.45, 0.35
      expect(dist.buckets.failed).toBe(3);    // 0.25, 0.15, 0.05
    });

    it('computes quartiles correctly', () => {
      const scores = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      const dist = computeSatisfactionDistribution(scores);

      expect(dist.quartiles.q1).toBeCloseTo(0.325, 2);
      expect(dist.quartiles.q2).toBeCloseTo(0.55, 2);
      expect(dist.quartiles.q3).toBeCloseTo(0.775, 2);
    });
  });

  describe('probabilisticStatus', () => {
    it('classifies high scores as satisfied', () => {
      expect(probabilisticStatus(0.9)).toBe('satisfied');
      expect(probabilisticStatus(0.8)).toBe('satisfied');
    });

    it('classifies medium scores as marginal', () => {
      expect(probabilisticStatus(0.7)).toBe('marginal');
      expect(probabilisticStatus(0.5)).toBe('marginal');
    });

    it('classifies low scores as unsatisfied', () => {
      expect(probabilisticStatus(0.49)).toBe('unsatisfied');
      expect(probabilisticStatus(0.0)).toBe('unsatisfied');
    });
  });
});
