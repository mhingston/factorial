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
const DEFAULT_HANDOFF_PATH = join(ROOT_DIR, 'docs', 'roadmap', 'active-handoff.md');
const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'logs', 'claims_consistency', 'report.json');

function parseArgs(argv) {
  const args = {
    roadmap: DEFAULT_ROADMAP_PATH,
    matrix: DEFAULT_MATRIX_PATH,
    companion: DEFAULT_COMPANION_PATH,
    maturity: DEFAULT_MATURITY_PATH,
    handoff: DEFAULT_HANDOFF_PATH,
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
    if (arg === '--handoff' && argv[index + 1]) {
      args.handoff = argv[index + 1];
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

function readSectionByHeading(text, level, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRegex = new RegExp(`^${'#'.repeat(level)}\\s+${escaped}\\s*$`, 'm');
  const headingMatch = headingRegex.exec(text);
  if (!headingMatch) {
    return '';
  }

  const start = headingMatch.index + headingMatch[0].length;
  const remainder = text.slice(start);
  const nextHeadingRegex = new RegExp(`^#{1,${level}}\\s+`, 'm');
  const nextHeadingMatch = nextHeadingRegex.exec(remainder);
  const end = nextHeadingMatch ? start + nextHeadingMatch.index : text.length;
  return text.slice(start, end);
}

function collectSortedUniqueOpIds(text) {
  const ids = text.match(/OP-\d+/g) ?? [];
  return [...new Set(ids)].sort();
}

function collectNextOperationalIds(text) {
  const section = readSectionByHeading(text, 3, 'Next');
  const ids = new Set();
  const regex = /^\|\s*`(OP-\d+)`\s*\|/gm;
  let match = regex.exec(section);
  while (match) {
    ids.add(match[1]);
    match = regex.exec(section);
  }
  return [...ids].sort();
}

function collectExecutionOrderOperationalIds(text) {
  const section = readSectionByHeading(text, 2, 'Agent Session Handoff (Execution-Ready)');
  const ids = new Set();
  const regex = /^\d+\.\s*`(OP-\d+)`/gm;
  let match = regex.exec(section);
  while (match) {
    ids.add(match[1]);
    match = regex.exec(section);
  }
  return [...ids].sort();
}

function collectOutstandingOperationalIds(text) {
  const sectionMatch = text.match(/Outstanding operational follow-up[^\n]*:\n([\s\S]*?)(?:\n\s*\n|^##\s)/m);
  const section = sectionMatch?.[1] ?? '';
  return collectSortedUniqueOpIds(section);
}

function parseRoadmapClaims(text) {
  return {
    declared_current_level: readMatch(text, /Declared current level:\s*`([^`]+)`/i),
    declared_next_level: readMatch(text, /Declared next level:\s*`([^`]+)`/i),
    cal_delta_02_status: readMatch(text, /CAL-DELTA-02 status:\s*`([^`]+)`/i),
    ullm_delta_02_status: readMatch(text, /ULLM-DELTA-02 status:\s*`([^`]+)`/i),
    companion_unattended_scope: readMatch(text, /Companion unattended autonomy scope:\s*`([^`]+)`/i),
    next_operational_ids: collectNextOperationalIds(text),
    execution_order_operational_ids: collectExecutionOrderOperationalIds(text),
    outstanding_operational_ids: collectOutstandingOperationalIds(text),
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

function parseHandoffClaims(text) {
  return {
    operational_queue_ids: collectSortedUniqueOpIds(text),
  };
}

function arraysEqualSorted(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function checkResult({ id, name, status, summary, evidence, details, diagnostics = [] }) {
  return {
    id,
    level: 'claims-consistency',
    name,
    status,
    summary,
    evidence,
    details,
    diagnostics,
  };
}

function buildDriftDiagnostic({ field, expected, observed, locations }) {
  return {
    field,
    expected: expected ?? '(empty)',
    observed: observed ?? '(empty)',
    locations: locations || [],
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

  const roadmapDeclaresOperationalQueue =
    parsed.roadmap.next_operational_ids.length > 0 ||
    parsed.roadmap.execution_order_operational_ids.length > 0 ||
    parsed.roadmap.outstanding_operational_ids.length > 0;
  const handoffReadable = sources.handoff.exists && !sources.handoff.read_error;
  const nextMatchesHandoff = arraysEqualSorted(parsed.roadmap.next_operational_ids, parsed.handoff.operational_queue_ids);
  const executionOrderMatchesNext =
    parsed.roadmap.execution_order_operational_ids.length === 0 ||
    arraysEqualSorted(parsed.roadmap.execution_order_operational_ids, parsed.roadmap.next_operational_ids);
  const outstandingMatchesNext =
    parsed.roadmap.outstanding_operational_ids.length === 0 ||
    arraysEqualSorted(parsed.roadmap.outstanding_operational_ids, parsed.roadmap.next_operational_ids);
  const operationalQueueConsistent =
    !roadmapDeclaresOperationalQueue ||
    (handoffReadable &&
      nextMatchesHandoff &&
      executionOrderMatchesNext &&
      outstandingMatchesNext &&
      parsed.roadmap.next_operational_ids.length > 0);
  const operationalDiagnostics = [];
  if (roadmapDeclaresOperationalQueue) {
    if (!handoffReadable) {
      operationalDiagnostics.push(buildDriftDiagnostic({
        field: 'active_handoff_exists',
        expected: 'true (handoff must exist when operational IDs are declared)',
        observed: sources.handoff.exists ? `read_error: ${sources.handoff.read_error}` : 'file not found',
        locations: [toContractPath(paths.handoff)],
      }));
    }
    if (!nextMatchesHandoff) {
      operationalDiagnostics.push(buildDriftDiagnostic({
        field: 'operational_queue_ids (roadmap.next vs handoff)',
        expected: `roadmap.next=[${parsed.roadmap.next_operational_ids.join(', ')}]`,
        observed: `handoff=[${parsed.handoff.operational_queue_ids.join(', ')}]`,
        locations: [toContractPath(paths.roadmap), toContractPath(paths.handoff)],
      }));
    }
    if (!executionOrderMatchesNext) {
      operationalDiagnostics.push(buildDriftDiagnostic({
        field: 'execution_order_operational_ids',
        expected: `roadmap.next=[${parsed.roadmap.next_operational_ids.join(', ')}]`,
        observed: `roadmap.execution_order=[${parsed.roadmap.execution_order_operational_ids.join(', ')}]`,
        locations: [toContractPath(paths.roadmap)],
      }));
    }
    if (!outstandingMatchesNext) {
      operationalDiagnostics.push(buildDriftDiagnostic({
        field: 'outstanding_operational_ids',
        expected: `roadmap.next=[${parsed.roadmap.next_operational_ids.join(', ')}]`,
        observed: `roadmap.outstanding=[${parsed.roadmap.outstanding_operational_ids.join(', ')}]`,
        locations: [toContractPath(paths.roadmap)],
      }));
    }
  }
  checks.push(
    checkResult({
      id: 'CLM-006',
      name: 'Operational follow-up queue declarations are synchronized',
      status: operationalQueueConsistent ? 'pass' : 'fail',
      summary: !roadmapDeclaresOperationalQueue
        ? 'No operational follow-up IDs declared in roadmap queue surfaces (check not applicable).'
        : operationalQueueConsistent
        ? 'Operational follow-up queue IDs are synchronized across roadmap and active handoff.'
        : `Operational follow-up queue declarations drift across roadmap and/or active handoff. ${operationalDiagnostics.length} drift(s) detected.`,
      evidence: [toContractPath(paths.roadmap), toContractPath(paths.handoff)],
      details: {
        roadmap_declares_operational_queue: roadmapDeclaresOperationalQueue,
        handoff_exists: sources.handoff.exists,
        handoff_read_error: sources.handoff.read_error,
        roadmap_next_operational_ids: parsed.roadmap.next_operational_ids,
        roadmap_execution_order_operational_ids: parsed.roadmap.execution_order_operational_ids,
        roadmap_outstanding_operational_ids: parsed.roadmap.outstanding_operational_ids,
        handoff_operational_queue_ids: parsed.handoff.operational_queue_ids,
      },
      diagnostics: operationalDiagnostics,
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
  const currentLevelDiagnostics = [];
  if (!currentLevelConsistent && currentLevelValues.length > 0) {
    const expectedLevel = currentLevelValues[0].toLowerCase();
    if (parsed.roadmap.declared_current_level.toLowerCase() !== expectedLevel) {
      currentLevelDiagnostics.push(buildDriftDiagnostic({
        field: 'declared_current_level',
        expected: expectedLevel,
        observed: parsed.roadmap.declared_current_level,
        locations: [toContractPath(paths.roadmap)],
      }));
    }
    if (parsed.maturity.declared_current_level.toLowerCase() !== expectedLevel) {
      currentLevelDiagnostics.push(buildDriftDiagnostic({
        field: 'declared_current_level',
        expected: expectedLevel,
        observed: parsed.maturity.declared_current_level,
        locations: [toContractPath(paths.maturity)],
      }));
    }
    if (parsed.companion.declared_current_level.toLowerCase() !== expectedLevel) {
      currentLevelDiagnostics.push(buildDriftDiagnostic({
        field: 'declared_current_level',
        expected: expectedLevel,
        observed: parsed.companion.declared_current_level,
        locations: [toContractPath(paths.companion)],
      }));
    }
    if (parsed.matrix.cal_delta_02_current_level.toLowerCase() !== expectedLevel) {
      currentLevelDiagnostics.push(buildDriftDiagnostic({
        field: 'cal_delta_02_current_level',
        expected: expectedLevel,
        observed: parsed.matrix.cal_delta_02_current_level,
        locations: [toContractPath(paths.matrix)],
      }));
    }
  }
  checks.push(
    checkResult({
      id: 'CLM-002',
      name: 'Declared current maturity level consistency',
      status: currentLevelConsistent ? 'pass' : 'fail',
      summary: currentLevelConsistent
        ? 'Current maturity level claim is synchronized across roadmap, maturity, companion, and CAL-DELTA-02.'
        : `Current maturity level claim is contradictory across roadmap/maturity/companion/spec declarations. ${currentLevelDiagnostics.length} drift(s) detected.`,
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
      diagnostics: currentLevelDiagnostics,
    }),
  );

  const nextLevelConsistent =
    parsed.roadmap.declared_next_level &&
    parsed.maturity.declared_next_level &&
    parsed.roadmap.declared_next_level.toLowerCase() === parsed.maturity.declared_next_level.toLowerCase();
  const nextLevelDiagnostics = [];
  if (!nextLevelConsistent) {
    if (parsed.roadmap.declared_next_level.toLowerCase() !== parsed.maturity.declared_next_level.toLowerCase()) {
      nextLevelDiagnostics.push(buildDriftDiagnostic({
        field: 'declared_next_level',
        expected: `roadmap="${parsed.roadmap.declared_next_level}", maturity="${parsed.maturity.declared_next_level}" must match`,
        observed: `roadmap="${parsed.roadmap.declared_next_level}", maturity="${parsed.maturity.declared_next_level}"`,
        locations: [toContractPath(paths.roadmap), toContractPath(paths.maturity)],
      }));
    }
  }
  checks.push(
    checkResult({
      id: 'CLM-003',
      name: 'Declared next-level target consistency',
      status: nextLevelConsistent ? 'pass' : 'fail',
      summary: nextLevelConsistent
        ? 'Next-level target declaration matches between roadmap and maturity ladder.'
        : `Next-level target declaration differs between roadmap and maturity ladder. ${nextLevelDiagnostics.length} drift(s) detected.`,
      evidence: [toContractPath(paths.roadmap), toContractPath(paths.maturity)],
      details: {
        roadmap_declared_next_level: parsed.roadmap.declared_next_level,
        maturity_declared_next_level: parsed.maturity.declared_next_level,
      },
      diagnostics: nextLevelDiagnostics,
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
  const deltaDiagnostics = [];
  if (!calDeltaConsistent) {
    deltaDiagnostics.push(buildDriftDiagnostic({
      field: 'CAL-DELTA-02 status',
      expected: `roadmap="${parsed.roadmap.cal_delta_02_status}"`,
      observed: `matrix="${parsed.matrix.cal_delta_02_status}"`,
      locations: [toContractPath(paths.roadmap), toContractPath(paths.matrix)],
    }));
  }
  if (!ullmDeltaConsistent) {
    deltaDiagnostics.push(buildDriftDiagnostic({
      field: 'ULLM-DELTA-02 status',
      expected: `roadmap="${parsed.roadmap.ullm_delta_02_status}"`,
      observed: `matrix="${parsed.matrix.ullm_delta_02_status}"`,
      locations: [toContractPath(paths.roadmap), toContractPath(paths.matrix)],
    }));
  }
  checks.push(
    checkResult({
      id: 'CLM-004',
      name: 'Conformance delta status consistency (CAL-DELTA-02 / ULLM-DELTA-02)',
      status: calDeltaConsistent && ullmDeltaConsistent ? 'pass' : 'fail',
      summary:
        calDeltaConsistent && ullmDeltaConsistent
          ? 'Roadmap and spec matrix agree on claim-critical delta statuses.'
          : `Roadmap and spec matrix differ on one or more claim-critical delta statuses. ${deltaDiagnostics.length} drift(s) detected.`,
      evidence: [toContractPath(paths.roadmap), toContractPath(paths.matrix)],
      details: {
        roadmap_cal_delta_02_status: parsed.roadmap.cal_delta_02_status,
        matrix_cal_delta_02_status: parsed.matrix.cal_delta_02_status,
        roadmap_ullm_delta_02_status: parsed.roadmap.ullm_delta_02_status,
        matrix_ullm_delta_02_status: parsed.matrix.ullm_delta_02_status,
      },
      diagnostics: deltaDiagnostics,
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
  const unattendedDiagnostics = [];
  if (parsed.roadmap.companion_unattended_scope.toLowerCase() !== parsed.companion.unattended_scope_status.toLowerCase()) {
    unattendedDiagnostics.push(buildDriftDiagnostic({
      field: 'companion_unattended_scope',
      expected: `roadmap="${parsed.roadmap.companion_unattended_scope}"`,
      observed: `companion="${parsed.companion.unattended_scope_status}"`,
      locations: [toContractPath(paths.roadmap), toContractPath(paths.companion)],
    }));
  }
  if (parsed.companion.unattended_scope_status.toLowerCase() !== 'out-of-scope') {
    unattendedDiagnostics.push(buildDriftDiagnostic({
      field: 'unattended_scope_status',
      expected: 'out-of-scope',
      observed: parsed.companion.unattended_scope_status,
      locations: [toContractPath(paths.companion)],
    }));
  }
  if (!parsed.companion.explicit_boundary_present) {
    unattendedDiagnostics.push(buildDriftDiagnostic({
      field: 'explicit_boundary_present',
      expected: 'true (explicit boundary language required)',
      observed: 'false (boundary language missing)',
      locations: [toContractPath(paths.companion)],
    }));
  }
  if (!parsed.matrix.cal_delta_02_mentions_unattended_out_of_scope) {
    unattendedDiagnostics.push(buildDriftDiagnostic({
      field: 'cal_delta_02_mentions_unattended_out_of_scope',
      expected: 'true (matrix must reference out-of-scope declaration)',
      observed: 'false (reference missing)',
      locations: [toContractPath(paths.matrix)],
    }));
  }
  checks.push(
    checkResult({
      id: 'CLM-005',
      name: 'Companion unattended-autonomy boundary consistency',
      status: unattendedScopeConsistent ? 'pass' : 'fail',
      summary: unattendedScopeConsistent
        ? 'Unattended autonomy boundary remains explicitly out-of-scope and synchronized across claim docs.'
        : `Unattended autonomy boundary declaration is missing or contradictory across claim docs. ${unattendedDiagnostics.length} drift(s) detected.`,
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
      diagnostics: unattendedDiagnostics,
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
        toContractPath(paths.handoff),
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
      operational_followup_ids:
        parsed.roadmap.next_operational_ids.length > 0
          ? parsed.roadmap.next_operational_ids
          : parsed.handoff.operational_queue_ids,
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
    handoff: resolve(args.handoff),
  };

  const [roadmap, matrix, companion, maturity, handoff] = await Promise.all([
    readText(paths.roadmap),
    readText(paths.matrix),
    readText(paths.companion),
    readText(paths.maturity),
    readText(paths.handoff),
  ]);

  const parsed = {
    roadmap: parseRoadmapClaims(roadmap.text),
    matrix: parseMatrixClaims(matrix.text),
    companion: parseCompanionClaims(companion.text),
    maturity: parseMaturityClaims(maturity.text),
    handoff: parseHandoffClaims(handoff.text),
  };

  const checks = evaluateChecks({
    paths,
    sources: { roadmap, matrix, companion, maturity, handoff },
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
