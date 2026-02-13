import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObservabilityQueryClient } from './query-client.js';

const TEST_BASE_PATH = '/tmp/factorial-observability-query-test';

describe('ObservabilityQueryClient', () => {
  let client: ObservabilityQueryClient;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await rm(TEST_BASE_PATH, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    
    // Create test directory structure
    await mkdir(TEST_BASE_PATH, { recursive: true });
    
    client = new ObservabilityQueryClient({
      basePath: TEST_BASE_PATH,
    });
  });

  afterEach(async () => {
    // Clean up
    try {
      await rm(TEST_BASE_PATH, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getHealth', () => {
    it('should return false for non-existent worktree', async () => {
      const health = await client.getHealth('non-existent');
      
      expect(health.allHealthy).toBe(false);
      expect(health.victoriaLogs).toBe(false);
      expect(health.victoriaMetrics).toBe(false);
      expect(health.victoriaTraces).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should return false for non-existent worktree', async () => {
      const available = await client.isAvailable('non-existent');
      expect(available).toBe(false);
    });
  });

  describe('queryLogs', () => {
    it('should return error for non-existent worktree', async () => {
      const result = await client.queryLogs('non-existent', '{app="factorial"}');
      
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Failed to load ports configuration');
      }
    });
  });

  describe('queryMetrics', () => {
    it('should return error for non-existent worktree', async () => {
      const result = await client.queryMetrics('non-existent', 'up');
      
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Failed to load ports configuration');
      }
    });

    it('should return error for non-existent worktree with time range', async () => {
      const result = await client.queryMetrics('non-existent', 'up', {
        start: new Date(Date.now() - 3600000),
        end: new Date(),
      });
      
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Failed to load ports configuration');
      }
    });
  });

  describe('queryTraces', () => {
    it('should return error for non-existent worktree', async () => {
      const result = await client.queryTraces('non-existent', '{trace_id="abc"}');
      
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Failed to load ports configuration');
      }
    });
  });

  describe('Convenience functions', () => {
    it('queryLogs convenience function should work', async () => {
      const { queryLogs } = await import('./query-client.js');
      
      const result = await queryLogs('non-existent', '{app="factorial"}', {
        basePath: TEST_BASE_PATH,
      });
      
      expect('error' in result).toBe(true);
    });

    it('queryMetrics convenience function should work', async () => {
      const { queryMetrics } = await import('./query-client.js');
      
      const result = await queryMetrics('non-existent', 'up', {
        basePath: TEST_BASE_PATH,
      });
      
      expect('error' in result).toBe(true);
    });

    it('queryTraces convenience function should work', async () => {
      const { queryTraces } = await import('./query-client.js');
      
      const result = await queryTraces('non-existent', '{trace_id="abc"}', {
        basePath: TEST_BASE_PATH,
      });
      
      expect('error' in result).toBe(true);
    });
  });
});
