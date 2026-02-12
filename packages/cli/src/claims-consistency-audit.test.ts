import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
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

describe('Claims consistency audit script', () => {
  it('passes for compliant claims fixtures', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-claims-audit-pass-'));
    const reportPath = join(tempRoot, 'claims-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'claims-consistency-audit.js'),
        '--roadmap',
        join(ROOT_DIR, 'tests', 'fixtures', 'claims-audit', 'roadmap.compliant.md'),
        '--matrix',
        join(ROOT_DIR, 'tests', 'fixtures', 'claims-audit', 'spec-matrix.compliant.md'),
        '--companion',
        join(ROOT_DIR, 'tests', 'fixtures', 'claims-audit', 'companion.compliant.md'),
        '--maturity',
        join(ROOT_DIR, 'tests', 'fixtures', 'claims-audit', 'maturity.compliant.md'),
        '--report',
        reportPath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('claims_consistency_report.v1');
    expect(report.summary).toMatchObject({
      overall_status: 'pass',
      failed_check_ids: [],
      declared_current_level: 'provider-backed',
      declared_next_level: 'autonomous',
      cal_delta_02_status: 'closed',
      ullm_delta_02_status: 'closed',
      companion_unattended_scope: 'out-of-scope',
    });
  });

  it('fails when companion current-level claim drifts from roadmap/maturity', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-claims-audit-fail-'));
    const reportPath = join(tempRoot, 'claims-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'claims-consistency-audit.js'),
        '--roadmap',
        join(ROOT_DIR, 'tests', 'fixtures', 'claims-audit', 'roadmap.compliant.md'),
        '--matrix',
        join(ROOT_DIR, 'tests', 'fixtures', 'claims-audit', 'spec-matrix.compliant.md'),
        '--companion',
        join(ROOT_DIR, 'tests', 'fixtures', 'claims-audit', 'companion.mismatch-current-level.md'),
        '--maturity',
        join(ROOT_DIR, 'tests', 'fixtures', 'claims-audit', 'maturity.compliant.md'),
        '--report',
        reportPath,
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
    expect(failedCheckIds).toContain('CLM-002');
  });
});

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
