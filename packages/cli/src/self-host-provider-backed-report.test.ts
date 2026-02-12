import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

interface CommandResult { code: number; stdout: string; stderr: string }

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe('Self-host provider-backed report script', () => {
  it('publishes schema-compliant provider-backed evidence with provider pass statuses', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-provider-backed-'));
    const reportPath = join(logsRoot, 'provider-backed-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-provider-backed-report.js'),
        '--report',
        reportPath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;

    expect(report.schema_version).toBe('self_host_provider_backed_report.v1');
    expect(report.summary).toMatchObject({
      pb001_status: 'pass',
      pb002_status: 'pass',
      provider_parity_contract_tests_pass: true,
      providers: {
        openai: 'pass',
        anthropic: 'pass',
      },
      overall_status: 'pass',
    });

    const checks = (report.checks as Array<Record<string, unknown>>) ?? [];
    const checksById = Object.fromEntries(checks.map(check => [String(check.id), check]));

    expect(String((checksById['PB-001'] || {}).status)).toBe('pass');
    expect(String((checksById['PB-002'] || {}).status)).toBe('pass');
  }, 60_000);
});

async function run(
  cmd: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<CommandResult> {
  return new Promise(resolve => {
    const [exe, ...args] = cmd;
    const child = spawn(exe, args, {
      cwd,
      env: { ...process.env, ...env },
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
