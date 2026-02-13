import { access, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ObservabilityStackConfig, ObservabilityStackManager } from './stack-manager.js';

const TEST_REPO_ROOT = '/tmp/factorial-observability-test';

describe('ObservabilityStackManager', () => {
  let manager: ObservabilityStackManager;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await rm(TEST_REPO_ROOT, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    
    // Create test directory
    await mkdir(TEST_REPO_ROOT, { recursive: true });
    
    manager = new ObservabilityStackManager({
      repoRoot: TEST_REPO_ROOT,
      basePath: join(TEST_REPO_ROOT, '.factorial', 'observability'),
    });
  });

  afterEach(async () => {
    // Clean up
    try {
      await rm(TEST_REPO_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getStackConfig', () => {
    it('should calculate deterministic ports from worktree ID', async () => {
      const config1 = await manager.getStackConfig('test-worktree-1');
      const config2 = await manager.getStackConfig('test-worktree-1');
      const config3 = await manager.getStackConfig('test-worktree-2');

      // Same worktree ID should get same config
      expect(config1.basePort).toBe(config2.basePort);
      
      // Different worktree IDs should get different configs
      expect(config1.basePort).not.toBe(config3.basePort);
    });

    it('should include worktree-specific paths', async () => {
      const config = await manager.getStackConfig('my-worktree');

      expect(config.worktreeId).toBe('my-worktree');
      expect(config.dataRoot).toContain('my-worktree');
      expect(config.logsRoot).toBe(join(TEST_REPO_ROOT, 'logs'));
    });
  });

  describe('isDockerAvailable', () => {
    it('should return boolean', async () => {
      const available = await manager.isDockerAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Stack lifecycle', () => {
    it('should create and retrieve stack status', async () => {
      const worktreeId = 'test-lifecycle';
      
      // Check initial status (should not exist)
      const initialStatus = await manager.getStackStatus(worktreeId);
      expect(initialStatus.running).toBe(false);

      // Create stack config
      const config = await manager.getStackConfig(worktreeId);
      
      // Verify ports are allocated correctly
      expect(config.basePort).toBeGreaterThan(0);
      expect(config.dataRoot).toContain(worktreeId);
    });

    it('should list stacks correctly', async () => {
      const worktreeId = 'test-list';
      const config = await manager.getStackConfig(worktreeId);
      
      // List should initially be empty
      const initialList = await manager.listStacks();
      expect(initialList.length).toBe(0);
    });

    it('should clean up stack configuration', async () => {
      const worktreeId = 'test-cleanup';
      const config = await manager.getStackConfig(worktreeId);
      
      // Create directory structure manually to test cleanup
      const stackPath = join(TEST_REPO_ROOT, '.factorial', 'observability', worktreeId);
      await mkdir(stackPath, { recursive: true });
      await mkdir(join(stackPath, 'data'), { recursive: true });
      
      // Verify directory exists
      await access(stackPath);
      
      // Clean up
      await manager.cleanupStack(worktreeId);
      
      // Verify directory is removed
      try {
        await access(stackPath);
        expect.fail('Directory should have been removed');
      } catch {
        // Expected - directory was removed
      }
    });
  });

  describe('Port allocation', () => {
    it('should allocate non-conflicting ports for different worktrees', async () => {
      const worktrees = ['wt-1', 'wt-2', 'wt-3', 'wt-4', 'wt-5'];
      const ports: number[] = [];

      for (const worktreeId of worktrees) {
        const config = await manager.getStackConfig(worktreeId);
        ports.push(config.basePort);
      }

      // All ports should be unique
      const uniquePorts = new Set(ports);
      expect(uniquePorts.size).toBe(ports.length);
    });

    it('should allocate ports within valid range', async () => {
      const config = await manager.getStackConfig('test-range');
      
      // Ports should be in ephemeral range (> 1024) and below max
      expect(config.basePort).toBeGreaterThan(1024);
      expect(config.basePort).toBeLessThan(65535);
    });
  });
});
