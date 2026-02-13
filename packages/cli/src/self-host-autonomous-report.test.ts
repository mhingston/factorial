import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

describe('Self-host autonomous report script', () => {
  it('publishes schema-compliant autonomous evidence report with pass status', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-autonomous-pass-'));
    const reportPath = join(tempRoot, 'autonomous-report.json');

    const flakeReportPath = join(tempRoot, 'flake.json');
    await writeJson(flakeReportPath, {
      schema_version: 'self_host_flake_report.v1',
      summary: {
        overall_status: 'pass',
      },
    });

    const reliabilityReportPath = join(tempRoot, 'reliability.json');
    await writeJson(reliabilityReportPath, {
      schema_version: 'compound_reliability_slo_report.v1',
      summary: {
        overall_status: 'pass',
        consensus_lock_decision: 'resolved',
      },
    });

    const providerBackedReportPath = join(tempRoot, 'provider-backed.json');
    await writeJson(providerBackedReportPath, {
      schema_version: 'self_host_provider_backed_report.v1',
      summary: {
        overall_status: 'pass',
      },
    });

    const maturityLadderPath = join(tempRoot, 'self-hosting-maturity-ladder.md');
    await writeFile(
      maturityLadderPath,
      ['Declared current level: `provider-backed`', 'Declared next level: `autonomous`', ''].join('\n'),
      'utf-8',
    );

    const companionScopePath = join(tempRoot, 'companion-spec-scope-contract.md');
    await writeFile(
      companionScopePath,
      [
        '| Unbounded unattended autonomous operation across external systems | `out-of-scope` |',
        'Current scope does not claim unattended external-system autonomy.',
        '',
      ].join('\n'),
      'utf-8',
    );

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-autonomous-report.js'),
        '--report',
        reportPath,
        '--flake-report',
        flakeReportPath,
        '--reliability-report',
        reliabilityReportPath,
        '--provider-backed-report',
        providerBackedReportPath,
        '--maturity-ladder',
        maturityLadderPath,
        '--companion-scope',
        companionScopePath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('self_host_autonomous_report.v1');
    expect(report.summary).toMatchObject({
      au001_status: 'pass',
      stability_pass: true,
      guardrails_pass: true,
      human_free_pass: true,
      overall_status: 'pass',
      failed_check_ids: [],
    });

    const checks = (report.checks as Array<Record<string, unknown>>) ?? [];
    const checkById = Object.fromEntries(checks.map(check => [String(check.id), check]));

    expect(String((checkById['AU-STAB-001'] || {}).status)).toBe('pass');
    expect(String((checkById['AU-STAB-002'] || {}).status)).toBe('pass');
    expect(String((checkById['AU-STAB-003'] || {}).status)).toBe('pass');
    expect(String((checkById['AU-GUARD-001'] || {}).status)).toBe('pass');
    expect(String((checkById['AU-GUARD-002'] || {}).status)).toBe('pass');
    expect(String((checkById['AU-HUMAN-001'] || {}).status)).toBe('pass');
  });

  it('fails when explicit human-free autonomy guardrail policy assertion is missing', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-autonomous-fail-'));
    const reportPath = join(tempRoot, 'autonomous-report.json');

    const flakeReportPath = join(tempRoot, 'flake.json');
    await writeJson(flakeReportPath, {
      schema_version: 'self_host_flake_report.v1',
      summary: { overall_status: 'pass' },
    });

    const reliabilityReportPath = join(tempRoot, 'reliability.json');
    await writeJson(reliabilityReportPath, {
      schema_version: 'compound_reliability_slo_report.v1',
      summary: { overall_status: 'pass', consensus_lock_decision: 'resolved' },
    });

    const providerBackedReportPath = join(tempRoot, 'provider-backed.json');
    await writeJson(providerBackedReportPath, {
      schema_version: 'self_host_provider_backed_report.v1',
      summary: { overall_status: 'pass' },
    });

    const maturityLadderPath = join(tempRoot, 'self-hosting-maturity-ladder.md');
    await writeFile(
      maturityLadderPath,
      ['Declared current level: `provider-backed`', 'Declared next level: `autonomous`', ''].join('\n'),
      'utf-8',
    );

    const companionScopePath = join(tempRoot, 'companion-spec-scope-contract.md');
    await writeFile(
      companionScopePath,
      ['| Unbounded unattended autonomous operation across external systems | `out-of-scope` |', ''].join('\n'),
      'utf-8',
    );

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-autonomous-report.js'),
        '--report',
        reportPath,
        '--flake-report',
        flakeReportPath,
        '--reliability-report',
        reliabilityReportPath,
        '--provider-backed-report',
        providerBackedReportPath,
        '--maturity-ladder',
        maturityLadderPath,
        '--companion-scope',
        companionScopePath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = (report.summary ?? {}) as Record<string, unknown>;
    expect(summary.au001_status).toBe('fail');
    expect(summary.human_free_pass).toBe(false);

    const failed = Array.isArray(summary.failed_check_ids)
      ? summary.failed_check_ids.map(value => String(value))
      : [];
    expect(failed).toContain('AU-HUMAN-001');
  });
});

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
