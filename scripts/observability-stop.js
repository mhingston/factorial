#!/usr/bin/env node

/**
 * Observability Stack Stop Script
 * 
 * Stops and optionally cleans up the observability stack for the current worktree.
 * 
 * Usage:
 *   node scripts/observability-stop.js [--worktree-id <id>] [--cleanup]
 *   npm run observability:stop
 */

import { execSync } from 'node:child_process';

function getWorktreeId() {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' });
    return result.trim().replace(/[^a-zA-Z0-9-]/g, '-');
  } catch {
    return 'default';
  }
}

function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let worktreeId = null;
  let cleanup = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--worktree-id' && i + 1 < args.length) {
      worktreeId = args[i + 1];
      i++;
    } else if (args[i] === '--cleanup') {
      cleanup = true;
    }
  }

  worktreeId = worktreeId || getWorktreeId();

  // Build and execute the factorial command
  let cmd = `node dist/packages/cli/src/index.js observability:stop --worktree-id "${worktreeId}"`;
  if (cleanup) {
    cmd += ' --cleanup';
  }
  
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    process.exit(error.status || 1);
  }
}

main();
