#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-autonomous-latest.json',
);
const DEFAULT_FLAKE_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-flake-latest.json',
);
const DEFAULT_RELIABILITY_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'compound-reliability-slo-latest.json',
);
const DEFAULT_PROVIDER_BACKED_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'self-host-provider-backed-latest.json',
);
const DEFAULT_MATURITY_LADDER_PATH = join(ROOT_DIR, 'docs', 'self-hosting-maturity-ladder.md');
const DEFAULT_COMPANION_SCOPE_PATH = join(ROOT_DIR, 'docs', 'companion-spec-scope-contract.md');

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    flakeReport: DEFAULT_FLAKE_REPORT_PATH,
    reliabilityReport: DEFAULT_RELIABILITY_REPORT_PATH,
    providerBackedReport: DEFAULT_PROVIDER_BACKED_REPORT_PATH,
    maturityLadder: DEFAULT_MATURITY_LADDER_PATH,
    companionScope: DEFAULT_COMPANION_SCOPE_PATH,
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--flake-report' && argv[index + 1]) {
      args.flakeReport = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--reliability-report' && argv[index + 1]) {
      args.reliabilityReport = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--provider-backed-report' && argv[index + 1]) {
      args.providerBackedReport = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--maturity-ladder' && argv[index + 1]) {
      args.maturityLadder = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--companion-scope' && argv[index + 1]) {
      args.companionScope = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

async function readJsonIfPresent(path) {
  if (!existsSync(path)) {
    return {
      exists: false,
      parsed: null,
      parse_error: '',
    };
  }

  try {
    return {
      exists: true,
      parsed: JSON.parse(await readFile(path, 'utf-8')),
      parse_error: '',
    };
  } catch (error) {
    return {
      exists: true,
      parsed: null,
      parse_error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readTextIfPresent(path) {
  if (!existsSync(path)) {
    return {
      exists: false,
      text: '',
      read_error: '',
    };
  }

  try {
    return {
      exists: true,
      text: await readFile(path, 'utf-8'),
      read_error: '',
    };
  } catch (error) {
    return {
      exists: true,
      text: '',
      read_error: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkResult({ id, name, command, status, summary, evidence, details }) {
  return {
    id,
    level: 'autonomous',
    name,
    command,
    status,
    summary,
    evidence,
    details,
  };
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

async function evaluateChecks(options) {
  const checks = [];

  const flake = await readJsonIfPresent(options.flakeReportPath);
  const flakeSchemaOk = flake.parsed?.schema_version === 'self_host_flake_report.v1';
  const flakePass = flake.parsed?.summary?.overall_status === 'pass';
  checks.push(
    checkResult({
      id: 'AU-STAB-001',
      name: 'Deterministic flake replay stability evidence',
      command: 'npm run self-host:flake',
      status: flake.exists && !flake.parse_error && flakeSchemaOk && flakePass ? 'pass' : 'fail',
      summary:
        flake.exists && !flake.parse_error && flakeSchemaOk && flakePass
          ? 'Flake replay report exists with required schema and pass status.'
          : 'Flake replay report is missing/invalid or does not satisfy pass criteria.',
      evidence: [toContractPath(options.flakeReportPath)],
      details: {
        exists: flake.exists,
        parse_error: flake.parse_error,
        schema_ok: flakeSchemaOk,
        summary_overall_status: flake.parsed?.summary?.overall_status ?? '',
      },
    }),
  );

  const reliability = await readJsonIfPresent(options.reliabilityReportPath);
  const reliabilitySchemaOk = reliability.parsed?.schema_version === 'compound_reliability_slo_report.v1';
  const reliabilityPass = reliability.parsed?.summary?.overall_status === 'pass';
  const reliabilityResolved = reliability.parsed?.summary?.consensus_lock_decision === 'resolved';
  checks.push(
    checkResult({
      id: 'AU-STAB-002',
      name: 'Reliability SLO lock-decision stability evidence',
      command: 'npm run reliability:slo',
      status:
        reliability.exists && !reliability.parse_error && reliabilitySchemaOk && reliabilityPass && reliabilityResolved
          ? 'pass'
          : 'fail',
      summary:
        reliability.exists && !reliability.parse_error && reliabilitySchemaOk && reliabilityPass && reliabilityResolved
          ? 'Reliability SLO report exists with required schema, pass status, and resolved lock decision.'
          : 'Reliability SLO report is missing/invalid or does not satisfy resolved pass criteria.',
      evidence: [toContractPath(options.reliabilityReportPath)],
      details: {
        exists: reliability.exists,
        parse_error: reliability.parse_error,
        schema_ok: reliabilitySchemaOk,
        summary_overall_status: reliability.parsed?.summary?.overall_status ?? '',
        consensus_lock_decision: reliability.parsed?.summary?.consensus_lock_decision ?? '',
      },
    }),
  );

  const providerBacked = await readJsonIfPresent(options.providerBackedReportPath);
  const providerBackedSchemaOk =
    providerBacked.parsed?.schema_version === 'self_host_provider_backed_report.v1';
  const providerBackedPass = providerBacked.parsed?.summary?.overall_status === 'pass';
  checks.push(
    checkResult({
      id: 'AU-STAB-003',
      name: 'Provider-backed baseline evidence continuity',
      command: 'npm run self-host:provider-backed',
      status:
        providerBacked.exists && !providerBacked.parse_error && providerBackedSchemaOk && providerBackedPass
          ? 'pass'
          : 'fail',
      summary:
        providerBacked.exists && !providerBacked.parse_error && providerBackedSchemaOk && providerBackedPass
          ? 'Provider-backed report exists with required schema and pass status.'
          : 'Provider-backed report is missing/invalid or does not satisfy pass criteria.',
      evidence: [toContractPath(options.providerBackedReportPath)],
      details: {
        exists: providerBacked.exists,
        parse_error: providerBacked.parse_error,
        schema_ok: providerBackedSchemaOk,
        summary_overall_status: providerBacked.parsed?.summary?.overall_status ?? '',
      },
    }),
  );

  const companionScope = await readTextIfPresent(options.companionScopePath);
  const outOfScopePolicyPresent = /Unbounded unattended autonomous operation across external systems\s*\|\s*`out-of-scope`/i.test(
    companionScope.text,
  );
  checks.push(
    checkResult({
      id: 'AU-GUARD-001',
      name: 'Companion scope autonomy boundary policy',
      command: `read ${toContractPath(options.companionScopePath)}`,
      status:
        companionScope.exists && !companionScope.read_error && outOfScopePolicyPresent ? 'pass' : 'fail',
      summary:
        companionScope.exists && !companionScope.read_error && outOfScopePolicyPresent
          ? 'Companion scope contract explicitly keeps unattended external autonomy out-of-scope.'
          : 'Companion scope contract is missing required unattended-autonomy boundary declaration.',
      evidence: [toContractPath(options.companionScopePath)],
      details: {
        exists: companionScope.exists,
        read_error: companionScope.read_error,
        out_of_scope_policy_present: outOfScopePolicyPresent,
      },
    }),
  );

  const maturityLadder = await readTextIfPresent(options.maturityLadderPath);
  const declaredCurrentLevelProviderBacked = /Declared current level:\s*`provider-backed`/i.test(
    maturityLadder.text,
  );
  const declaredNextLevelAutonomous = /Declared next level:\s*`autonomous`/i.test(maturityLadder.text);
  checks.push(
    checkResult({
      id: 'AU-GUARD-002',
      name: 'Declared maturity remains staged and non-autonomous',
      command: `read ${toContractPath(options.maturityLadderPath)}`,
      status:
        maturityLadder.exists &&
        !maturityLadder.read_error &&
        declaredCurrentLevelProviderBacked &&
        declaredNextLevelAutonomous
          ? 'pass'
          : 'fail',
      summary:
        maturityLadder.exists &&
        !maturityLadder.read_error &&
        declaredCurrentLevelProviderBacked &&
        declaredNextLevelAutonomous
          ? 'Maturity declaration remains provider-backed with autonomous as next gated level.'
          : 'Maturity declaration no longer reflects staged provider-backed -> autonomous promotion guardrail.',
      evidence: [toContractPath(options.maturityLadderPath)],
      details: {
        exists: maturityLadder.exists,
        read_error: maturityLadder.read_error,
        declared_current_level_provider_backed: declaredCurrentLevelProviderBacked,
        declared_next_level_autonomous: declaredNextLevelAutonomous,
      },
    }),
  );

  const explicitHumanFreeBoundaryPresent = /does not claim unattended external-system autonomy/i.test(
    companionScope.text,
  );
  checks.push(
    checkResult({
      id: 'AU-HUMAN-001',
      name: 'Human-free guardrail policy assertion',
      command: `read ${toContractPath(options.companionScopePath)}`,
      status:
        companionScope.exists && !companionScope.read_error && explicitHumanFreeBoundaryPresent
          ? 'pass'
          : 'fail',
      summary:
        companionScope.exists && !companionScope.read_error && explicitHumanFreeBoundaryPresent
          ? 'Companion scope policy explicitly forbids unattended external-system autonomy claims.'
          : 'Companion scope policy is missing explicit human-free autonomy boundary wording.',
      evidence: [toContractPath(options.companionScopePath)],
      details: {
        exists: companionScope.exists,
        read_error: companionScope.read_error,
        explicit_human_free_boundary_present: explicitHumanFreeBoundaryPresent,
      },
    }),
  );

  return checks;
}

function buildReport(checks, reportPathContract, options) {
  const failedCheckIds = checks.filter(check => check.status !== 'pass').map(check => check.id);

  const stabilityCheckIds = ['AU-STAB-001', 'AU-STAB-002', 'AU-STAB-003'];
  const guardrailCheckIds = ['AU-GUARD-001', 'AU-GUARD-002'];
  const humanFreeCheckIds = ['AU-HUMAN-001'];

  const stabilityPass = stabilityCheckIds.every(
    checkId => checks.find(check => check.id === checkId)?.status === 'pass',
  );
  const guardrailsPass = guardrailCheckIds.every(
    checkId => checks.find(check => check.id === checkId)?.status === 'pass',
  );
  const humanFreePass = humanFreeCheckIds.every(
    checkId => checks.find(check => check.id === checkId)?.status === 'pass',
  );

  const overallPass = stabilityPass && guardrailsPass && humanFreePass;

  return {
    schema_version: 'self_host_autonomous_report.v1',
    generated_at: new Date().toISOString(),
    report_path: reportPathContract,
    publication: {
      command: 'npm run self-host:autonomous',
      deterministic_inputs: [
        toContractPath(options.flakeReportPath),
        toContractPath(options.reliabilityReportPath),
        toContractPath(options.providerBackedReportPath),
        toContractPath(options.maturityLadderPath),
        toContractPath(options.companionScopePath),
      ],
    },
    summary: {
      au001_status: overallPass ? 'pass' : 'fail',
      stability_pass: stabilityPass,
      guardrails_pass: guardrailsPass,
      human_free_pass: humanFreePass,
      overall_status: overallPass ? 'pass' : 'fail',
      failed_check_ids: failedCheckIds,
    },
    checks,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const reportPath = resolve(args.report);
  const flakeReportPath = resolve(args.flakeReport);
  const reliabilityReportPath = resolve(args.reliabilityReport);
  const providerBackedReportPath = resolve(args.providerBackedReport);
  const maturityLadderPath = resolve(args.maturityLadder);
  const companionScopePath = resolve(args.companionScope);

  await mkdir(dirname(reportPath), { recursive: true });

  const checks = await evaluateChecks({
    flakeReportPath,
    reliabilityReportPath,
    providerBackedReportPath,
    maturityLadderPath,
    companionScopePath,
  });

  const report = buildReport(checks, toContractPath(reportPath), {
    flakeReportPath,
    reliabilityReportPath,
    providerBackedReportPath,
    maturityLadderPath,
    companionScopePath,
  });

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Self-host autonomous report written to ${reportPath}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Self-host autonomous report generation failed:', error);
  process.exit(1);
});
