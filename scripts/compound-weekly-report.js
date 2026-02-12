#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const args = {
    start: '',
    end: '',
    output: '',
    telemetry: 'docs/metrics/reports/self-host-unattended-telemetry-latest.json',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === '--start' || arg === '-s') && next) {
      args.start = next;
      index += 1;
      continue;
    }
    if ((arg === '--end' || arg === '-e') && next) {
      args.end = next;
      index += 1;
      continue;
    }
    if ((arg === '--output' || arg === '-o') && next) {
      args.output = next;
      index += 1;
      continue;
    }
    if ((arg === '--telemetry' || arg === '-t') && next) {
      args.telemetry = next;
      index += 1;
    }
  }

  return args;
}

function parseDate(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} is invalid`);
  }
  return date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const output = new Date(date.getTime());
  output.setUTCDate(output.getUTCDate() + days);
  return output;
}

function runGit(command) {
  try {
    return execSync(command, { encoding: 'utf8' });
  } catch {
    return '';
  }
}

function listUniqueNonEmptyLines(value) {
  return Array.from(
    new Set(
      value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    )
  );
}

function formatRate(numerator, denominator) {
  if (denominator === 0) {
    return 'N/A';
  }
  const percent = ((numerator / denominator) * 100).toFixed(1);
  return `${percent}% (${numerator}/${denominator})`;
}

function readJsonIfPresent(path) {
  try {
    return {
      exists: true,
      parsed: JSON.parse(readFileSync(resolve(path), 'utf8')),
    };
  } catch {
    return {
      exists: false,
      parsed: null,
    };
  }
}

function asFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function extractTelemetryMetrics(telemetry) {
  if (!telemetry || typeof telemetry !== 'object') {
    return null;
  }
  if (telemetry.schema_version !== 'self_host_unattended_telemetry_report.v1') {
    return null;
  }
  const metrics = telemetry.metrics ?? {};
  return {
    costPerMergedPrProxy: asFiniteNumber(metrics.cost_per_merged_pr_proxy),
    mergedPrs: asFiniteNumber(metrics.merged_prs),
    revertedPrCount: asFiniteNumber(metrics.reverted_pr_count),
    churnedPrCount: asFiniteNumber(metrics.churned_pr_count),
    totalChurnCommits: asFiniteNumber(metrics.total_churn_commits),
    revertRate: asFiniteNumber(metrics.revert_rate),
    churnPrRate: asFiniteNumber(metrics.churn_pr_rate),
    averageChurnCommitsPerMergedPr: asFiniteNumber(
      metrics.average_churn_commits_per_merged_pr
    ),
  };
}

function resolveReportOutput(start, end, explicitOutput) {
  if (explicitOutput) {
    return resolve(explicitOutput);
  }
  return resolve(`docs/metrics/reports/week-${start}_to_${end}.md`);
}

function parseIssueClassesFromReview(content) {
  const issueClasses = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0);
    if (cells.length < 7) continue;
    const [issueId, issueClass, severity] = cells;
    if (issueId === 'issue_id' || issueId === '---') continue;
    if (!/^P[123]$/i.test(severity.replace(/`/g, ''))) continue;
    issueClasses.push(issueClass.replace(/`/g, ''));
  }
  return issueClasses;
}

function parseLockDecision(content) {
  const match = content.match(/Decision:\s*`?(resolved|reopen)`?/i);
  return match ? match[1].toLowerCase() : '';
}

function buildReport({
  start,
  end,
  solutions,
  contextUpdates,
  reviewFiles,
  recurrenceRate,
  reopenRate,
  costPerMergedPrProxy,
  revertedPrCount,
  churnedPrCount,
  totalChurnCommits,
  revertRate,
  churnPrRate,
  averageChurnCommitsPerMergedPr,
  telemetryPath,
}) {
  return [
    `Week of ${start} to ${end}`,
    `- solutions_created_weekly: ${solutions}`,
    `- context_updates_weekly: ${contextUpdates}`,
    `- known_issue_recurrence_rate: ${recurrenceRate}`,
    `- median_cycles_to_close: N/A (single-pass batch data only in this week range)`,
    `- reopen_rate: ${reopenRate}`,
    `- cost_per_merged_pr_proxy: ${
      costPerMergedPrProxy === null ? 'N/A' : costPerMergedPrProxy
    } (source: ${telemetryPath})`,
    `- reverted_pr_count: ${revertedPrCount === null ? 'N/A' : revertedPrCount} (source: ${telemetryPath})`,
    `- churned_pr_count: ${churnedPrCount === null ? 'N/A' : churnedPrCount} (source: ${telemetryPath})`,
    `- total_churn_commits: ${totalChurnCommits === null ? 'N/A' : totalChurnCommits} (source: ${telemetryPath})`,
    `- revert_rate: ${revertRate} (source: ${telemetryPath})`,
    `- churn_pr_rate: ${churnPrRate} (source: ${telemetryPath})`,
    `- average_churn_commits_per_merged_pr: ${
      averageChurnCommitsPerMergedPr === null ? 'N/A' : averageChurnCommitsPerMergedPr
    } (source: ${telemetryPath})`,
    `- verifier_agreement_rate: N/A (no independent duplicate verifier runs recorded)`,
    `- review_artifacts_counted: ${reviewFiles.length}`,
    `- Notes / actions: Generated from git history and review artifacts via scripts/compound-weekly-report.js.`,
    '',
  ].join('\n');
}

function formatTelemetryRate(rate, numerator, denominator) {
  if (typeof numerator === 'number' && typeof denominator === 'number') {
    return formatRate(numerator, denominator);
  }
  if (rate === null) {
    return 'N/A';
  }
  return `${(rate * 100).toFixed(1)}%`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.start) {
    throw new Error('Missing required --start YYYY-MM-DD');
  }

  const startDate = parseDate(args.start, 'start');
  const endDate = args.end ? parseDate(args.end, 'end') : addDays(startDate, 6);
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  const outputPath = resolveReportOutput(start, end, args.output);
  const telemetryPath = args.telemetry;

  const since = `${start} 00:00`;
  const until = `${end} 23:59`;

  const createdSolutionsRaw = runGit(
    `git log --since="${since}" --until="${until}" --diff-filter=A --name-only --pretty=format: -- docs/solutions`
  );
  const createdSolutions = listUniqueNonEmptyLines(createdSolutionsRaw).filter(path => {
    return /docs\/solutions\/.*\.md$/i.test(path) && !/README\.md|example-/i.test(path);
  });

  const contextUpdatesRaw = runGit(
    `git log --since="${since}" --until="${until}" --pretty=format:%H -- AGENTS.md CLAUDE.md`
  );
  const contextUpdates = listUniqueNonEmptyLines(contextUpdatesRaw).length;

  const reviewFilesRaw = runGit(
    `git log --since="${since}" --until="${until}" --name-only --pretty=format: -- docs/reviews`
  );
  const reviewFiles = listUniqueNonEmptyLines(reviewFilesRaw).filter(path => /docs\/reviews\/.*\.md$/i.test(path));

  const issueClasses = [];
  const lockDecisions = [];
  for (const reviewPath of reviewFiles) {
    try {
      const content = readFileSync(resolve(reviewPath), 'utf8');
      issueClasses.push(...parseIssueClassesFromReview(content));
      const decision = parseLockDecision(content);
      if (decision) {
        lockDecisions.push(decision);
      }
    } catch {
      // Ignore removed/missing files in historical ranges.
    }
  }

  const classCounts = new Map();
  for (const issueClass of issueClasses) {
    classCounts.set(issueClass, (classCounts.get(issueClass) ?? 0) + 1);
  }
  let repeatedFindings = 0;
  for (const count of classCounts.values()) {
    if (count > 1) {
      repeatedFindings += count - 1;
    }
  }
  const recurrenceRate = formatRate(repeatedFindings, issueClasses.length);

  const reopenCount = lockDecisions.filter(decision => decision === 'reopen').length;
  const reopenRate = formatRate(reopenCount, lockDecisions.length);

  const telemetryState = readJsonIfPresent(telemetryPath);
  const telemetryMetrics = extractTelemetryMetrics(telemetryState.parsed);
  const costPerMergedPrProxy = telemetryMetrics?.costPerMergedPrProxy ?? null;
  const mergedPrs = telemetryMetrics?.mergedPrs ?? null;
  const revertedPrCount = telemetryMetrics?.revertedPrCount ?? null;
  const churnedPrCount = telemetryMetrics?.churnedPrCount ?? null;
  const totalChurnCommits = telemetryMetrics?.totalChurnCommits ?? null;
  const revertRate = formatTelemetryRate(
    telemetryMetrics?.revertRate ?? null,
    revertedPrCount,
    mergedPrs
  );
  const churnPrRate = formatTelemetryRate(
    telemetryMetrics?.churnPrRate ?? null,
    churnedPrCount,
    mergedPrs
  );
  const averageChurnCommitsPerMergedPr =
    telemetryMetrics?.averageChurnCommitsPerMergedPr ?? null;

  const report = buildReport({
    start,
    end,
    solutions: createdSolutions.length,
    contextUpdates,
    reviewFiles,
    recurrenceRate,
    reopenRate,
    costPerMergedPrProxy,
    revertedPrCount,
    churnedPrCount,
    totalChurnCommits,
    revertRate,
    churnPrRate,
    averageChurnCommitsPerMergedPr,
    telemetryPath,
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, report, 'utf8');
  console.log(`Wrote compound weekly report: ${outputPath}`);
}

main();
