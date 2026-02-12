#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));
const CLI_ENTRY = join(ROOT_DIR, 'dist', 'packages', 'cli', 'src', 'index.js');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const LEVELS = ['deterministic-local', 'provider-backed', 'autonomous'];
const DECLARED_CURRENT_LEVEL = 'provider-backed';
const DECLARED_NEXT_LEVEL = 'autonomous';

const PROVIDER_BACKED_REPORT = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-provider-backed-latest.json',
);
const AUTONOMOUS_REPORT = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-autonomous-latest.json',
);
const AGENT_AUDIT_REPORT = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-agent-audit-latest.json',
);

function parseArgs(argv) {
  const args = {
    logsRoot: '',
    report: '',
    markdown: '',
    providerBackedReport: '',
    autonomousReport: '',
    agentAuditReport: '',
    requireLevel: DECLARED_CURRENT_LEVEL,
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--logs-root' || arg === '-l') && argv[index + 1]) {
      args.logsRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--markdown' && argv[index + 1]) {
      args.markdown = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--require-level' && argv[index + 1]) {
      args.requireLevel = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--provider-backed-report' && argv[index + 1]) {
      args.providerBackedReport = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--autonomous-report' && argv[index + 1]) {
      args.autonomousReport = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--agent-audit-report' && argv[index + 1]) {
      args.agentAuditReport = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

function isValidLevel(level) {
  return LEVELS.includes(level);
}

async function ensureBuild() {
  if (process.env.SELF_HOST_MATURITY_SKIP_BUILD === '1' && existsSync(CLI_ENTRY)) {
    return;
  }
  const result = await runCommand([npmCommand, 'run', 'build'], ROOT_DIR);
  if (result.code !== 0) {
    throw new Error(`Build failed: ${result.stderr || result.stdout}`);
  }
}

async function runCommand(command, cwd, envOverrides = {}) {
  return new Promise(resolvePromise => {
    const [executable, ...args] = command;
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, ...envOverrides },
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

function tail(text, maxChars = 400) {
  return String(text || '').slice(-maxChars);
}

function gateResultBase({ id, level, name, command }) {
  return {
    id,
    level,
    name,
    command,
    status: 'pending',
    summary: '',
    evidence: [],
    details: {},
  };
}

async function evaluateDeterministicDogfoodGate(baseLogsRoot) {
  const gate = gateResultBase({
    id: 'DL-001',
    level: 'deterministic-local',
    name: 'Deterministic self-host lock enforcement',
    command: `node scripts/self-host-dogfood.js --logs-root ${join(baseLogsRoot, 'dogfood')}`,
  });

  const dogfoodLogsRoot = join(baseLogsRoot, 'dogfood');
  const commandResult = await runCommand(
    [process.execPath, join(ROOT_DIR, 'scripts', 'self-host-dogfood.js'), '--logs-root', dogfoodLogsRoot],
    ROOT_DIR,
    { DOGFOOD_SKIP_BUILD: '1' },
  );

  const reportPath = join(dogfoodLogsRoot, 'report.json');
  const reportExists = existsSync(reportPath);

  let resolvedPass = false;
  let reopenFail = false;

  if (reportExists) {
    const parsed = JSON.parse(await readFile(reportPath, 'utf-8'));
    resolvedPass = Boolean(parsed?.summary?.resolved_pass);
    reopenFail = Boolean(parsed?.summary?.reopen_fail);
    gate.evidence.push(reportPath);
  }

  const ok = commandResult.code === 0 && reportExists && resolvedPass && reopenFail;
  gate.status = ok ? 'pass' : 'fail';
  gate.summary = ok
    ? 'Self-host dogfood report confirms resolved=pass and reopen=fail lock paths.'
    : 'Self-host dogfood gate failed; expected deterministic resolved/reopen outcomes.';
  gate.details = {
    exit_code: commandResult.code,
    report_exists: reportExists,
    resolved_pass: resolvedPass,
    reopen_fail: reopenFail,
    stdout_tail: tail(commandResult.stdout),
    stderr_tail: tail(commandResult.stderr),
  };

  return gate;
}

async function evaluatePromotionGovernanceGate(baseLogsRoot) {
  const gate = gateResultBase({
    id: 'DL-002',
    level: 'deterministic-local',
    name: 'Promotion/profile governance gate',
    command: 'factorial validate (valid regulated fixture + invalid weak profile fixture)',
  });

  const validFixture = join(ROOT_DIR, 'tests', 'golden', 'workflows', 'promotion-regulated.dot');

  const validResult = await runCommand(
    [process.execPath, CLI_ENTRY, 'validate', '--graph', validFixture, '--strict'],
    ROOT_DIR,
  );

  const tempRoot = await mkdtemp(join(tmpdir(), 'self-host-maturity-'));
  const invalidFixture = join(tempRoot, 'invalid-promotion-profile.dot');
  await writeFile(
    invalidFixture,
    [
      'digraph InvalidPromotionProfile {',
      '  graph [goal="Expected failure for weak profile", promotion_stage="prod", quality_profile="baseline"]',
      '  start [shape=Mdiamond, label="Start"]',
      '  exit [shape=Msquare, label="Exit"]',
      '  check [shape=box, type="tool", label="Check", tool_command="node -e \'process.exit(0)\'"]',
      '  start -> check -> exit',
      '}',
      '',
    ].join('\n'),
  );

  const invalidResult = await runCommand(
    [process.execPath, CLI_ENTRY, 'validate', '--graph', invalidFixture, '--strict'],
    ROOT_DIR,
  );

  const validPasses = validResult.code === 0;
  const invalidFails = invalidResult.code !== 0;
  const invalidContainsExpectedCode = /QUALITY_PROFILE_TOO_WEAK_FOR_STAGE/.test(
    `${invalidResult.stdout}\n${invalidResult.stderr}`,
  );

  const ok = validPasses && invalidFails && invalidContainsExpectedCode;

  gate.status = ok ? 'pass' : 'fail';
  gate.summary = ok
    ? 'Promotion/profile lint policy accepted regulated workflow and rejected weak prod profile.'
    : 'Promotion/profile gate did not meet expected pass/fail behavior.';
  gate.evidence.push(validFixture);
  gate.details = {
    valid_exit_code: validResult.code,
    invalid_exit_code: invalidResult.code,
    invalid_contains_quality_profile_error: invalidContainsExpectedCode,
    valid_stdout_tail: tail(validResult.stdout),
    valid_stderr_tail: tail(validResult.stderr),
    invalid_stdout_tail: tail(invalidResult.stdout),
    invalid_stderr_tail: tail(invalidResult.stderr),
  };

  return gate;
}

async function evaluateCompoundLockPolicyGate() {
  const gate = gateResultBase({
    id: 'DL-003',
    level: 'deterministic-local',
    name: 'Compound lock decision compliance gate',
    command: 'node scripts/check-pr-compound-artifacts.js --body-file <fixture>',
  });

  const compliantFixture = join(ROOT_DIR, 'tests', 'fixtures', 'pr-body', 'compound-compliant.md');
  const missingLockFixture = join(ROOT_DIR, 'tests', 'fixtures', 'pr-body', 'compound-missing-lock.md');

  const compliant = await runCommand(
    [process.execPath, join(ROOT_DIR, 'scripts', 'check-pr-compound-artifacts.js'), '--body-file', compliantFixture],
    ROOT_DIR,
  );
  const missingLock = await runCommand(
    [process.execPath, join(ROOT_DIR, 'scripts', 'check-pr-compound-artifacts.js'), '--body-file', missingLockFixture],
    ROOT_DIR,
  );

  const compliantPasses = compliant.code === 0;
  const missingLockFails = missingLock.code !== 0;
  const missingLockContainsExpectedMessage = /resolved or reopen/i.test(
    `${missingLock.stdout}\n${missingLock.stderr}`,
  );

  const ok = compliantPasses && missingLockFails && missingLockContainsExpectedMessage;

  gate.status = ok ? 'pass' : 'fail';
  gate.summary = ok
    ? 'Compound compliance checker enforces explicit lock decision with deterministic fixture coverage.'
    : 'Compound lock policy gate failed expected compliant-pass / missing-lock-fail checks.';
  gate.evidence.push(compliantFixture, missingLockFixture);
  gate.details = {
    compliant_exit_code: compliant.code,
    missing_lock_exit_code: missingLock.code,
    missing_lock_contains_expected_message: missingLockContainsExpectedMessage,
    compliant_stdout_tail: tail(compliant.stdout),
    compliant_stderr_tail: tail(compliant.stderr),
    missing_lock_stdout_tail: tail(missingLock.stdout),
    missing_lock_stderr_tail: tail(missingLock.stderr),
  };

  return gate;
}

async function readProviderBackedReport(reportPath) {
  if (!existsSync(reportPath)) {
    return {
      exists: false,
      report: null,
      parse_error: '',
    };
  }

  try {
    return {
      exists: true,
      report: JSON.parse(await readFile(reportPath, 'utf-8')),
      parse_error: '',
    };
  } catch (error) {
    return {
      exists: true,
      report: null,
      parse_error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readJsonReport(reportPath) {
  if (!existsSync(reportPath)) {
    return {
      exists: false,
      report: null,
      parse_error: '',
    };
  }

  try {
    return {
      exists: true,
      report: JSON.parse(await readFile(reportPath, 'utf-8')),
      parse_error: '',
    };
  } catch (error) {
    return {
      exists: true,
      report: null,
      parse_error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function evaluateProviderParityGate(providerBackedReportPath) {
  const gate = gateResultBase({
    id: 'PB-001',
    level: 'provider-backed',
    name: 'Provider adapter parity contract tests',
    command: `report file ${providerBackedReportPath}`,
  });

  const reportResult = await readProviderBackedReport(providerBackedReportPath);

  if (!reportResult.exists) {
    gate.status = 'pending';
    gate.summary = 'Provider-backed evidence report is not published yet.';
    gate.details = {
      required_report_path: providerBackedReportPath,
      expected_schema_version: 'self_host_provider_backed_report.v1',
      required_pb001_status: 'pass',
    };
    return gate;
  }

  if (reportResult.parse_error) {
    gate.status = 'fail';
    gate.summary = 'Provider-backed report exists but is not valid JSON.';
    gate.evidence.push(providerBackedReportPath);
    gate.details = {
      parse_error: reportResult.parse_error,
    };
    return gate;
  }

  const parsed = reportResult.report;
  const schemaOk = parsed?.schema_version === 'self_host_provider_backed_report.v1';
  const pb001StatusPass = parsed?.summary?.pb001_status === 'pass';
  const parityPass = Boolean(parsed?.summary?.provider_parity_contract_tests_pass);
  const ok = schemaOk && pb001StatusPass && parityPass;

  gate.status = ok ? 'pass' : 'fail';
  gate.summary = ok
    ? 'Published provider-backed report confirms parity contract test pass status.'
    : 'Published provider-backed report does not satisfy PB-001 parity evidence criteria.';
  gate.evidence.push(providerBackedReportPath);
  gate.details = {
    schema_ok: schemaOk,
    pb001_status_pass: pb001StatusPass,
    provider_parity_contract_tests_pass: parityPass,
  };

  return gate;
}

async function evaluateProviderBackedEvidenceGate(providerBackedReportPath) {
  const gate = gateResultBase({
    id: 'PB-002',
    level: 'provider-backed',
    name: 'Provider-backed self-host evidence artifact',
    command: `report file ${providerBackedReportPath}`,
  });

  const reportResult = await readProviderBackedReport(providerBackedReportPath);

  if (!reportResult.exists) {
    gate.status = 'pending';
    gate.summary = 'Provider-backed evidence report is not published yet.';
    gate.details = {
      required_report_path: providerBackedReportPath,
      expected_schema_version: 'self_host_provider_backed_report.v1',
      required_success_keys: ['openai', 'anthropic'],
    };
    return gate;
  }

  if (reportResult.parse_error) {
    gate.status = 'fail';
    gate.summary = 'Provider-backed report exists but is not valid JSON.';
    gate.evidence.push(providerBackedReportPath);
    gate.details = {
      parse_error: reportResult.parse_error,
    };
    return gate;
  }

  const parsed = reportResult.report;
  const schemaOk = parsed?.schema_version === 'self_host_provider_backed_report.v1';
  const pb002StatusPass = parsed?.summary?.pb002_status === 'pass';
  const openaiOk = parsed?.summary?.providers?.openai === 'pass';
  const anthropicOk = parsed?.summary?.providers?.anthropic === 'pass';
  const ok = schemaOk && pb002StatusPass && openaiOk && anthropicOk;

  gate.status = ok ? 'pass' : 'fail';
  gate.summary = ok
    ? 'Provider-backed report proves pass status for openai and anthropic paths.'
    : 'Provider-backed report exists but does not satisfy required schema/provider pass criteria.';
  gate.evidence.push(providerBackedReportPath);
  gate.details = {
    schema_ok: schemaOk,
    pb002_status_pass: pb002StatusPass,
    openai_ok: openaiOk,
    anthropic_ok: anthropicOk,
  };

  return gate;
}

async function evaluateAutonomousEvidenceGate(autonomousReportPath) {
  const gate = gateResultBase({
    id: 'AU-001',
    level: 'autonomous',
    name: 'Autonomous self-host stability evidence artifact',
    command: `report file ${autonomousReportPath}`,
  });

  const reportResult = await readJsonReport(autonomousReportPath);

  if (!reportResult.exists) {
    gate.status = 'pending';
    gate.summary = 'Autonomous evidence report is not published yet.';
    gate.details = {
      required_report_path: autonomousReportPath,
      expected_schema_version: 'self_host_autonomous_report.v1',
      required_keys: [
        'summary.au001_status',
        'summary.stability_pass',
        'summary.guardrails_pass',
        'summary.human_free_pass',
        'summary.overall_status',
      ],
    };
    return gate;
  }

  if (reportResult.parse_error) {
    gate.status = 'fail';
    gate.summary = 'Autonomous evidence report exists but is not valid JSON.';
    gate.evidence.push(autonomousReportPath);
    gate.details = {
      parse_error: reportResult.parse_error,
    };
    return gate;
  }

  const parsed = reportResult.report;
  const schemaOk = parsed?.schema_version === 'self_host_autonomous_report.v1';
  const au001StatusPass = parsed?.summary?.au001_status === 'pass';
  const stabilityPass = Boolean(parsed?.summary?.stability_pass);
  const guardrailsPass = Boolean(parsed?.summary?.guardrails_pass);
  const humanFreePass = Boolean(parsed?.summary?.human_free_pass);
  const overallStatusPass = parsed?.summary?.overall_status === 'pass';
  const failedCheckIds = Array.isArray(parsed?.summary?.failed_check_ids)
    ? parsed.summary.failed_check_ids
    : [];
  const checksPresent = Array.isArray(parsed?.checks) && parsed.checks.length > 0;
  const ok =
    schemaOk &&
    au001StatusPass &&
    stabilityPass &&
    guardrailsPass &&
    humanFreePass &&
    overallStatusPass &&
    failedCheckIds.length === 0 &&
    checksPresent;

  gate.status = ok ? 'pass' : 'fail';
  gate.summary = ok
    ? 'Autonomous report satisfies strict schema and readiness keys for AU-001.'
    : 'Autonomous report exists but does not satisfy strict AU-001 schema/readiness criteria.';
  gate.evidence.push(autonomousReportPath);
  gate.details = {
    schema_ok: schemaOk,
    au001_status_pass: au001StatusPass,
    stability_pass: stabilityPass,
    guardrails_pass: guardrailsPass,
    human_free_pass: humanFreePass,
    overall_status_pass: overallStatusPass,
    failed_check_count: failedCheckIds.length,
    checks_present: checksPresent,
  };

  return gate;
}

async function evaluateAutonomousAgentAuditGate(agentAuditReportPath) {
  const gate = gateResultBase({
    id: 'AU-002',
    level: 'autonomous',
    name: 'Published agent-audit evidence artifact',
    command: `report file ${agentAuditReportPath}`,
  });

  const reportResult = await readJsonReport(agentAuditReportPath);

  if (!reportResult.exists) {
    gate.status = 'pending';
    gate.summary = 'Agent-audit evidence report is not published yet.';
    gate.details = {
      required_report_path: agentAuditReportPath,
      required_schema_version: 'self_host_agent_audit_report.v1',
    };
    return gate;
  }

  if (reportResult.parse_error) {
    gate.status = 'fail';
    gate.summary = 'Agent-audit report exists but is not valid JSON.';
    gate.evidence.push(agentAuditReportPath);
    gate.details = {
      parse_error: reportResult.parse_error,
    };
    return gate;
  }

  const parsed = reportResult.report;
  const schemaOk = parsed?.schema_version === 'self_host_agent_audit_report.v1';
  const overallStatusPass = parsed?.summary?.overall_status === 'pass';
  const requiredChecksFailed = Number(parsed?.summary?.required_checks_failed);
  const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
  const requiredChecksPresent = checks.some(check => Boolean(check?.required));
  const ok =
    schemaOk &&
    overallStatusPass &&
    Number.isFinite(requiredChecksFailed) &&
    requiredChecksFailed === 0 &&
    requiredChecksPresent;

  gate.status = ok ? 'pass' : 'fail';
  gate.summary = ok
    ? 'Agent-audit report satisfies strict schema and required-check pass criteria.'
    : 'Agent-audit report exists but does not satisfy strict AU-002 schema/readiness criteria.';
  gate.evidence.push(agentAuditReportPath);
  gate.details = {
    schema_ok: schemaOk,
    overall_status_pass: overallStatusPass,
    required_checks_failed: Number.isFinite(requiredChecksFailed) ? requiredChecksFailed : null,
    required_checks_present: requiredChecksPresent,
  };

  return gate;
}

function deriveLevelAssessments(gates) {
  const gatesByLevel = {
    'deterministic-local': gates.filter(g => g.level === 'deterministic-local'),
    'provider-backed': gates.filter(g => g.level === 'provider-backed'),
    autonomous: gates.filter(g => g.level === 'autonomous'),
  };

  const assessments = [];

  const deterministicReady = gatesByLevel['deterministic-local'].every(g => g.status === 'pass');
  assessments.push({
    level: 'deterministic-local',
    eligible: deterministicReady,
    unmet_gate_ids: gatesByLevel['deterministic-local'].filter(g => g.status !== 'pass').map(g => g.id),
    gate_ids: gatesByLevel['deterministic-local'].map(g => g.id),
  });

  const providerReady = deterministicReady && gatesByLevel['provider-backed'].every(g => g.status === 'pass');
  assessments.push({
    level: 'provider-backed',
    eligible: providerReady,
    unmet_gate_ids: gatesByLevel['provider-backed'].filter(g => g.status !== 'pass').map(g => g.id),
    gate_ids: gatesByLevel['provider-backed'].map(g => g.id),
  });

  const autonomousReady = providerReady && gatesByLevel.autonomous.every(g => g.status === 'pass');
  assessments.push({
    level: 'autonomous',
    eligible: autonomousReady,
    unmet_gate_ids: gatesByLevel.autonomous.filter(g => g.status !== 'pass').map(g => g.id),
    gate_ids: gatesByLevel.autonomous.map(g => g.id),
  });

  return assessments;
}

function inferCurrentLevel(levelAssessments) {
  if (levelAssessments.find(level => level.level === 'autonomous')?.eligible) {
    return 'autonomous';
  }
  if (levelAssessments.find(level => level.level === 'provider-backed')?.eligible) {
    return 'provider-backed';
  }
  if (levelAssessments.find(level => level.level === 'deterministic-local')?.eligible) {
    return 'deterministic-local';
  }
  return 'none';
}

function buildNextLevelRequirements(gates, targetLevel) {
  return gates
    .filter(gate => gate.level === targetLevel)
    .map(gate => ({
      gate_id: gate.id,
      name: gate.name,
      status: gate.status,
      summary: gate.summary,
      evidence: gate.evidence,
    }));
}

function renderMarkdown(report) {
  const lines = [
    '# Self-host Maturity Report',
    '',
    `Generated at: ${report.generated_at}`,
    `Declared current level: ${report.declared_current_level}`,
    `Assessed current level: ${report.assessed_current_level}`,
    `Next target level: ${report.next_level}`,
    `Required level: ${report.required_level} (${report.required_level_met ? 'met' : 'not met'})`,
    '',
    '## Level Assessments',
    '| level | eligible | gate_ids | unmet_gate_ids |',
    '| --- | --- | --- | --- |',
  ];

  for (const level of report.levels) {
    lines.push(
      `| ${level.level} | ${level.eligible ? 'yes' : 'no'} | ${level.gate_ids.join(', ') || 'none'} | ${level.unmet_gate_ids.join(', ') || 'none'} |`,
    );
  }

  lines.push('', '## Gate Results', '| gate_id | level | status | summary | evidence |', '| --- | --- | --- | --- | --- |');
  for (const gate of report.gates) {
    const evidence = gate.evidence.length > 0 ? gate.evidence.join(', ') : 'none';
    lines.push(`| ${gate.id} | ${gate.level} | ${gate.status} | ${gate.summary} | ${evidence} |`);
  }

  lines.push('', '## Requirements for Next Level', '| gate_id | status | summary |', '| --- | --- | --- |');
  for (const requirement of report.next_level_requirements) {
    lines.push(`| ${requirement.gate_id} | ${requirement.status} | ${requirement.summary} |`);
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);

  if (!isValidLevel(args.requireLevel)) {
    console.error(`Invalid --require-level "${args.requireLevel}". Expected one of: ${LEVELS.join(', ')}`);
    process.exit(1);
  }

  const logsRoot = resolve(args.logsRoot || join(ROOT_DIR, 'logs', 'self_host_maturity'));
  const reportPath = resolve(args.report || join(logsRoot, 'report.json'));
  const markdownPath = resolve(args.markdown || join(logsRoot, 'report.md'));
  const providerBackedReportPath = resolve(args.providerBackedReport || PROVIDER_BACKED_REPORT);
  const autonomousReportPath = resolve(args.autonomousReport || AUTONOMOUS_REPORT);
  const agentAuditReportPath = resolve(args.agentAuditReport || AGENT_AUDIT_REPORT);

  await ensureBuild();
  await mkdir(logsRoot, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  await mkdir(dirname(markdownPath), { recursive: true });

  const gateResults = [];
  gateResults.push(await evaluateDeterministicDogfoodGate(logsRoot));
  gateResults.push(await evaluatePromotionGovernanceGate(logsRoot));
  gateResults.push(await evaluateCompoundLockPolicyGate());
  gateResults.push(await evaluateProviderParityGate(providerBackedReportPath));
  gateResults.push(await evaluateProviderBackedEvidenceGate(providerBackedReportPath));
  gateResults.push(await evaluateAutonomousEvidenceGate(autonomousReportPath));
  gateResults.push(await evaluateAutonomousAgentAuditGate(agentAuditReportPath));

  const levelAssessments = deriveLevelAssessments(gateResults);
  const assessedCurrentLevel = inferCurrentLevel(levelAssessments);
  const requiredAssessment = levelAssessments.find(level => level.level === args.requireLevel);
  const requiredLevelMet = Boolean(requiredAssessment?.eligible);

  const report = {
    schema_version: 'self_host_maturity_report.v1',
    generated_at: new Date().toISOString(),
    logs_root: logsRoot,
    report_path: reportPath,
    markdown_path: markdownPath,
    declared_current_level: DECLARED_CURRENT_LEVEL,
    assessed_current_level: assessedCurrentLevel,
    next_level: DECLARED_NEXT_LEVEL,
    required_level: args.requireLevel,
    required_level_met: requiredLevelMet,
    levels: levelAssessments,
    gates: gateResults,
    next_level_requirements: buildNextLevelRequirements(gateResults, DECLARED_NEXT_LEVEL),
  };

  const markdown = renderMarkdown(report);

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, markdown);

  console.log(`Self-host maturity report written to ${reportPath}`);
  console.log(`Self-host maturity markdown written to ${markdownPath}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(requiredLevelMet ? 0 : 1);
}

main().catch(error => {
  console.error('Self-host maturity script failed:', error);
  process.exit(1);
});
