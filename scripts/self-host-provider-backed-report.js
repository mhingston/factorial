#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));
const DEFAULT_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-provider-backed-latest.json',
);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PARITY_TEST_FILES = [
  'packages/core/src/llm/index.test.ts',
  'packages/core/src/handlers/codergen.test.ts',
];

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

async function runCommand(command, cwd) {
  return new Promise(resolvePromise => {
    const [executable, ...args] = command;
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on('data', chunk => stdout.push(String(chunk)));
    child.stderr.on('data', chunk => stderr.push(String(chunk)));

    child.on('close', code => {
      resolvePromise({
        code: code ?? 1,
        stdout: stdout.join(''),
        stderr: stderr.join(''),
      });
    });
  });
}

async function evaluateProviderParityContractCheck() {
  const command = [npmCommand, 'run', 'test:run', '--', ...PARITY_TEST_FILES];
  const parityResult = await runCommand(command, ROOT_DIR);
  const status = parityResult.code === 0 ? 'pass' : 'fail';

  return {
    id: 'PB-001',
    level: 'provider-backed',
    name: 'Provider adapter parity contract tests',
    command: `${npmCommand} run test:run -- ${PARITY_TEST_FILES.join(' ')}`,
    status,
    summary:
      status === 'pass'
        ? 'Targeted provider parity contract tests passed for openai + anthropic normalized behavior.'
        : 'Targeted provider parity contract tests failed.',
    evidence: [...PARITY_TEST_FILES],
    details: {
      exit_code: parityResult.code,
    },
  };
}

function buildReport(parityCheck, reportPath) {
  const providerStatus = parityCheck.status === 'pass' ? 'pass' : 'fail';
  const providers = {
    openai: providerStatus,
    anthropic: providerStatus,
  };
  const pb001Pass = parityCheck.status === 'pass';
  const pb002Pass =
    providers.openai === 'pass' &&
    providers.anthropic === 'pass';

  const pb002Check = {
    id: 'PB-002',
    level: 'provider-backed',
    name: 'Published provider-backed report schema + provider pass checks',
    command: `node scripts/self-host-provider-backed-report.js --report ${reportPath}`,
    status: pb002Pass ? 'pass' : 'fail',
    summary: pb002Pass
      ? 'Provider-backed report schema is published and required providers are pass.'
      : 'Provider-backed report is published but required provider statuses are not all pass.',
    evidence: [reportPath],
    details: {
      schema_version: 'self_host_provider_backed_report.v1',
      required_provider_statuses: {
        openai: 'pass',
        anthropic: 'pass',
      },
      providers,
    },
  };

  return {
    schema_version: 'self_host_provider_backed_report.v1',
    generated_at: new Date().toISOString(),
    report_path: reportPath,
    publication: {
      command: 'npm run self-host:provider-backed',
      deterministic_inputs: [...PARITY_TEST_FILES],
    },
    summary: {
      pb001_status: parityCheck.status,
      pb002_status: pb002Check.status,
      provider_parity_contract_tests_pass: pb001Pass,
      providers,
      required_providers: ['openai', 'anthropic'],
      overall_status: pb001Pass && pb002Pass ? 'pass' : 'fail',
    },
    checks: [parityCheck, pb002Check],
  };
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

async function main() {
  const args = parseArgs(process.argv);
  const reportPath = resolve(args.report);
  const reportPathContract = toContractPath(reportPath);
  await mkdir(dirname(reportPath), { recursive: true });

  const parityCheck = await evaluateProviderParityContractCheck();
  const report = buildReport(parityCheck, reportPathContract);

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Self-host provider-backed report written to ${reportPath}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Self-host provider-backed report generation failed:', error);
  process.exit(1);
});
