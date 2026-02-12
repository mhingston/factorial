import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe('Self-host unattended telemetry report script', () => {
  it('publishes schema-compliant unattended telemetry report when source is valid and fresh', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-unattended-telemetry-pass-'));
    const sourcePath = join(tempRoot, 'source.json');
    const reportPath = join(tempRoot, 'report.json');

    await writeJson(sourcePath, buildCompliantSource('2026-02-12T12:00:00.000Z'));

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-unattended-telemetry-report.js'),
        '--source',
        sourcePath,
        '--report',
        reportPath,
        '--today',
        '2026-02-12',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('self_host_unattended_telemetry_report.v1');
    expect(report.summary).toMatchObject({
      overall_status: 'pass',
      failed_check_ids: [],
      total_runs: 8,
      successful_runs: 6,
      merged_prs: 4,
      run_success_rate: 0.75,
      run_to_merge_ratio: 2,
      cost_per_merged_pr_proxy: 0.5654,
      revert_rate: 0.25,
      churn_pr_rate: 0.75,
      average_churn_commits_per_merged_pr: 1.75,
      task_distribution: {
        small: 3,
        medium: 3,
        large: 2,
      },
    });

    const checks = (report.checks as Array<Record<string, unknown>>) ?? [];
    const checkById = Object.fromEntries(checks.map(check => [String(check.id), check]));
    expect(String((checkById['UT-001'] || {}).status)).toBe('pass');
    expect(String((checkById['UT-002'] || {}).status)).toBe('pass');
    expect(String((checkById['UT-003'] || {}).status)).toBe('pass');
    expect(String((checkById['UT-004'] || {}).status)).toBe('pass');
  });

  it('fails closed when source payload is missing required fields', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-unattended-telemetry-missing-'));
    const sourcePath = join(tempRoot, 'source.json');
    const reportPath = join(tempRoot, 'report.json');

    const malformed = buildCompliantSource('2026-02-12T12:00:00.000Z') as Record<string, unknown>;
    delete malformed.runs;
    await writeJson(sourcePath, malformed);

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-unattended-telemetry-report.js'),
        '--source',
        sourcePath,
        '--report',
        reportPath,
        '--today',
        '2026-02-12',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.overall_status).toBe('fail');

    const failedCheckIds = Array.isArray(summary.failed_check_ids)
      ? summary.failed_check_ids.map(value => String(value))
      : [];
    expect(failedCheckIds).toContain('UT-001');
  });

  it('fails closed when source freshness SLA is violated', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-unattended-telemetry-stale-'));
    const sourcePath = join(tempRoot, 'source.json');
    const reportPath = join(tempRoot, 'report.json');

    await writeJson(sourcePath, buildCompliantSource('2025-12-01T00:00:00.000Z'));

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-unattended-telemetry-report.js'),
        '--source',
        sourcePath,
        '--report',
        reportPath,
        '--today',
        '2026-02-12',
        '--max-source-age-days',
        '14',
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.overall_status).toBe('fail');

    const failedCheckIds = Array.isArray(summary.failed_check_ids)
      ? summary.failed_check_ids.map(value => String(value))
      : [];
    expect(failedCheckIds).toContain('UT-002');
  });
});

function buildCompliantSource(generatedAt: string): Record<string, unknown> {
  return {
    schema_version: 'self_host_unattended_telemetry_source.v1',
    generated_at: generatedAt,
    window: {
      start: '2026-01-29T00:00:00.000Z',
      end: '2026-02-12T00:00:00.000Z',
    },
    maintenance_window_days: 14,
    merged_prs: [
      {
        pr_id: 'PR-201',
        merged_at: '2026-02-02T10:00:00.000Z',
        reverted_within_window: false,
        churn_commits_within_window: 1,
      },
      {
        pr_id: 'PR-202',
        merged_at: '2026-02-05T14:00:00.000Z',
        reverted_within_window: true,
        churn_commits_within_window: 4,
      },
      {
        pr_id: 'PR-203',
        merged_at: '2026-02-09T16:30:00.000Z',
        reverted_within_window: false,
        churn_commits_within_window: 2,
      },
      {
        pr_id: 'PR-204',
        merged_at: '2026-02-11T18:45:00.000Z',
        reverted_within_window: false,
        churn_commits_within_window: 0,
      },
    ],
    runs: [
      {
        run_id: 'RUN-001',
        status: 'success',
        merged_pr_id: 'PR-201',
        changed_files: 2,
        changed_test_files: 1,
        runtime_minutes: 6,
        input_tokens: 1000,
        output_tokens: 200,
        execution_minutes: 8,
      },
      {
        run_id: 'RUN-002',
        status: 'success',
        merged_pr_id: 'PR-202',
        changed_files: 8,
        changed_test_files: 3,
        runtime_minutes: 22,
        input_tokens: 4800,
        output_tokens: 900,
        execution_minutes: 26,
      },
      {
        run_id: 'RUN-003',
        status: 'fail',
        merged_pr_id: '',
        changed_files: 5,
        changed_test_files: 2,
        runtime_minutes: 18,
        input_tokens: 3400,
        output_tokens: 600,
        execution_minutes: 20,
      },
      {
        run_id: 'RUN-004',
        status: 'success',
        merged_pr_id: 'PR-202',
        changed_files: 12,
        changed_test_files: 5,
        runtime_minutes: 48,
        input_tokens: 7200,
        output_tokens: 1200,
        execution_minutes: 52,
      },
      {
        run_id: 'RUN-005',
        status: 'success',
        merged_pr_id: 'PR-203',
        changed_files: 3,
        changed_test_files: 1,
        runtime_minutes: 9,
        input_tokens: 2200,
        output_tokens: 500,
        execution_minutes: 11,
      },
      {
        run_id: 'RUN-006',
        status: 'success',
        merged_pr_id: 'PR-203',
        changed_files: 16,
        changed_test_files: 6,
        runtime_minutes: 60,
        input_tokens: 9800,
        output_tokens: 1900,
        execution_minutes: 65,
      },
      {
        run_id: 'RUN-007',
        status: 'fail',
        merged_pr_id: '',
        changed_files: 4,
        changed_test_files: 1,
        runtime_minutes: 12,
        input_tokens: 1800,
        output_tokens: 400,
        execution_minutes: 14,
      },
      {
        run_id: 'RUN-008',
        status: 'success',
        merged_pr_id: 'PR-204',
        changed_files: 7,
        changed_test_files: 2,
        runtime_minutes: 20,
        input_tokens: 4200,
        output_tokens: 700,
        execution_minutes: 22,
      },
    ],
  };
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

async function run(cmd: string[], cwd: string): Promise<CommandResult> {
  return new Promise(resolve => {
    const [exe, ...args] = cmd;
    const child = spawn(exe, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const out: string[] = [];
    const err: string[] = [];

    child.stdout.on('data', chunk => out.push(String(chunk)));
    child.stderr.on('data', chunk => err.push(String(chunk)));

    child.on('close', code => {
      resolve({
        code: code ?? 1,
        stdout: out.join(''),
        stderr: err.join(''),
      });
    });
  });
}
