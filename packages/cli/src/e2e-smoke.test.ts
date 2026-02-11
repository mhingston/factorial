import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
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

    expect(output.status).toBe('success');
    expect(output.output).toBe('smoke-output');
    expect(stdout).toBe('smoke-output');
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
