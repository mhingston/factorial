import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { beforeAll, describe, expect, it } from 'vitest';

describe('metrics:economics e2e', () => {
  let tempDir: string;
  let cliPath: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'economics-e2e-'));
    cliPath = join(import.meta.dirname, '../../../dist/packages/cli/src/index.js');
  });

  it('should generate economics report with --json flag', async () => {
    // Create mock logs directory with sample output files
    const logsDir = join(tempDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    // Create sample output.json
    const sampleOutput = {
      status: 'success',
      provider: 'openai',
      model: 'gpt-4o',
      node_type: 'codergen',
      backend: 'api',
      reasoning_effort: 'high',
      fidelity: 'compact',
      prompt_path: '/path/to/prompt.md',
      response_path: '/path/to/response.md',
      output_mode: 'text',
      output: 'Test output',
      preferred_label: '',
      suggested_next_ids: [],
      notes: '',
      failure_reason: '',
      validation_result: 'skipped',
      validation_errors: [],
      validation: null,
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        total_tokens: 1500,
        cost_usd: 0.0075,
        cost_breakdown: {
          input_cost_usd: 0.0025,
          output_cost_usd: 0.005,
        },
      },
      attribution: {
        workflow_node_id: 'test_node',
        scenario_id: 'test-scenario',
        run_manifest_id: 'manifest-123',
        phase: 'work',
      },
      timestamp: new Date().toISOString(),
    };

    const nodeDir = join(logsDir, 'test_node');
    await mkdir(nodeDir, { recursive: true });
    await writeFile(join(nodeDir, 'output.json'), JSON.stringify(sampleOutput, null, 2));

    // Run the CLI command
    const result = await execa('node', [
      cliPath,
      'metrics:economics',
      '--logs-root', logsDir,
      '--json',
    ], { reject: false });

    expect(result.exitCode).toBe(0);
    
    const report = JSON.parse(result.stdout);
    expect(report.schemaVersion).toBe('economics_report.v1');
    expect(report.summary.totalCalls).toBe(1);
    expect(report.summary.totalSpendUsd).toBeGreaterThan(0);
    expect(report.byProvider.openai).toBeDefined();
    expect(report.byPhase.work).toBeDefined();
  });

  it('should respect date filters', async () => {
    const logsDir = join(tempDir, 'logs2');
    await mkdir(logsDir, { recursive: true });

    // Create old record
    const oldOutput = {
      status: 'success',
      provider: 'openai',
      model: 'gpt-4o',
      node_type: 'codergen',
      backend: 'api',
      usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500, cost_usd: 0.0075 },
      attribution: { workflow_node_id: 'old_node', phase: 'work' },
      timestamp: '2024-01-01T00:00:00Z',
    };

    // Create recent record
    const recentOutput = {
      status: 'success',
      provider: 'anthropic',
      model: 'claude-sonnet',
      node_type: 'codergen',
      backend: 'api',
      usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500, cost_usd: 0.009 },
      attribution: { workflow_node_id: 'recent_node', phase: 'review' },
      timestamp: new Date().toISOString(),
    };

    const oldDir = join(logsDir, 'old_node');
    const recentDir = join(logsDir, 'recent_node');
    await mkdir(oldDir, { recursive: true });
    await mkdir(recentDir, { recursive: true });
    await writeFile(join(oldDir, 'output.json'), JSON.stringify(oldOutput));
    await writeFile(join(recentDir, 'output.json'), JSON.stringify(recentOutput));

    // Run with date filter for recent only
    const result = await execa('node', [
      cliPath,
      'metrics:economics',
      '--logs-root', logsDir,
      '--start-date', new Date().toISOString().slice(0, 10),
      '--json',
    ], { reject: false });

    expect(result.exitCode).toBe(0);
    
    const report = JSON.parse(result.stdout);
    expect(report.summary.totalCalls).toBe(1);
    expect(report.byProvider.anthropic).toBeDefined();
    expect(report.byProvider.openai).toBeUndefined();
  });

  it('should write report to file with --output', async () => {
    const logsDir = join(tempDir, 'logs3');
    await mkdir(logsDir, { recursive: true });

    const outputPath = join(tempDir, 'economics-report.json');

    const sampleOutput = {
      status: 'success',
      provider: 'openai',
      model: 'gpt-4o',
      node_type: 'codergen',
      backend: 'api',
      usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500, cost_usd: 0.0075 },
      attribution: { workflow_node_id: 'test_node', phase: 'plan' },
      timestamp: new Date().toISOString(),
    };

    const nodeDir = join(logsDir, 'test_node');
    await mkdir(nodeDir, { recursive: true });
    await writeFile(join(nodeDir, 'output.json'), JSON.stringify(sampleOutput));

    const result = await execa('node', [
      cliPath,
      'metrics:economics',
      '--logs-root', logsDir,
      '--output', outputPath,
    ], { reject: false });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Total Spend');
  });

  it('should handle empty logs directory', async () => {
    const emptyDir = join(tempDir, 'empty_logs');
    await mkdir(emptyDir, { recursive: true });

    const result = await execa('node', [
      cliPath,
      'metrics:economics',
      '--logs-root', emptyDir,
      '--json',
    ], { reject: false });

    expect(result.exitCode).toBe(0);
    
    const report = JSON.parse(result.stdout);
    expect(report.summary.totalCalls).toBe(0);
    expect(report.summary.totalSpendUsd).toBe(0);
  });

  it('should fail with invalid date format', async () => {
    const result = await execa('node', [
      cliPath,
      'metrics:economics',
      '--logs-root', tempDir,
      '--start-date', 'invalid-date',
    ], { reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('start-date must be YYYY-MM-DD');
  });

  it('should fail when end-date is before start-date', async () => {
    const result = await execa('node', [
      cliPath,
      'metrics:economics',
      '--logs-root', tempDir,
      '--start-date', '2024-12-01',
      '--end-date', '2024-01-01',
    ], { reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('end-date must be on or after start-date');
  });
});
