import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const CLI_ENTRY = join(ROOT_DIR, 'dist', 'packages', 'cli', 'src', 'index.js');
const FIXTURE_DOT = join(ROOT_DIR, 'tests', 'fixtures', 'e2e', 'cli_smoke.dot');
const ENV_FILE = join(ROOT_DIR, 'tests', 'fixtures', 'e2e', '.env.smoke');
const DTU_SCENARIOS_DIR = join(ROOT_DIR, 'tests', 'fixtures', 'dtu', 'scenarios');

describe('CLI e2e smoke tests', () => {
  let logsRoot = '';

  beforeAll(async () => {
    const build = await runCommand(['npm', 'run', 'build'], ROOT_DIR);
    expect(build.code).toBe(0);
    logsRoot = await mkdtemp(join(tmpdir(), 'attractor-cli-e2e-'));
  });

  it('validate command succeeds for smoke fixture', async () => {
    const result = await runCommand(
      [process.execPath, CLI_ENTRY, 'validate', '--graph', FIXTURE_DOT, '--env-file', ENV_FILE],
      ROOT_DIR
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Graph is valid');
  });

  it('validate command fails when output contract is required without schema', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'attractor-cli-contract-lint-'));
    const graphPath = join(tempDir, 'contract_required.dot');
    await writeFile(
      graphPath,
      [
        'digraph ContractRequired {',
        '  start [shape="Mdiamond", label="Start"];',
        '  work [shape="box", type="codergen", llm_provider="openai", llm_model="gpt-test", output_contract_required="true", prompt="Generate"];',
        '  exit [shape="Msquare", label="Exit"];',
        '  start -> work;',
        '  work -> exit;',
        '}',
        '',
      ].join('\n')
    );

    const result = await runCommand(
      [process.execPath, CLI_ENTRY, 'validate', '--graph', graphPath],
      ROOT_DIR
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('OUTPUT_SCHEMA_REQUIRED');
  });

  it('run command succeeds and writes codergen artifacts', async () => {
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'run',
        '--graph',
        FIXTURE_DOT,
        '--logs-root',
        logsRoot,
        '--env-file',
        ENV_FILE,
        '--llm-backend',
        'cli',
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);

    const output = JSON.parse(
      await readFile(join(logsRoot, 'work', 'output.json'), 'utf-8')
    ) as Record<string, unknown>;
    const stdout = await readFile(join(logsRoot, 'work', 'stdout.log'), 'utf-8');
    const manifest = JSON.parse(
      await readFile(join(logsRoot, 'run_manifest.json'), 'utf-8')
    ) as Record<string, unknown>;

    expect(output.status).toBe('success');
    expect(output.output).toBe('smoke-output');
    expect(stdout).toBe('smoke-output');
    expect(manifest.schema_version).toBe('run_manifest.v1');
    expect((manifest.outcome as Record<string, unknown>).status).toBe('SUCCESS');
    expect(Array.isArray((manifest.model_provenance as unknown[]))).toBe(true);
  });

  it('resume command succeeds from latest checkpoint', async () => {
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'resume',
        '--graph',
        FIXTURE_DOT,
        '--logs-root',
        logsRoot,
        '--env-file',
        ENV_FILE,
        '--llm-backend',
        'cli',
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);
  });

  it('replay command succeeds from run manifest with fixed config', async () => {
    const replayLogsRoot = await mkdtemp(join(tmpdir(), 'attractor-cli-replay-e2e-'));
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'replay',
        '--manifest',
        join(logsRoot, 'run_manifest.json'),
        '--logs-root',
        replayLogsRoot,
        '--env-file',
        ENV_FILE,
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);

    const output = JSON.parse(
      await readFile(join(replayLogsRoot, 'work', 'output.json'), 'utf-8')
    ) as Record<string, unknown>;
    const manifest = JSON.parse(
      await readFile(join(replayLogsRoot, 'run_manifest.json'), 'utf-8')
    ) as Record<string, unknown>;

    expect(output.status).toBe('success');
    expect(output.output).toBe('smoke-output');
    expect((manifest.source as Record<string, unknown>).manifest_path).toContain('run_manifest.json');
    expect((manifest.outcome as Record<string, unknown>).status).toBe('SUCCESS');
  });

  it('replay command supports checkpoint resume with manifest-fixed config', async () => {
    const replayLogsRoot = await mkdtemp(join(tmpdir(), 'attractor-cli-replay-checkpoint-e2e-'));
    const sourceCheckpoint = join(logsRoot, 'checkpoint.json');
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'replay',
        '--manifest',
        join(logsRoot, 'run_manifest.json'),
        '--checkpoint',
        sourceCheckpoint,
        '--logs-root',
        replayLogsRoot,
        '--env-file',
        ENV_FILE,
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);

    const manifest = JSON.parse(
      await readFile(join(replayLogsRoot, 'run_manifest.json'), 'utf-8')
    ) as Record<string, unknown>;
    expect((manifest.command as string)).toBe('replay');
    expect((manifest.source as Record<string, unknown>).checkpoint_path).toBe(sourceCheckpoint);
    expect((manifest.outcome as Record<string, unknown>).status).toBe('SUCCESS');
  });

  it('dtu-run command emits satisfaction report for scenario fixtures', async () => {
    const reportPath = join(await mkdtemp(join(tmpdir(), 'attractor-dtu-report-')), 'report.json');
    const result = await runCommand(
      [
        process.execPath,
        CLI_ENTRY,
        'dtu-run',
        '--fixtures',
        DTU_SCENARIOS_DIR,
        '--report',
        reportPath,
      ],
      ROOT_DIR
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DTU scenarios:');

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>;
    const totals = report.totals as Record<string, unknown>;
    expect(report.schema_version).toBe('dtu_satisfaction_report.v1');
    expect(totals.unsatisfied).toBe(0);
    expect(report.holdout_rate).toBe(1);
  });
});

async function runCommand(command: string[], cwd: string): Promise<CommandResult> {
  return new Promise(resolve => {
    const [executable, ...args] = command;
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on('data', chunk => stdoutChunks.push(chunk.toString()));
    child.stderr.on('data', chunk => stderrChunks.push(chunk.toString()));

    child.on('close', code => {
      resolve({
        code: code ?? 1,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
      });
    });
  });
}
