import { spawn } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export type WorktreeMergeStrategy = 'fail' | 'ours' | 'theirs';

export interface WorktreeInfo {
  branchId: string;
  path: string;
  createdAt: string;
}

export interface WorktreeMergeResult {
  success: boolean;
  conflicts?: string[];
  error?: string;
}

export class WorktreeManager {
  private basePath: string;
  private repoRoot: string;
  private worktrees: Map<string, WorktreeInfo> = new Map();

  constructor(options: { basePath: string; repoRoot: string }) {
    this.basePath = options.basePath;
    this.repoRoot = options.repoRoot;
  }

  /**
   * Check if current directory is inside a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      const result = await this.execGit(['rev-parse', '--git-dir']);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if working tree has uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const result = await this.execGit(['status', '--porcelain']);
    return result.exitCode === 0 && result.stdout.trim().length > 0;
  }

  /**
   * Get current git HEAD commit SHA
   */
  async getCurrentHead(): Promise<string> {
    const result = await this.execGit(['rev-parse', 'HEAD']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get HEAD: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  /**
   * Create a new worktree for a branch
   */
  async createWorktree(branchId: string): Promise<WorktreeInfo> {
    const worktreePath = join(this.basePath, branchId);
    
    // Ensure base directory exists
    await mkdir(this.basePath, { recursive: true });

    // Check if worktree already exists
    try {
      await access(worktreePath);
      throw new Error(`Worktree already exists at ${worktreePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const head = await this.getCurrentHead();
    const branchName = `factorial-worktree-${branchId}`;

    // Create worktree: git worktree add -b <branch> <path> <commit>
    const result = await this.execGit([
      'worktree',
      'add',
      '-b',
      branchName,
      worktreePath,
      head,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create worktree: ${result.stderr}`);
    }

    const info: WorktreeInfo = {
      branchId,
      path: worktreePath,
      createdAt: new Date().toISOString(),
    };

    this.worktrees.set(branchId, info);
    return info;
  }

  /**
   * Merge a worktree back into the main working tree
   */
  async mergeWorktree(branchId: string, strategy: WorktreeMergeStrategy): Promise<WorktreeMergeResult> {
    const worktree = this.worktrees.get(branchId);
    if (!worktree) {
      return { success: false, error: `Worktree for branch ${branchId} not found` };
    }

    // Get the branch name used for the worktree
    const branchName = `factorial-worktree-${branchId}`;

    // First, check if there are any changes to merge
    const diffResult = await this.execGit(['diff', '--stat', 'HEAD', branchName]);
    if (diffResult.exitCode !== 0) {
      return { success: false, error: `Failed to check diff: ${diffResult.stderr}` };
    }

    if (!diffResult.stdout.trim()) {
      // No changes to merge
      return { success: true };
    }

    // Attempt merge
    const mergeResult = await this.execGit(['merge', '--no-commit', '--no-ff', branchName]);
    
    if (mergeResult.exitCode === 0) {
      // Clean merge
      return { success: true };
    }

    // Check for conflicts
    const conflictResult = await this.execGit(['diff', '--name-only', '--diff-filter=U']);
    const conflicts = conflictResult.stdout
      .trim()
      .split('\n')
      .filter(line => line.length > 0);

    if (conflicts.length === 0) {
      // No conflicts, but merge failed for other reason
      await this.execGit(['merge', '--abort']);
      return { success: false, error: `Merge failed: ${mergeResult.stderr}` };
    }

    // Handle conflicts based on strategy
    switch (strategy) {
      case 'fail':
        await this.execGit(['merge', '--abort']);
        return { success: false, conflicts, error: `Merge conflicts detected: ${conflicts.join(', ')}` };
      
      case 'ours':
        // Accept current (main) version for all conflicts
        for (const file of conflicts) {
          await this.execGit(['checkout', '--ours', file]);
          await this.execGit(['add', file]);
        }
        return { success: true, conflicts: conflicts.map(c => `${c} (resolved: ours)`) };
      
      case 'theirs':
        // Accept worktree (branch) version for all conflicts
        for (const file of conflicts) {
          await this.execGit(['checkout', '--theirs', file]);
          await this.execGit(['add', file]);
        }
        return { success: true, conflicts: conflicts.map(c => `${c} (resolved: theirs)`) };
      
      default:
        await this.execGit(['merge', '--abort']);
        return { success: false, error: `Unknown merge strategy: ${strategy}` };
    }
  }

  /**
   * Clean up (remove) a worktree
   */
  async cleanupWorktree(branchId: string): Promise<void> {
    const worktree = this.worktrees.get(branchId);
    if (!worktree) {
      return;
    }

    const branchName = `factorial-worktree-${branchId}`;

    // Remove worktree
    try {
      await this.execGit(['worktree', 'remove', '--force', worktree.path]);
    } catch (error) {
      // If git worktree remove fails, try manual cleanup
      await rm(worktree.path, { recursive: true, force: true });
    }

    // Delete the branch
    await this.execGit(['branch', '-D', branchName]);

    this.worktrees.delete(branchId);
  }

  /**
   * Clean up all worktrees
   */
  async cleanupAll(): Promise<void> {
    const promises = Array.from(this.worktrees.keys()).map(id => this.cleanupWorktree(id));
    await Promise.all(promises);
  }

  /**
   * Get worktree info for a branch
   */
  getWorktree(branchId: string): WorktreeInfo | undefined {
    return this.worktrees.get(branchId);
  }

  /**
   * Get all worktrees
   */
  getAllWorktrees(): WorktreeInfo[] {
    return Array.from(this.worktrees.values());
  }

  /**
   * Execute git command
   */
  private execGit(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: this.repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (exitCode) => {
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    });
  }
}
