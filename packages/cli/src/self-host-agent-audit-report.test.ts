import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe('Self-host agent-audit report script', () => {
  it('publishes schema-compliant report from passing audit output contract', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-agent-audit-pass-'));
    const reportPath = join(tempRoot, 'agent-audit-report.json');

    const auditCommand = `${process.execPath} -e "console.log('[PASS] Lint (` + '\\`npm run lint\\`' + `): ok'); console.log('[PASS] Typecheck (` + '\\`npm run typecheck\\`' + `): ok'); console.log('[PASS] Tests (` + '\\`npm run test:run\\`' + `): ok'); console.log('[PASS] Git access (` + '\\`git status --porcelain\\`' + `): ok'); console.log('[SKIP] Optional local service probe: disabled'); console.log('Required checks passed: 4'); console.log('Required checks failed: 0'); console.log('Optional checks skipped: 1'); console.log('Audit result: PASS');"`;

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-agent-audit-report.js'),
        '--report',
        reportPath,
        '--audit-command',
        auditCommand,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('self_host_agent_audit_report.v1');
    expect(report.summary).toMatchObject({
      overall_status: 'pass',
      audit_result: 'PASS',
      required_checks_passed: 4,
      required_checks_failed: 0,
      optional_checks_skipped: 1,
    });

    const checks = (report.checks as Array<Record<string, unknown>>) ?? [];
    expect(checks.length).toBe(5);
    expect(checks.filter(check => check.required === true).length).toBe(4);
    expect(checks.filter(check => check.required === false).length).toBe(1);
    expect(checks.map(check => String(check.name))).toContain('Tests (`npm run test:run`)');
  });

  it('fails when audit command reports required check failures', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-agent-audit-fail-'));
    const reportPath = join(tempRoot, 'agent-audit-report.json');

    const auditCommand = `${process.execPath} -e "console.log('[PASS] Lint (` + '\\`npm run lint\\`' + `): ok'); console.log('[FAIL] Tests (` + '\\`npm run test:run\\`' + `): exit code 1'); console.log('Required checks passed: 1'); console.log('Required checks failed: 1'); console.log('Optional checks skipped: 0'); console.log('Audit result: FAIL'); process.exit(1);"`;

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-agent-audit-report.js'),
        '--report',
        reportPath,
        '--audit-command',
        auditCommand,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = (report.summary ?? {}) as Record<string, unknown>;

    expect(summary.overall_status).toBe('fail');
    expect(summary.audit_result).toBe('FAIL');
    expect(summary.required_checks_failed).toBe(1);
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
