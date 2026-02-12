#!/usr/bin/env node
// FA-008: Full autonomy telemetry validation with 30-day aggregation

import { readFile, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_OOD_THRESHOLDS,
  build30DayAggregate,
  buildFullAutonomyTelemetryReport,
  categorizeRun,
  createDailySnapshot,
  detectOOD,
  generateEscalationAlerts,
  validateFullAutonomyTelemetrySource,
  verifyHashChain,
} from '../dist/packages/core/src/dtu/full-autonomy-telemetry.js';

const DEFAULT_SOURCE_PATH = './docs/metrics/reports/full-autonomy-telemetry-source-latest.json';
const DEFAULT_REPORT_PATH = './docs/metrics/reports/full-autonomy-telemetry-latest.json';

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE_PATH,
    report: DEFAULT_REPORT_PATH,
    requirePass: false,
    days: 30,
    categorize: false,
    enableOodDetection: true,
    enableAlerts: true,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--source' || arg === '-s') && argv[index + 1]) {
      args.source = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--require-pass') {
      args.requirePass = true;
    }
    if ((arg === '--days' || arg === '-d') && argv[index + 1]) {
      const days = parseInt(argv[index + 1], 10);
      if (!Number.isNaN(days) && days > 0) {
        args.days = days;
      }
      index += 1;
      continue;
    }
    if (arg === '--categorize') {
      args.categorize = true;
    }
    if (arg === '--no-ood-detection') {
      args.enableOodDetection = false;
    }
    if (arg === '--no-alerts') {
      args.enableAlerts = false;
    }
  }

  return args;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function groupRunsByDate(runs) {
  const groups = new Map();
  for (const run of runs) {
    const date = formatDate(new Date(run.started_at));
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date).push(run);
  }
  return groups;
}

function categorizeRuns(runs) {
  return runs.map(run => {
    // Infer workflow type from category
    let workflowType = 'other';
    if (run.category.includes('lint')) workflowType = 'ci-lint';
    else if (run.category.includes('test')) workflowType = 'ci-test';
    else if (run.category.includes('build')) workflowType = 'ci-build';
    else if (run.category.includes('review') || run.category.includes('code')) workflowType = 'codereview';
    else if (run.category.includes('deploy')) workflowType = 'deployment';
    else if (run.category.includes('healing')) workflowType = 'self-healing';
    else if (run.category.includes('maint')) workflowType = 'maintenance';

    // Determine error class
    let errorClass = 'none';
    if (run.status === 'fail') {
      errorClass = 'unknown_error';
    }

    // Determine escalation reasons
    const escalationReasons = run.escalations_count > 0
      ? ['human_discretion']
      : ['none'];

    return categorizeRun(run, {
      workflowType,
      errorClass,
      escalationReasons,
    });
  });
}

async function runFullAutonomyTelemetry() {
  console.log('FA-008: Full Autonomy Telemetry');
  console.log('===============================\n');

  const args = parseArgs(process.argv);
  const sourcePath = resolve(args.source);
  const reportPath = resolve(args.report);

  console.log(`Configuration:`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Report: ${reportPath}`);
  console.log(`  Days: ${args.days}`);
  console.log(`  Categorize: ${args.categorize}`);
  console.log(`  OOD Detection: ${args.enableOodDetection}`);
  console.log(`  Alerts: ${args.enableAlerts}`);
  console.log();

  const raw = await readFile(sourcePath, 'utf-8');
  const source = JSON.parse(raw);
  const validation = validateFullAutonomyTelemetrySource(source);
  if (!validation.valid) {
    console.error('Source validation failed:', validation.errors.join('; '));
    if (args.requirePass) {
      process.exit(1);
    }
  }

  // Categorize runs if requested
  let processedRuns = source.runs || [];
  if (args.categorize) {
    console.log('Categorizing runs by workflow type, error class, and escalation reasons...');
    processedRuns = categorizeRuns(processedRuns);
    console.log(`  Categorized ${processedRuns.length} runs`);
    console.log();
  }

  // Build daily snapshots
  const runGroups = groupRunsByDate(processedRuns);
  const sortedDates = [...runGroups.keys()].sort();
  const dailySnapshots = [];
  let previousHash = null;

  console.log(`Building daily snapshots (${sortedDates.length} days with data)...`);
  for (const date of sortedDates) {
    const runs = runGroups.get(date);
    const snapshot = createDailySnapshot(date, runs, previousHash);
    dailySnapshots.push(snapshot);
    previousHash = snapshot.hash;
  }
  console.log(`  Created ${dailySnapshots.length} daily snapshots`);
  console.log();

  // Verify hash chain
  console.log('Verifying tamper-evident hash chain...');
  const hashChainValid = verifyHashChain(dailySnapshots);
  console.log(`  Hash chain integrity: ${hashChainValid ? 'VALID' : 'INVALID'}`);
  console.log();

  // Build 30-day aggregate
  console.log(`Building ${args.days}-day aggregate...`);
  const thirtyDayAggregate = build30DayAggregate(dailySnapshots, {
    allowInterpolation: true,
    gapFillMethod: 'zero_fill',
  });
  console.log(`  Window: ${thirtyDayAggregate.window_start} to ${thirtyDayAggregate.window_end}`);
  console.log(`  Days with data: ${thirtyDayAggregate.days_with_data}`);
  console.log(`  Days with gaps: ${thirtyDayAggregate.days_with_gaps}`);
  console.log(`  Total runs: ${Object.values(thirtyDayAggregate.category_distribution).reduce((a, b) => a + b, 0)}`);
  console.log(`  Categories: ${Object.keys(thirtyDayAggregate.category_distribution).join(', ')}`);
  console.log();

  // OOD Detection
  let oodDetection = null;
  if (args.enableOodDetection && dailySnapshots.length > 0) {
    console.log('Running OOD detection with conservative thresholds...');
    const allRuns = dailySnapshots.flatMap(s => s.runs);
    const totalRuns = allRuns.length;
    const escalationCount = allRuns.filter(r => r.escalations_count > 0).length;
    const failureCount = allRuns.filter(r => r.status === 'fail').length;
    const oodCount = allRuns.filter(r => r.ood_detected).length;

    oodDetection = detectOOD(
      {
        escalationRate: totalRuns > 0 ? escalationCount / totalRuns : 0,
        failureRate: totalRuns > 0 ? failureCount / totalRuns : 0,
        oodRate: totalRuns > 0 ? oodCount / totalRuns : 0,
      },
      DEFAULT_OOD_THRESHOLDS
    );

    console.log(`  OOD Detected: ${oodDetection.is_ood ? 'YES' : 'NO'}`);
    if (oodDetection.is_ood) {
      console.log(`  Trigger: ${oodDetection.trigger_metric}`);
      console.log(`  Value: ${(oodDetection.trigger_value * 100).toFixed(2)}%`);
      console.log(`  Threshold: ${(oodDetection.threshold_value * 100).toFixed(2)}%`);
      console.log(`  Confidence: ${(oodDetection.confidence * 100).toFixed(2)}%`);
    }
    console.log();
  }

  // Generate escalation alerts
  let escalationAlerts = [];
  if (args.enableAlerts) {
    console.log('Generating escalation alerts...');
    const allRuns = dailySnapshots.flatMap(s => s.runs);
    escalationAlerts = generateEscalationAlerts(allRuns, {
      minEscalations: 1,
      criticalReasons: ['security_review_required', 'authorization_failure'],
    });

    if (escalationAlerts.length > 0) {
      console.log(`  ${escalationAlerts.length} alert(s) generated:`);
      for (const alert of escalationAlerts) {
        console.log(`    [${alert.severity.toUpperCase()}] ${alert.escalation_run_id}: ${alert.message}`);
      }
    } else {
      console.log('  No escalation alerts');
    }
    console.log();
  }

  // Build base report
  const baseReport = buildFullAutonomyTelemetryReport({
    sourcePath: args.source,
    source,
  });

  // Enhance report with 30-day fields
  const report = {
    ...baseReport,
    summary: {
      ...baseReport.summary,
      thirty_day_aggregate: thirtyDayAggregate,
      ood_detection: oodDetection,
      escalation_alerts: escalationAlerts,
    },
    thirty_day_telemetry: {
      hash_chain_valid: hashChainValid,
      daily_snapshot_count: dailySnapshots.length,
      categorization_enabled: args.categorize,
      ood_detection_enabled: args.enableOodDetection,
      alerts_enabled: args.enableAlerts,
      aggregate: thirtyDayAggregate,
    },
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Report written to: ${reportPath}`);
  console.log();
  console.log(`FA-008 Status: ${report.fa_008_status.toUpperCase()}`);
  console.log(`Validation: ${report.validation.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Hash Chain: ${hashChainValid ? 'VALID' : 'INVALID'}`);

  if (!report.validation.passed && args.requirePass) {
    process.exit(1);
  }
}

runFullAutonomyTelemetry().catch(error => {
  console.error('Full autonomy telemetry validation failed:', error);
  process.exit(1);
});
