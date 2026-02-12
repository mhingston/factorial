import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SuiteIsolation {
  suiteRoot: string;
  logsRoot: string;
  tempRoot: string;
  createLogsRoot: (label: string) => Promise<string>;
  createTempDir: (label: string) => Promise<string>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT_DIR = resolve(join(__dirname, '..', '..', '..'));
export const CLI_ENTRY = join(ROOT_DIR, 'dist', 'packages', 'cli', 'src', 'index.js');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const BUILD_SENTINEL = join(ROOT_DIR, 'dist', '.cli-build-ready-for-tests.json');
const BUILD_LOCK_DIR = join(ROOT_DIR, 'dist', '.cli-build-ready-for-tests.lock');
const BUILD_TIMEOUT_MS = 180_000;
const BUILD_LOCK_STALE_MS = 300_000;
const BUILD_POLL_MS = 200;

let buildPromise: Promise<void> | null = null;

export async function runCommand(
  command: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
): Promise<CommandResult> {
  return new Promise(resolvePromise => {
    const [executable, ...args] = command;
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on('data', chunk => stdoutChunks.push(String(chunk)));
    child.stderr.on('data', chunk => stderrChunks.push(String(chunk)));

    child.on('close', code => {
      resolvePromise({
        code: code ?? 1,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
      });
    });
  });
}

export async function ensureDeterministicCliBuild(): Promise<void> {
  if (!buildPromise) {
    buildPromise = ensureDeterministicCliBuildInternal();
  }

  await buildPromise;
}

export async function createSuiteIsolation(suiteName: string): Promise<SuiteIsolation> {
  const safeSuiteName = sanitizePathSegment(suiteName);
  const suiteRoot = await mkdtemp(join(tmpdir(), `attractor-${safeSuiteName}-`));
  const logsRoot = join(suiteRoot, 'logs');
  const tempRoot = join(suiteRoot, 'temp');
  await Promise.all([
    mkdir(logsRoot, { recursive: true }),
    mkdir(tempRoot, { recursive: true }),
  ]);

  let logsCounter = 0;

  return {
    suiteRoot,
    logsRoot,
    tempRoot,
    createLogsRoot: async (label: string): Promise<string> => {
      logsCounter += 1;
      const dir = join(
        logsRoot,
        `${String(logsCounter).padStart(2, '0')}-${sanitizePathSegment(label)}`,
      );
      await mkdir(dir, { recursive: true });
      return dir;
    },
    createTempDir: async (label: string): Promise<string> =>
      mkdtemp(join(tempRoot, `${sanitizePathSegment(label)}-`)),
  };
}

async function ensureDeterministicCliBuildInternal(): Promise<void> {
  await mkdir(join(ROOT_DIR, 'dist'), { recursive: true });
  await materializeSentinelForPreexistingBuild();

  if (await hasReadyBuild()) {
    return;
  }

  const lockAcquired = await acquireBuildLock();
  if (!lockAcquired) {
    return;
  }

  try {
    if (await hasReadyBuild()) {
      return;
    }

    const build = await runCommand([npmCommand, 'run', 'build'], ROOT_DIR);
    if (build.code !== 0) {
      throw new Error(`Build failed while preparing CLI suites: ${tail(build.stderr || build.stdout)}`);
    }

    await writeBuildSentinel('fresh-build');
  } finally {
    await rm(BUILD_LOCK_DIR, { recursive: true, force: true });
  }
}

async function acquireBuildLock(): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= BUILD_TIMEOUT_MS) {
    try {
      await mkdir(BUILD_LOCK_DIR);
      return true;
    } catch (error) {
      if (!isEexistError(error)) {
        throw error;
      }

      await materializeSentinelForPreexistingBuild();

      if (await hasReadyBuild()) {
        return false;
      }

      if (await isBuildLockStale()) {
        await rm(BUILD_LOCK_DIR, { recursive: true, force: true });
        continue;
      }

      await sleep(BUILD_POLL_MS);
    }
  }

  throw new Error(
    `Timed out waiting for CLI test build lock after ${BUILD_TIMEOUT_MS}ms: ${BUILD_LOCK_DIR}`,
  );
}

async function isBuildLockStale(): Promise<boolean> {
  try {
    const lockStats = await stat(BUILD_LOCK_DIR);
    return Date.now() - lockStats.mtimeMs > BUILD_LOCK_STALE_MS;
  } catch {
    return false;
  }
}

async function materializeSentinelForPreexistingBuild(): Promise<void> {
  if (!(await pathExists(CLI_ENTRY))) {
    return;
  }

  if (await pathExists(BUILD_SENTINEL)) {
    return;
  }

  if (await pathExists(BUILD_LOCK_DIR)) {
    return;
  }

  await writeBuildSentinel('preexisting-build');
}

async function hasReadyBuild(): Promise<boolean> {
  const [entryExists, sentinelExists] = await Promise.all([
    pathExists(CLI_ENTRY),
    pathExists(BUILD_SENTINEL),
  ]);
  return entryExists && sentinelExists;
}

async function writeBuildSentinel(source: 'fresh-build' | 'preexisting-build'): Promise<void> {
  await writeFile(
    BUILD_SENTINEL,
    `${JSON.stringify(
      {
        schema_version: 'cli_test_build_ready.v1',
        source,
        generated_at: new Date().toISOString(),
        cli_entry: CLI_ENTRY,
      },
      null,
      2,
    )}\n`,
    'utf-8',
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizePathSegment(value: string): string {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  return normalized || 'suite';
}

function isEexistError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function tail(value: string, maxChars = 300): string {
  return String(value || '').slice(-maxChars);
}
