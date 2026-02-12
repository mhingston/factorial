#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));
const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'docs', 'metrics', 'reports', 'self-host-flake-latest.json');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const DEFAULT_REPLAY_COUNT = 3;
const DEFAULT_MIN_PASS_RATE = 1;

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    replayCount: String(DEFAULT_REPLAY_COUNT),
    minPassRate: String(DEFAULT_MIN_PASS_RATE),
    suiteConfig: '',
    includeSuites: [],
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if ((arg === '--report' || arg === '-o') && next) {
      args.report = next;
      index += 1;
      continue;
    }
    if (arg === '--replay-count' && next) {
      args.replayCount = next;
      index += 1;
      continue;
    }
    if (arg === '--min-pass-rate' && next) {
      args.minPassRate = next;
      index += 1;
      continue;
    }
    if (arg === '--suite-config' && next) {
      args.suiteConfig = next;
      index += 1;
      continue;
    }
    if (arg === '--include-suite' && next) {
      args.includeSuites.push(next);
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be an integer > 0`);
  }
  return parsed;
}

function parseUnitIntervalNumber(value, flagName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${flagName} must be in range [0,1]`);
  }
  return parsed;
}

function buildDefaultSuites() {
  return [
    {
      id: 'FLAKE-001',
      name: 'CLI e2e smoke suite',
      required: true,
      command: [npmCommand, 'run', 'test:run', '--', 'packages/cli/src/e2e-smoke.test.ts'],
      cwd: ROOT_DIR,
      env: {},
    },
    {
      id: 'FLAKE-002',
      name: 'Self-host dogfood suite',
      required: true,
      command: [npmCommand, 'run', 'test:run', '--', 'packages/cli/src/self-host-dogfood.test.ts'],
      cwd: ROOT_DIR,
      env: {},
    },
    {
      id: 'FLAKE-003',
      name: 'Self-host maturity suite',
      required: true,
      command: [npmCommand, 'run', 'test:run', '--', 'packages/cli/src/self-host-maturity.test.ts'],
      cwd: ROOT_DIR,
      env: {},
    },
  ];
}

async function resolveSuitesFromConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Suite config does not exist: ${configPath}`);
  }

  const configRaw = JSON.parse(await readFile(configPath, 'utf-8'));
  const suitesRaw = configRaw?.suites;

  if (!Array.isArray(suitesRaw) || suitesRaw.length === 0) {
    throw new Error('Suite config must include a non-empty "suites" array.');
  }

  const configDir = dirname(configPath);
  const seenIds = new Set();

  return suitesRaw.map((suiteRaw, suiteIndex) => {
    const id = asNonEmptyString(suiteRaw?.id);
    const name = asNonEmptyString(suiteRaw?.name);
    const command = asCommandArray(suiteRaw?.command, `suites[${suiteIndex}].command`);
    const required = suiteRaw?.required === undefined ? true : Boolean(suiteRaw.required);
    const cwd = asNonEmptyString(suiteRaw?.cwd)
      ? resolve(configDir, String(suiteRaw.cwd))
      : ROOT_DIR;
    const env = asEnvObject(suiteRaw?.env, `suites[${suiteIndex}].env`);

    if (!id) {
      throw new Error(`suites[${suiteIndex}].id must be a non-empty string`);
    }
    if (!name) {
      throw new Error(`suites[${suiteIndex}].name must be a non-empty string`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate suite id in suite config: ${id}`);
    }
    seenIds.add(id);

    return {
      id,
      name,
      required,
      command,
      cwd,
      env,
    };
  });
}

function filterSuites(suites, includeSuiteIds) {
  if (!includeSuiteIds.length) {
    return suites;
  }

  const includeSet = new Set(includeSuiteIds);
  const selected = suites.filter(suite => includeSet.has(suite.id));

  if (selected.length !== includeSet.size) {
    const selectedIds = new Set(selected.map(suite => suite.id));
    const missing = includeSuiteIds.filter(id => !selectedIds.has(id));
    throw new Error(`Unknown suite id(s) in --include-suite: ${missing.join(', ')}`);
  }

  return selected;
}

async function runCommand(command, cwd, envOverrides = {}) {
  return new Promise(resolvePromise => {
    const startedAt = Date.now();
    const [executable, ...args] = command;
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', chunk => stdoutChunks.push(String(chunk)));
    child.stderr.on('data', chunk => stderrChunks.push(String(chunk)));

    child.on('close', code => {
      resolvePromise({
        code: code ?? 1,
        durationMs: Date.now() - startedAt,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
      });
    });
  });
}

async function executeSuiteReplay(suite, replayCount) {
  const attempts = [];

  for (let attempt = 1; attempt <= replayCount; attempt += 1) {
    const result = await runCommand(suite.command, suite.cwd, suite.env);
    attempts.push({
      attempt,
      status: result.code === 0 ? 'pass' : 'fail',
      exit_code: result.code,
      duration_ms: result.durationMs,
      stdout_tail: tail(result.stdout),
      stderr_tail: tail(result.stderr),
    });
  }

  const passCount = attempts.filter(attempt => attempt.status === 'pass').length;
  const failCount = replayCount - passCount;
  const passRate = replayCount === 0 ? 0 : passCount / replayCount;

  return {
    id: suite.id,
    name: suite.name,
    required: suite.required,
    command: suite.command.join(' '),
    cwd: toContractPath(suite.cwd),
    attempts,
    metrics: {
      pass_count: passCount,
      fail_count: failCount,
      pass_rate: roundRate(passRate),
    },
  };
}

function summarizeSuites(suiteResults, minPassRate) {
  const evaluated = suiteResults.map(result => {
    const passRate = Number(result.metrics.pass_rate);
    const status = passRate >= minPassRate ? 'pass' : 'fail';
    return {
      ...result,
      status,
      threshold: {
        min_pass_rate: minPassRate,
        met: status === 'pass',
      },
    };
  });

  const requiredSuites = evaluated.filter(result => Boolean(result.required));
  const failedRequiredSuiteIds = requiredSuites
    .filter(result => result.status === 'fail')
    .map(result => result.id);

  return {
    suites: evaluated,
    summary: {
      required_suite_count: requiredSuites.length,
      required_suites_passing: requiredSuites.length - failedRequiredSuiteIds.length,
      failed_required_suite_ids: failedRequiredSuiteIds,
      overall_status: failedRequiredSuiteIds.length === 0 ? 'pass' : 'fail',
    },
  };
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  if (repoRelative === '') {
    return '.';
  }
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function asCommandArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string array.`);
  }

  const command = value.map(entry => asNonEmptyString(entry)).filter(Boolean);
  if (command.length !== value.length) {
    throw new Error(`${fieldName} must contain only non-empty strings.`);
  }

  return command;
}

function asEnvObject(value, fieldName) {
  if (value === undefined) {
    return {};
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object with string values.`);
  }

  const entries = Object.entries(value);
  const env = {};
  for (const [key, envValue] of entries) {
    if (!asNonEmptyString(key)) {
      throw new Error(`${fieldName} contains an invalid env key.`);
    }
    if (typeof envValue !== 'string') {
      throw new Error(`${fieldName}.${key} must be a string.`);
    }
    env[key] = envValue;
  }

  return env;
}

function roundRate(value) {
  return Number(value.toFixed(4));
}

function tail(value, maxChars = 200) {
  return String(value || '').slice(-maxChars);
}

async function main() {
  const args = parseArgs(process.argv);
  const replayCount = parsePositiveInteger(args.replayCount, '--replay-count');
  const minPassRate = parseUnitIntervalNumber(args.minPassRate, '--min-pass-rate');
  const reportPath = resolve(args.report);

  const suitesCatalog = args.suiteConfig
    ? await resolveSuitesFromConfig(resolve(args.suiteConfig))
    : buildDefaultSuites();
  const suites = filterSuites(suitesCatalog, args.includeSuites);

  if (suites.length === 0) {
    throw new Error('No suites selected for replay.');
  }

  const suiteResults = [];
  for (const suite of suites) {
    suiteResults.push(await executeSuiteReplay(suite, replayCount));
  }

  const evaluated = summarizeSuites(suiteResults, minPassRate);
  const report = {
    schema_version: 'self_host_flake_report.v1',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    thresholds: {
      replay_count: replayCount,
      min_pass_rate: minPassRate,
    },
    publication: {
      command: `npm run self-host:flake -- --report ${toContractPath(reportPath)} --replay-count ${replayCount} --min-pass-rate ${minPassRate}`,
      suite_ids: suites.map(suite => suite.id),
    },
    suites: evaluated.suites,
    summary: {
      ...evaluated.summary,
      replay_count: replayCount,
      min_pass_rate: minPassRate,
    },
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Self-host flake replay report written to ${reportPath}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Self-host flake replay failed:', error);
  process.exit(1);
});
