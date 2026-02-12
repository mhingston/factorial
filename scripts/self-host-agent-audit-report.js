#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const DEFAULT_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-agent-audit-latest.json',
);
const DEFAULT_AUDIT_COMMAND = `${npmCommand} run agent:audit`;

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    auditCommand: DEFAULT_AUDIT_COMMAND,
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--audit-command' && argv[index + 1]) {
      args.auditCommand = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

function tail(text, maxChars = 500) {
  return String(text || '').slice(-maxChars);
}

async function runShellCommand(command, cwd) {
  return new Promise(resolvePromise => {
    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: true,
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

function parseChecks(stdout, stderr) {
  const output = `${stdout}\n${stderr}`;
  const lines = output.split('\n');
  const checks = [];
  const checkPattern = /^\[(PASS|FAIL|SKIP)\]\s+(.+):\s*(.*)$/;

  let counter = 0;
  for (const line of lines) {
    const match = line.match(checkPattern);
    if (!match) {
      continue;
    }

    const rawStatus = match[1];
    const name = match[2].trim();
    const detail = match[3].trim();
    const status = rawStatus === 'PASS' ? 'pass' : rawStatus === 'FAIL' ? 'fail' : 'skip';
    const required = !/^optional\b/i.test(name);

    counter += 1;
    checks.push({
      id: `AUD-${String(counter).padStart(3, '0')}`,
      level: 'autonomous',
      name,
      status,
      required,
      detail,
    });
  }

  return checks;
}

function parseSummaryFromOutput(stdout, stderr, checks, exitCode) {
  const output = `${stdout}\n${stderr}`;

  const requiredPassedMatch = output.match(/Required checks passed:\s*(\d+)/i);
  const requiredFailedMatch = output.match(/Required checks failed:\s*(\d+)/i);
  const optionalSkippedMatch = output.match(/Optional checks skipped:\s*(\d+)/i);
  const auditResultMatch = output.match(/Audit result:\s*(PASS|FAIL)/i);

  const requiredChecksPassed =
    requiredPassedMatch !== null
      ? Number.parseInt(requiredPassedMatch[1], 10)
      : checks.filter(check => check.required && check.status === 'pass').length;
  const requiredChecksFailed =
    requiredFailedMatch !== null
      ? Number.parseInt(requiredFailedMatch[1], 10)
      : checks.filter(check => check.required && check.status === 'fail').length;
  const optionalChecksSkipped =
    optionalSkippedMatch !== null
      ? Number.parseInt(optionalSkippedMatch[1], 10)
      : checks.filter(check => !check.required && check.status === 'skip').length;

  const auditResult = auditResultMatch ? auditResultMatch[1].toUpperCase() : exitCode === 0 ? 'PASS' : 'FAIL';
  const overallStatus = auditResult === 'PASS' && requiredChecksFailed === 0 ? 'pass' : 'fail';

  return {
    overall_status: overallStatus,
    audit_result: auditResult,
    required_checks_passed: requiredChecksPassed,
    required_checks_failed: requiredChecksFailed,
    optional_checks_skipped: optionalChecksSkipped,
    exit_code: exitCode,
    parsed_checks: checks.length,
  };
}

function buildReport(options) {
  return {
    schema_version: 'self_host_agent_audit_report.v1',
    generated_at: new Date().toISOString(),
    report_path: options.reportPathContract,
    publication: {
      command: 'npm run self-host:agent-audit',
      audit_command: options.auditCommand,
    },
    summary: options.summary,
    checks: options.checks,
    execution: {
      stdout_tail: tail(options.stdout),
      stderr_tail: tail(options.stderr),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const reportPath = resolve(args.report);
  await mkdir(dirname(reportPath), { recursive: true });

  const result = await runShellCommand(args.auditCommand, ROOT_DIR);
  const checks = parseChecks(result.stdout, result.stderr);
  const summary = parseSummaryFromOutput(result.stdout, result.stderr, checks, result.code);

  const report = buildReport({
    reportPathContract: toContractPath(reportPath),
    auditCommand: args.auditCommand,
    summary,
    checks,
    stdout: result.stdout,
    stderr: result.stderr,
  });

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Self-host agent-audit report written to ${reportPath}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(summary.overall_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Self-host agent-audit report generation failed:', error);
  process.exit(1);
});
