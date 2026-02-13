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

describe('Self-host provider-backed live report script', () => {
  it('publishes pass report in require-pass mode when both mock providers pass', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-provider-live-pass-'));
    const reportPath = join(tempRoot, 'provider-backed-live-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-provider-backed-live-report.js'),
        '--probe-mode',
        'mock',
        '--mock-openai',
        'pass',
        '--mock-anthropic',
        'pass',
        '--require-pass',
        '--report',
        reportPath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.schema_version).toBe('self_host_provider_backed_live_report.v1');
    expect(report.summary).toMatchObject({
      overall_status: 'pass',
      probe_overall_status: 'pass',
      policy_mode: 'required',
      providers: {
        openai: 'pass',
        anthropic: 'pass',
      },
    });
  });

  it('stays non-blocking in advisory mode when providers are skipped', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-provider-live-skip-'));
    const reportPath = join(tempRoot, 'provider-backed-live-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-provider-backed-live-report.js'),
        '--probe-mode',
        'mock',
        '--mock-openai',
        'skip',
        '--mock-anthropic',
        'skip',
        '--report',
        reportPath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(0);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.summary).toMatchObject({
      overall_status: 'pass',
      probe_overall_status: 'skip',
      policy_mode: 'advisory',
      providers: {
        openai: 'skip',
        anthropic: 'skip',
      },
      skipped_provider_count: 2,
    });
  });

  it('fails in require-pass mode when any required provider is not pass', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-self-host-provider-live-fail-'));
    const reportPath = join(tempRoot, 'provider-backed-live-report.json');

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'self-host-provider-backed-live-report.js'),
        '--probe-mode',
        'mock',
        '--mock-openai',
        'pass',
        '--mock-anthropic',
        'fail',
        '--require-pass',
        '--report',
        reportPath,
      ],
      ROOT_DIR,
    );

    expect(result.code).toBe(1);

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    expect(report.summary).toMatchObject({
      overall_status: 'fail',
      probe_overall_status: 'fail',
      policy_mode: 'required',
      providers: {
        openai: 'pass',
        anthropic: 'fail',
      },
      failed_provider_count: 1,
    });
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
