#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_ROADMAP_PATH = join(ROOT_DIR, 'ROADMAP.md');
const DEFAULT_MATRIX_PATH = join(ROOT_DIR, 'docs', 'spec-conformance-matrix.md');
const DEFAULT_COMPANION_PATH = join(ROOT_DIR, 'docs', 'companion-spec-scope-contract.md');
const DEFAULT_MATURITY_PATH = join(ROOT_DIR, 'docs', 'self-hosting-maturity-ladder.md');
const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'logs', 'claims_consistency', 'report.json');

function parseArgs(argv) {
  const args = {
    roadmap: DEFAULT_ROADMAP_PATH,
    matrix: DEFAULT_MATRIX_PATH,
    companion: DEFAULT_COMPANION_PATH,
    maturity: DEFAULT_MATURITY_PATH,
    report: DEFAULT_REPORT_PATH,
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--roadmap' || arg === '-r') && argv[index + 1]) {
      args.roadmap = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--matrix' || arg === '-m') && argv[index + 1]) {
      args.matrix = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--companion' && argv[index + 1]) {
      args.companion = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--maturity' && argv[index + 1]) {
      args.maturity = argv[index + 1];
      index += 1;
      continue;
    }
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

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

async function readText(path) {
  try {
    return {
      exists: true,
      text: await readFile(path, 'utf-8'),
      read_error: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\bENOENT\b/.test(message)) {
      return {
        exists: false,
        text: '',
        read_error: '',
      };
    }
    return {
      exists: false,
      text: '',
      read_error: message,
    };
  }
}

function readMatch(text, pattern) {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? '';
}

function parseRoadmapClaims(text) {
  return {
    declared_current_level: readMatch(text, /Declared current level:\s*`([^`]+)`/i),
    declared_next_level: readMatch(text, /Declared next level:\s*`([^`]+)`/i),
    cal_delta_02_status: readMatch(text, /CAL-DELTA-02 status:\s*`([^`]+)`/i),
    ullm_delta_02_status: readMatch(text, /ULLM-DELTA-02 status:\s*`([^`]+)`/i),
    companion_unattended_scope: readMatch(text, /Companion unattended autonomy scope:\s*`([^`]+)`/i),
  };
}

function parseMaturityClaims(text) {
  return {
    declared_current_level: readMatch(text, /Declared current level:\s*`([^`]+)`/i),
    declared_next_level: readMatch(text, /Declared next level:\s*`([^`]+)`/i),
  };
}

function parseCompanionClaims(text) {
  return {
    declared_current_level: readMatch(text, /currently claims `([^`]+)` readiness only/i),
    unattended_scope_status: readMatch(
      text,
      /^\|\s*Unbounded unattended autonomous operation across external systems\s*\|\s*`([^`]+)`\s*\|/im,
    ),
    explicit_boundary_present: /does not claim unattended external-system autonomy/i.test(text),
  };
}

function parseMatrixClaims(text) {
  return {
    cal_delta_02_status: readMatch(text, /^\|\s*`CAL-DELTA-02`\s*\|(?:[^|\n]*\|){2}\s*`([^`]+)`\s*\|/im),
    ullm_delta_02_status: readMatch(text, /^\|\s*`ULLM-DELTA-02`\s*\|(?:[^|\n]*\|){2}\s*`([^`]+)`\s*\|/im),
    cal_delta_02_current_level: readMatch(
      text,
      /`CAL-DELTA-02`[^\n]*explicit current-level claim\s*\(`([^`]+)`\)/i,
    ),
    cal_delta_02_mentions_unattended_out_of_scope: /`CAL-DELTA-02`[^\n]*unattended external autonomy out-of-scope/i.test(
      text,
    ),
  };
}

function checkResult({ id, name, status, summary, evidence, details }) {
  return {
    id,
    level: 'claims-consistency',
    name,
    status,
    summary,
    evidence,
    details,
  };
}

function evaluateChecks({ paths, sources, parsed }) {
  const checks = [];

  const allReadable =
    sources.roadmap.exists &&
    sources.matrix.exists &&
    sources.companion.exists &&
    sources.maturity.exists &&
    !sources.roadmap.read_error &&
    !sources.matrix.read_error &&
    !sources.companion.read_error &&
    !sources.maturity.read_error;
  checks.push(
    checkResult({
      id: 'CLM-001',
      name: 'Required claim source documents are readable',
      status: allReadable ? 'pass' : 'fail',
      summary: allReadable
        ? 'All required claim source documents are present and readable.'
        : 'One or more required claim source documents are missing/unreadable.',
      evidence: [
        toContractPath(paths.roadmap),
        toContractPath(paths.matrix),
        toContractPath(paths.companion),
        toContractPath(paths.maturity),
      ],
      details: {
        roadmap_exists: sources.roadmap.exists,
        roadmap_read_error: sources.roadmap.read_error,
        matrix_exists: sources.matrix.exists,
        matrix_read_error: sources.matrix.read_error,
        companion_exists: sources.companion.exists,
        companion_read_error: sources.companion.read_error,
        maturity_exists: sources.maturity.exists,
        maturity_read_error: sources.maturity.read_error,
      },
    }),
  );

  const currentLevelValues = [
    parsed.roadmap.declared_current_level,
    parsed.maturity.declared_current_level,
    parsed.companion.declared_current_level,
    parsed.matrix.cal_delta_02_current_level,
  ].filter(Boolean);
  const currentLevelConsistent =
    currentLevelValues.length === 4 && new Set(currentLevelValues.map(value => value.toLowerCase())).size === 1;
  checks.push(
    checkResult({
      id: 'CLM-002',
      name: 'Declared current maturity level consistency',
      status: currentLevelConsistent ? 'pass' : 'fail',
      summary: currentLevelConsistent
        ? 'Current maturity level claim is synchronized across roadmap, maturity, companion, and CAL-DELTA-02.'
        : 'Current maturity level claim is contradictory across roadmap/maturity/companion/spec declarations.',
      evidence: [
        toContractPath(paths.roadmap),
        toContractPath(paths.maturity),
        toContractPath(paths.companion),
        toContractPath(paths.matrix),
      ],
      details: {
        roadmap_declared_current_level: parsed.roadmap.declared_current_level,
        maturity_declared_current_level: parsed.maturity.declared_current_level,
        companion_declared_current_level: parsed.companion.declared_current_level,
        matrix_cal_delta_02_current_level: parsed.matrix.cal_delta_02_current_level,
      },
    }),
  );

  const nextLevelConsistent =
    parsed.roadmap.declared_next_level &&
    parsed.maturity.declared_next_level &&
    parsed.roadmap.declared_next_level.toLowerCase() === parsed.maturity.declared_next_level.toLowerCase();
  checks.push(
    checkResult({
      id: 'CLM-003',
      name: 'Declared next-level target consistency',
      status: nextLevelConsistent ? 'pass' : 'fail',
      summary: nextLevelConsistent
        ? 'Next-level target declaration matches between roadmap and maturity ladder.'
        : 'Next-level target declaration differs between roadmap and maturity ladder.',
      evidence: [toContractPath(paths.roadmap), toContractPath(paths.maturity)],
      details: {
        roadmap_declared_next_level: parsed.roadmap.declared_next_level,
        maturity_declared_next_level: parsed.maturity.declared_next_level,
      },
    }),
  );

  const calDeltaConsistent =
    parsed.roadmap.cal_delta_02_status &&
    parsed.matrix.cal_delta_02_status &&
    parsed.roadmap.cal_delta_02_status.toLowerCase() === parsed.matrix.cal_delta_02_status.toLowerCase();
  const ullmDeltaConsistent =
    parsed.roadmap.ullm_delta_02_status &&
    parsed.matrix.ullm_delta_02_status &&
    parsed.roadmap.ullm_delta_02_status.toLowerCase() === parsed.matrix.ullm_delta_02_status.toLowerCase();
  checks.push(
    checkResult({
      id: 'CLM-004',
      name: 'Conformance delta status consistency (CAL-DELTA-02 / ULLM-DELTA-02)',
      status: calDeltaConsistent && ullmDeltaConsistent ? 'pass' : 'fail',
      summary:
        calDeltaConsistent && ullmDeltaConsistent
          ? 'Roadmap and spec matrix agree on claim-critical delta statuses.'
          : 'Roadmap and spec matrix differ on one or more claim-critical delta statuses.',
      evidence: [toContractPath(paths.roadmap), toContractPath(paths.matrix)],
      details: {
        roadmap_cal_delta_02_status: parsed.roadmap.cal_delta_02_status,
        matrix_cal_delta_02_status: parsed.matrix.cal_delta_02_status,
        roadmap_ullm_delta_02_status: parsed.roadmap.ullm_delta_02_status,
        matrix_ullm_delta_02_status: parsed.matrix.ullm_delta_02_status,
      },
    }),
  );

  const unattendedScopeConsistent =
    parsed.roadmap.companion_unattended_scope &&
    parsed.companion.unattended_scope_status &&
    parsed.roadmap.companion_unattended_scope.toLowerCase() ===
      parsed.companion.unattended_scope_status.toLowerCase() &&
    parsed.companion.unattended_scope_status.toLowerCase() === 'out-of-scope' &&
    parsed.companion.explicit_boundary_present &&
    parsed.matrix.cal_delta_02_mentions_unattended_out_of_scope;
  checks.push(
    checkResult({
      id: 'CLM-005',
      name: 'Companion unattended-autonomy boundary consistency',
      status: unattendedScopeConsistent ? 'pass' : 'fail',
      summary: unattendedScopeConsistent
        ? 'Unattended autonomy boundary remains explicitly out-of-scope and synchronized across claim docs.'
        : 'Unattended autonomy boundary declaration is missing or contradictory across claim docs.',
      evidence: [
        toContractPath(paths.roadmap),
        toContractPath(paths.companion),
        toContractPath(paths.matrix),
      ],
      details: {
        roadmap_companion_unattended_scope: parsed.roadmap.companion_unattended_scope,
        companion_unattended_scope_status: parsed.companion.unattended_scope_status,
        companion_explicit_boundary_present: parsed.companion.explicit_boundary_present,
        matrix_mentions_unattended_out_of_scope: parsed.matrix.cal_delta_02_mentions_unattended_out_of_scope,
      },
    }),
  );

  return checks;
}

function buildReport({ checks, reportPath, paths, parsed }) {
  const failedCheckIds = checks.filter(check => check.status !== 'pass').map(check => check.id);

  return {
    schema_version: 'claims_consistency_report.v1',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    publication: {
      command: 'npm run claims:audit',
      deterministic_inputs: [
        toContractPath(paths.roadmap),
        toContractPath(paths.matrix),
        toContractPath(paths.companion),
        toContractPath(paths.maturity),
      ],
    },
    summary: {
      overall_status: failedCheckIds.length === 0 ? 'pass' : 'fail',
      failed_check_ids: failedCheckIds,
      declared_current_level: parsed.maturity.declared_current_level || parsed.roadmap.declared_current_level || '',
      declared_next_level: parsed.maturity.declared_next_level || parsed.roadmap.declared_next_level || '',
      cal_delta_02_status: parsed.matrix.cal_delta_02_status || parsed.roadmap.cal_delta_02_status || '',
      ullm_delta_02_status: parsed.matrix.ullm_delta_02_status || parsed.roadmap.ullm_delta_02_status || '',
      companion_unattended_scope:
        parsed.companion.unattended_scope_status || parsed.roadmap.companion_unattended_scope || '',
    },
    checks,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const reportPath = resolve(args.report);
  const paths = {
    roadmap: resolve(args.roadmap),
    matrix: resolve(args.matrix),
    companion: resolve(args.companion),
    maturity: resolve(args.maturity),
  };

  const [roadmap, matrix, companion, maturity] = await Promise.all([
    readText(paths.roadmap),
    readText(paths.matrix),
    readText(paths.companion),
    readText(paths.maturity),
  ]);

  const parsed = {
    roadmap: parseRoadmapClaims(roadmap.text),
    matrix: parseMatrixClaims(matrix.text),
    companion: parseCompanionClaims(companion.text),
    maturity: parseMaturityClaims(maturity.text),
  };

  const checks = evaluateChecks({
    paths,
    sources: { roadmap, matrix, companion, maturity },
    parsed,
  });

  const report = buildReport({
    checks,
    reportPath,
    paths,
    parsed,
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Claims consistency report written to ${reportPath}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Claims consistency audit failed:', error);
  process.exit(1);
});
