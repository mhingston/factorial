/**
 * Tests for Cache Monitoring (SA-003)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CacheMonitor,
  calculateAnthropicCost,
  getGlobalCacheMonitor,
  resetGlobalCacheMonitor,
} from './cache-monitor.js';

describe('CacheMonitor', () => {
  beforeEach(() => {
    resetGlobalCacheMonitor();
  });

  describe('calculateAnthropicCost', () => {
    it('calculates cost without caching', () => {
      const usage = {
        input_tokens: 1000,
        output_tokens: 500,
      };

      const modelInfo = {
        id: 'claude-3-opus-20240229',
        input_cost_per_million: 3.0,
        output_cost_per_million: 15.0,
      };

      const cost = calculateAnthropicCost(usage, modelInfo);

      // Regular input: 1000 tokens @ $3/M = $0.003
      // Output: 500 tokens @ $15/M = $0.0075
      expect(cost.input_cost).toBeCloseTo(0.003, 5);
      expect(cost.output_cost).toBeCloseTo(0.0075, 5);
      expect(cost.total_cost).toBeCloseTo(0.0105, 5);
      expect(cost.savings_from_caching).toBe(0);
    });

    it('calculates cost with cache hits (90% discount)', () => {
      const usage = {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_tokens: 800,
      };

      const modelInfo = {
        id: 'claude-3-opus-20240229',
        input_cost_per_million: 3.0,
        output_cost_per_million: 15.0,
      };

      const cost = calculateAnthropicCost(usage, modelInfo);

      // Regular input: 200 tokens @ $3/M = $0.0006
      // Cached input: 800 tokens @ $0.30/M (10% of $3) = $0.00024
      // Total input: $0.00084
      // Output: 500 tokens @ $15/M = $0.0075
      expect(cost.input_cost).toBeCloseTo(0.00084, 5);
      expect(cost.output_cost).toBeCloseTo(0.0075, 5);
      // Savings: 800 tokens @ $2.70/M (90% of $3) = $0.00216
      expect(cost.savings_from_caching).toBeCloseTo(0.00216, 5);
      expect(cost.total_cost).toBeCloseTo(0.00834, 5);
    });

    it('calculates cost with reasoning tokens', () => {
      const usage = {
        input_tokens: 500,
        output_tokens: 200,
        cache_read_tokens: 300,
      };

      const modelInfo = {
        id: 'claude-3-opus-20240229',
        input_cost_per_million: 3.0,
        output_cost_per_million: 15.0,
      };

      const cost = calculateAnthropicCost(usage, modelInfo, 100);

      // Regular input: 200 tokens @ $3/M = $0.0006
      // Cached input: 300 tokens @ $0.30/M = $0.00009
      // Output: 200 tokens @ $15/M = $0.003
      // Reasoning: 100 tokens @ $15/M = $0.0015
      expect(cost.input_cost).toBeCloseTo(0.00069, 5);
      expect(cost.output_cost).toBeCloseTo(0.003, 5);
      expect(cost.reasoning_cost).toBeCloseTo(0.0015, 5);
      expect(cost.total_cost).toBeCloseTo(0.00519, 5);
    });
  });

  describe('CacheMonitor', () => {
    it('records cache hit correctly', () => {
      const monitor = new CacheMonitor();

      monitor.recordRequest(
        'anthropic',
        {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_tokens: 800,
          cache_write_tokens: 200,
        },
        {
          id: 'claude-3-opus-20240229',
          input_cost_per_million: 3.0,
          output_cost_per_million: 15.0,
        }
      );

      const metrics = monitor.getMetrics('anthropic', 'claude-3-opus-20240229');

      expect(metrics).toBeDefined();
      expect(metrics?.total_requests).toBe(1);
      expect(metrics?.cache_hits).toBe(1);
      expect(metrics?.cache_misses).toBe(0);
      expect(metrics?.tokens_saved).toBe(800);
      expect(metrics?.cache_read_tokens).toBe(800);
      expect(metrics?.cache_write_tokens).toBe(200);
      // Savings: 800 tokens @ $2.70/M = $0.00216
      expect(metrics?.cost_saved_usd).toBeCloseTo(0.00216, 5);
    });

    it('records cache miss correctly', () => {
      const monitor = new CacheMonitor();

      monitor.recordRequest(
        'anthropic',
        {
          input_tokens: 500,
          output_tokens: 200,
          cache_read_tokens: 0,
          cache_write_tokens: 500,
        },
        {
          id: 'claude-3-opus-20240229',
          input_cost_per_million: 3.0,
          output_cost_per_million: 15.0,
        }
      );

      const metrics = monitor.getMetrics('anthropic', 'claude-3-opus-20240229');

      expect(metrics?.total_requests).toBe(1);
      expect(metrics?.cache_hits).toBe(0);
      expect(metrics?.cache_misses).toBe(1);
      expect(metrics?.tokens_saved).toBe(0);
      expect(metrics?.cost_saved_usd).toBe(0);
      expect(metrics?.cache_write_tokens).toBe(500);
    });

    it('aggregates multiple requests', () => {
      const monitor = new CacheMonitor();

      const modelInfo = {
        id: 'claude-3-opus-20240229',
        input_cost_per_million: 3.0,
        output_cost_per_million: 15.0,
      };

      // First request: cache miss
      monitor.recordRequest(
        'anthropic',
        { input_tokens: 1000, output_tokens: 500, cache_read_tokens: 0, cache_write_tokens: 1000 },
        modelInfo
      );

      // Second request: cache hit
      monitor.recordRequest(
        'anthropic',
        { input_tokens: 1000, output_tokens: 500, cache_read_tokens: 1000, cache_write_tokens: 0 },
        modelInfo
      );

      // Third request: cache hit
      monitor.recordRequest(
        'anthropic',
        { input_tokens: 1000, output_tokens: 500, cache_read_tokens: 1000, cache_write_tokens: 0 },
        modelInfo
      );

      const metrics = monitor.getMetrics('anthropic', 'claude-3-opus-20240229');

      expect(metrics?.total_requests).toBe(3);
      expect(metrics?.cache_hits).toBe(2);
      expect(metrics?.cache_misses).toBe(1);
      expect(metrics?.tokens_saved).toBe(2000);
      expect(metrics?.cache_read_tokens).toBe(2000);
      expect(metrics?.cache_write_tokens).toBe(1000);
    });

    it('generates comprehensive report', () => {
      const monitor = new CacheMonitor();

      monitor.recordRequest(
        'anthropic',
        { input_tokens: 1000, output_tokens: 500, cache_read_tokens: 800, cache_write_tokens: 200 },
        { id: 'claude-3-opus-20240229', input_cost_per_million: 3.0, output_cost_per_million: 15.0 }
      );

      monitor.recordRequest(
        'anthropic',
        { input_tokens: 500, output_tokens: 200, cache_read_tokens: 0, cache_write_tokens: 500 },
        { id: 'claude-3-haiku-20240307', input_cost_per_million: 0.25, output_cost_per_million: 1.25 }
      );

      const report = monitor.generateReport();

      expect(report.report_version).toBe('1.0');
      expect(report.timestamp).toBeDefined();
      expect(report.summary.total_requests).toBe(2);
      expect(report.summary.total_cache_hits).toBe(1);
      expect(report.summary.total_tokens_saved).toBe(800);
      expect(report.summary.overall_hit_rate).toBe(0.5);

      expect(report.providers['anthropic:claude-3-opus-20240229']).toBeDefined();
      expect(report.providers['anthropic:claude-3-opus-20240229'].hit_rate).toBe(1);

      expect(report.providers['anthropic:claude-3-haiku-20240307']).toBeDefined();
      expect(report.providers['anthropic:claude-3-haiku-20240307'].hit_rate).toBe(0);
    });

    it('handles empty metrics', () => {
      const monitor = new CacheMonitor();
      const report = monitor.generateReport();

      expect(report.summary.total_requests).toBe(0);
      expect(report.summary.total_cache_hits).toBe(0);
      expect(report.summary.overall_hit_rate).toBe(0);
      expect(Object.keys(report.providers)).toHaveLength(0);
    });

    it('resets metrics correctly', () => {
      const monitor = new CacheMonitor();

      monitor.recordRequest(
        'anthropic',
        { input_tokens: 1000, output_tokens: 500, cache_read_tokens: 800, cache_write_tokens: 200 },
        { id: 'claude-3-opus-20240229', input_cost_per_million: 3.0, output_cost_per_million: 15.0 }
      );

      expect(monitor.getMetrics('anthropic', 'claude-3-opus-20240229')).toBeDefined();

      monitor.reset();

      expect(monitor.getMetrics('anthropic', 'claude-3-opus-20240229')).toBeUndefined();
    });
  });

  describe('Global cache monitor', () => {
    it('returns singleton instance', () => {
      const monitor1 = getGlobalCacheMonitor();
      const monitor2 = getGlobalCacheMonitor();

      expect(monitor1).toBe(monitor2);
    });

    it('can be reset', () => {
      const monitor1 = getGlobalCacheMonitor();
      resetGlobalCacheMonitor();
      const monitor2 = getGlobalCacheMonitor();

      expect(monitor1).not.toBe(monitor2);
    });
  });
});
