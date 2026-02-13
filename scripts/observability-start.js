#!/usr/bin/env node

/**
 * Observability Stack Start Script
 * 
 * Starts the observability stack (Vector + Victoria Logs/Metrics/Traces) for the current worktree.
 * This provides agent-legible access to logs, metrics, and traces.
 * 
 * Usage:
 *   node scripts/observability-start.js [--worktree-id <id>] [--base-port <port>]
 *   npm run observability:start
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

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
  let basePort = '9428';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--worktree-id' && i + 1 < args.length) {
      worktreeId = args[i + 1];
      i++;
    } else if (args[i] === '--base-port' && i + 1 < args.length) {
      basePort = args[i + 1];
      i++;
    }
  }

  worktreeId = worktreeId || getWorktreeId();

  // Check if Docker is available
  try {
    execSync('docker --version', { stdio: 'ignore' });
  } catch {
    console.error('Error: Docker is not available. Observability stack requires Docker.');
    process.exit(1);
  }

  // Build and execute the factorial command
  const cmd = `node dist/packages/cli/src/index.js observability:start --worktree-id "${worktreeId}" --base-port ${basePort}`;
  
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    process.exit(error.status || 1);
  }
}

main();
