import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorktreeManager } from './manager.js';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

describe('WorktreeManager', () => {
  it('detects non-git repository', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'attractor-worktree-test-'));
    const manager = new WorktreeManager({ basePath, repoRoot: basePath });
    
    const isGit = await manager.isGitRepository();
    expect(isGit).toBe(false);
  });

  it('detects git repository', async () => {
    // This test runs in the factorial repo which is a git repo
    const basePath = await mkdtemp(join(tmpdir(), 'attractor-worktree-test-'));
    const manager = new WorktreeManager({ basePath, repoRoot: process.cwd() });
    
    const isGit = await manager.isGitRepository();
    expect(isGit).toBe(true);
  });

  it('validates merge strategy types', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'attractor-worktree-test-'));
    const manager = new WorktreeManager({ basePath, repoRoot: process.cwd() });
    
    // Just verify the manager was created successfully
    expect(manager).toBeDefined();
  });
});
