#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));
const CLI_ENTRY = join(ROOT_DIR, 'dist', 'packages', 'cli', 'src', 'index.js');

function parseArgs(argv) {
  const args = { logsRoot: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--logs-root' || arg === '-l') && argv[i + 1]) {
      args.logsRoot = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function ensureBuild() {
  if (process.env.DOGFOOD_SKIP_BUILD === '1' && existsSync(CLI_ENTRY)) {
    return;
  }
  const result = await runCommand(['npm', 'run', 'build'], ROOT_DIR);
  if (result.code !== 0) {
    throw new Error(`Build failed: ${result.stderr || result.stdout}`);
  }
}

async function runCommand(command, cwd) {
  return new Promise(resolve => {
    const [executable, ...args] = command;
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', c => stdout.push(c.toString()));
    child.stderr.on('data', c => stderr.push(c.toString()));
    child.on('close', code => {
      resolve({ code: code ?? 1, stdout: stdout.join(''), stderr: stderr.join('') });
    });
  });
}

function buildDogfoodDot(lockDecision) {
  const lockCommand = [
    "node -e '",
    'const fs = require("node:fs");',
    'const payload = {',
    '  status: "SUCCESS",',
    '  context_updates: {',
    '    "stack.child.status": "completed",',
    '    "stack.child.outcome": "success",',
    `    "stack.child.lock_decision": "${lockDecision}"`,
    '  }',
    '};',
    'fs.writeFileSync("{stage_dir}/status.json", JSON.stringify(payload));',
    "'",
  ].join('');

  const planCommand = "node -e 'process.exit(0)'";
  const workCommand = "node -e 'process.exit(0)'";
  const reviewCommand = "node -e 'process.exit(0)'";
  const compoundCommand = "node -e 'process.exit(0)'";

  return [
    'digraph SelfHostDogfood {',
    '  graph [',
    '    goal="Self-host dogfood Plan -> Work -> Review -> Compound",',
    '    rankdir=LR',
    '  ]',
    '',
    '  start   [shape=Mdiamond, label="Start"]',
    '  exit    [shape=Msquare,  label="Exit"]',
    '',
    `  plan    [shape=box, type="tool", label="Plan", tool_command="${dotEscape(planCommand)}"]`,
    `  work    [shape=box, type="quality.gate", label="Work", gate_type="custom", gate_command="${dotEscape(workCommand)}"]`,
    `  review  [shape=box, type="quality.gate", label="Review", gate_type="custom", gate_command="${dotEscape(reviewCommand)}"]`,
    `  compound[shape=box, type="tool", label="Compound", tool_command="${dotEscape(compoundCommand)}"]`,
    `  lock    [shape=parallelogram, type="codergen", label="Set Lock (${lockDecision})", llm_backend="cli", cli_command="${dotEscape(lockCommand)}"]`,
    '  manager [shape=house, type="stack.manager_loop", label="Manager",',
    '           stack_child_dotfile="./tests/fixtures/reference/simple_example.dot",',
    '           manager_actions="observe", manager_poll_interval="0", manager_max_cycles="1", manager_require_lock="true"]',
    '',
    '  start -> plan -> work -> review -> compound -> lock -> manager',
    '  manager -> exit [condition="context.stack.manager_loop.last_child_lock=resolved"]',
    '}',
    ''
  ].join('\n');
}

function dotEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function runDogfoodScenario({ name, lock, baseLogsRoot }) {
  const scenarioLogs = join(baseLogsRoot, name);
  const dotPath = join(scenarioLogs, 'workflow.dot');
  await mkdir(scenarioLogs, { recursive: true });
  const dotSource = buildDogfoodDot(lock);
  await writeFile(dotPath, `${dotSource}\n`);

  const args = [
    process.execPath,
    CLI_ENTRY,
    'run',
    '--graph', dotPath,
    '--logs-root', scenarioLogs,
    '--llm-backend', 'cli',
    '--default-provider', 'openai',
    '--llm-provider', 'openai',
    '--llm-model', 'gpt-test',
  ];
  const result = await runCommand(args, ROOT_DIR);

  const manifestPath = join(scenarioLogs, 'run_manifest.json');
  const manifest = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, 'utf-8'))
    : null;
  const managerArtifact = join(scenarioLogs, 'manager', 'manager_loop.json');
  const manager = existsSync(managerArtifact)
    ? JSON.parse(await readFile(managerArtifact, 'utf-8'))
    : null;

  return {
    name,
    lock,
    exit_code: result.code,
    manifest_path: existsSync(manifestPath) ? manifestPath : '',
    manifest_outcome: manifest?.outcome?.status || '',
    manager_artifact_path: existsSync(managerArtifact) ? managerArtifact : '',
    manager_final_status: manager?.final_status || '',
    manager_final_lock: manager?.final_child_lock || '',
    stdout_tail: (result.stdout || '').slice(-200),
    stderr_tail: (result.stderr || '').slice(-200),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const baseLogsRoot = resolve(args.logsRoot || join(ROOT_DIR, 'logs', 'self_host_dogfood'));
  await ensureBuild();
  await mkdir(baseLogsRoot, { recursive: true });

  const resolved = await runDogfoodScenario({ name: 'resolved', lock: 'resolved', baseLogsRoot });
  const reopen = await runDogfoodScenario({ name: 'reopen', lock: 'reopen', baseLogsRoot });

  const report = {
    schema_version: 'self_host_dogfood_report.v1',
    generated_at: new Date().toISOString(),
    logs_root: baseLogsRoot,
    scenarios: [
      { ...resolved, expected: 'pass' },
      { ...reopen, expected: 'fail' },
    ],
    summary: {
      resolved_pass: resolved.exit_code === 0,
      reopen_fail: reopen.exit_code !== 0,
    },
  };

  const reportPath = join(baseLogsRoot, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Dogfood scenarios executed. Report: ${reportPath}`);

  const ok = report.summary.resolved_pass && report.summary.reopen_fail;
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error('Dogfood script failed:', err);
  process.exit(1);
});
