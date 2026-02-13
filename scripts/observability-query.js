#!/usr/bin/env node

/**
 * Observability Query Script
 * 
 * Queries logs, metrics, or traces from the observability stack.
 * 
 * Usage:
 *   node scripts/observability-query.js --type <logs|metrics|traces> --query "<query>"
 *   npm run observability:query -- --type logs --query '{app="factorial"}'
 * 
 * Examples:
 *   # Query recent logs
 *   node scripts/observability-query.js --type logs --query '{app="factorial"}'
 * 
 *   # Query metrics
 *   node scripts/observability-query.js --type metrics --query 'up'
 * 
 *   # Query traces
 *   node scripts/observability-query.js --type traces --query '{trace_id="abc123"}'
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

function printUsage() {
  console.log(`
Usage: node scripts/observability-query.js [options]

Options:
  --type <logs|metrics|traces>   Query type (required)
  --query <string>               Query string in LogQL/PromQL/TraceQL (required)
  --worktree-id <id>             Worktree ID (defaults to git branch)
  --start <iso-date>             Start time (ISO 8601)
  --end <iso-date>               End time (ISO 8601)
  --limit <n>                    Maximum results (default: 100)
  --json                         Output JSON format

Examples:
  # Query logs for errors
  node scripts/observability-query.js --type logs --query '{app="factorial"} |= "ERROR"'

  # Query service uptime metric
  node scripts/observability-query.js --type metrics --query 'up'

  # Query traces with specific span name
  node scripts/observability-query.js --type traces --query '{span.name=~"user_journey.*"}'
`);
}

function main() {
  const args = process.argv.slice(2);
  
  // Show help if no args or --help
  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }
  
  // Parse arguments
  const options = {
    type: null,
    query: null,
    worktreeId: null,
    start: null,
    end: null,
    limit: null,
    json: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type':
        options.type = args[++i];
        break;
      case '--query':
        options.query = args[++i];
        break;
      case '--worktree-id':
        options.worktreeId = args[++i];
        break;
      case '--start':
        options.start = args[++i];
        break;
      case '--end':
        options.end = args[++i];
        break;
      case '--limit':
        options.limit = args[++i];
        break;
      case '--json':
        options.json = true;
        break;
    }
  }

  // Validate required arguments
  if (!options.type) {
    console.error('Error: --type is required');
    printUsage();
    process.exit(1);
  }

  if (!options.query) {
    console.error('Error: --query is required');
    printUsage();
    process.exit(1);
  }

  options.worktreeId = options.worktreeId || getWorktreeId();

  // Build the factorial command
  let cmd = `node dist/packages/cli/src/index.js observability:query --type "${options.type}" --query "${options.query}" --worktree-id "${options.worktreeId}"`;
  
  if (options.start) {
    cmd += ` --start "${options.start}"`;
  }
  if (options.end) {
    cmd += ` --end "${options.end}"`;
  }
  if (options.limit) {
    cmd += ` --limit "${options.limit}"`;
  }
  if (options.json) {
    cmd += ' --json';
  }
  
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    process.exit(error.status || 1);
  }
}

main();
