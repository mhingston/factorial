#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_README_PATH = join(ROOT_DIR, 'README.md');
const DEFAULT_AGENTS_PATH = join(ROOT_DIR, 'AGENTS.md');
const DEFAULT_ROADMAP_PATH = join(ROOT_DIR, 'ROADMAP.md');
const DEFAULT_PACKAGE_JSON_PATH = join(ROOT_DIR, 'package.json');
const DEFAULT_HANDOFF_PATH = join(ROOT_DIR, 'docs', 'roadmap', 'active-handoff.md');
const DEFAULT_ARCHIVE_INDEX_PATH = join(ROOT_DIR, 'docs', 'roadmap', 'archive', 'README.md');
const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'logs', 'docs_freshness', 'report.json');
const DEFAULT_MAX_ROADMAP_AGE_DAYS = 30;
const DEFAULT_MAX_README_LINES = 800;
const DEFAULT_MAX_AGENTS_LINES = 220;
const DEFAULT_MAX_ROADMAP_LINES = 650;
const DEFAULT_MAX_HANDOFF_LINES = 220;

function parseArgs(argv) {
  const args = {
    readme: DEFAULT_README_PATH,
    agents: DEFAULT_AGENTS_PATH,
    roadmap: DEFAULT_ROADMAP_PATH,
    packageJson: DEFAULT_PACKAGE_JSON_PATH,
    handoff: DEFAULT_HANDOFF_PATH,
    archiveIndex: DEFAULT_ARCHIVE_INDEX_PATH,
    report: DEFAULT_REPORT_PATH,
    maxRoadmapAgeDays: String(DEFAULT_MAX_ROADMAP_AGE_DAYS),
    maxReadmeLines: String(DEFAULT_MAX_README_LINES),
    maxAgentsLines: String(DEFAULT_MAX_AGENTS_LINES),
    maxRoadmapLines: String(DEFAULT_MAX_ROADMAP_LINES),
    maxHandoffLines: String(DEFAULT_MAX_HANDOFF_LINES),
    today: '',
    json: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--readme' || arg === '-r') && argv[index + 1]) {
      args.readme = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--agents' || arg === '-a') && argv[index + 1]) {
      args.agents = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--roadmap' || arg === '-m') && argv[index + 1]) {
      args.roadmap = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--package-json' && argv[index + 1]) {
      args.packageJson = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--handoff' && argv[index + 1]) {
      args.handoff = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--archive-index' && argv[index + 1]) {
      args.archiveIndex = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--max-roadmap-age-days' && argv[index + 1]) {
      args.maxRoadmapAgeDays = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--max-readme-lines' && argv[index + 1]) {
      args.maxReadmeLines = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--max-agents-lines' && argv[index + 1]) {
      args.maxAgentsLines = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--max-roadmap-lines' && argv[index + 1]) {
      args.maxRoadmapLines = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--max-handoff-lines' && argv[index + 1]) {
      args.maxHandoffLines = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--today' && argv[index + 1]) {
      args.today = argv[index + 1];
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

function hasPathReference(text, path) {
  const contractPath = toContractPath(path).replace(/\\/g, '/');
  return text.includes(contractPath) || text.includes(`./${contractPath}`);
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

function parseNonNegativeInteger(value, flagName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be an integer >= 0`);
  }
  return parsed;
}

function parseToday(value) {
  if (!value) {
    const now = new Date();
    const asDay = now.toISOString().slice(0, 10);
    return new Date(`${asDay}T00:00:00Z`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--today must be YYYY-MM-DD');
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('--today is invalid');
  }

  return parsed;
}

function parseRoadmapDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(start, end) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / dayMs);
}

function lineCount(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
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

function parseAgentsCoreCommands(text) {
  const section = readSectionByHeading(text, 2, 'Core Commands');
  return section
    .split('\n')
    .map(line => {
      const match = line.match(/`([^`]+)`/);
      return match?.[1]?.trim() ?? '';
    })
    .filter(Boolean);
}

function parseReadmeCommandSurface(text) {
  const scripts = new Set();
  const regex = /npm run\s+([A-Za-z0-9:_-]+)/g;
  let match = regex.exec(text);
  while (match) {
    scripts.add(match[1]);
    match = regex.exec(text);
  }

  return {
    scripts,
    includes_npm_install: /\bnpm\s+install\b/.test(text),
  };
}

function parseRoadmapLastUpdated(text) {
  const match = text.match(/^Last updated:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  return match?.[1] ?? '';
}

function parseRoadmapNextBacklogIds(text) {
  const section = readSectionByHeading(text, 3, 'Next');
  const ids = new Set();
  const regex = /^\|\s*`(BK-\d+)`\s*\|/gm;
  let match = regex.exec(section);
  while (match) {
    ids.add(match[1]);
    match = regex.exec(section);
  }
  return [...ids].sort();
}

function parseAgentsBacklogDirectionIds(text) {
  const match = text.match(/Current backlog direction is[^\n]*/i);
  const line = match?.[0] ?? '';
  const ids = line.match(/BK-\d+/g) ?? [];
  return [...new Set(ids)].sort();
}

function buildCheck({ id, name, status, summary, evidence, details }) {
  return {
    id,
    level: 'docs-freshness',
    name,
    status,
    summary,
    evidence,
    details,
  };
}

function parseScriptsFromAgentsCommands(commands) {
  const scripts = [];
  const nonScriptCommands = [];

  for (const command of commands) {
    if (/^npm run\s+/.test(command)) {
      const match = command.match(/^npm run\s+([^\s]+)/);
      if (match?.[1]) {
        scripts.push(match[1]);
      }
      continue;
    }

    nonScriptCommands.push(command);
  }

  return {
    scripts: [...new Set(scripts)].sort(),
    nonScriptCommands: [...new Set(nonScriptCommands)].sort(),
  };
}

function evaluateChecks({ paths, sources, packageJson, maxRoadmapAgeDays, lineBudgets, today }) {
  const checks = [];

  const docsReadable =
    sources.readme.exists &&
    sources.agents.exists &&
    sources.roadmap.exists &&
    sources.packageJson.exists &&
    !sources.readme.read_error &&
    !sources.agents.read_error &&
    !sources.roadmap.read_error &&
    !sources.packageJson.read_error;

  const packageParsed = packageJson.parse_error === '' && packageJson.parsed && typeof packageJson.parsed === 'object';

  checks.push(
    buildCheck({
      id: 'DF-001',
      name: 'Required documentation sources are readable and package.json is parseable',
      status: docsReadable && packageParsed ? 'pass' : 'fail',
      summary:
        docsReadable && packageParsed
          ? 'README, AGENTS, ROADMAP, and package.json are available and parseable.'
          : 'One or more required docs are missing/unreadable or package.json parsing failed.',
      evidence: [
        toContractPath(paths.readme),
        toContractPath(paths.agents),
        toContractPath(paths.roadmap),
        toContractPath(paths.packageJson),
      ],
      details: {
        readme_exists: sources.readme.exists,
        readme_read_error: sources.readme.read_error,
        agents_exists: sources.agents.exists,
        agents_read_error: sources.agents.read_error,
        roadmap_exists: sources.roadmap.exists,
        roadmap_read_error: sources.roadmap.read_error,
        package_json_exists: sources.packageJson.exists,
        package_json_read_error: sources.packageJson.read_error,
        package_json_parse_error: packageJson.parse_error,
      },
    }),
  );

  const agentsCoreCommands = parseAgentsCoreCommands(sources.agents.text);
  const { scripts: scriptsFromAgents, nonScriptCommands } = parseScriptsFromAgentsCommands(agentsCoreCommands);
  const packageScripts = packageParsed
    ? Object.keys((packageJson.parsed.scripts && typeof packageJson.parsed.scripts === 'object' && packageJson.parsed.scripts) || {})
    : [];
  const packageScriptSet = new Set(packageScripts);
  const readmeSurface = parseReadmeCommandSurface(sources.readme.text);

  const scriptsMissingInPackage = scriptsFromAgents.filter(script => !packageScriptSet.has(script));
  const scriptsMissingInReadme = scriptsFromAgents.filter(script => !readmeSurface.scripts.has(script));
  const npmInstallRequired = nonScriptCommands.includes('npm install');
  const npmInstallMissingInReadme = npmInstallRequired && !readmeSurface.includes_npm_install;

  checks.push(
    buildCheck({
      id: 'DF-002',
      name: 'AGENTS core command surface is synchronized with README and package scripts',
      status:
        scriptsMissingInPackage.length === 0 &&
        scriptsMissingInReadme.length === 0 &&
        !npmInstallMissingInReadme &&
        agentsCoreCommands.length > 0
          ? 'pass'
          : 'fail',
      summary:
        scriptsMissingInPackage.length === 0 &&
        scriptsMissingInReadme.length === 0 &&
        !npmInstallMissingInReadme &&
        agentsCoreCommands.length > 0
          ? 'All AGENTS core commands are executable and documented in README.'
          : 'Command surface drift detected between AGENTS core commands, package scripts, and README.',
      evidence: [toContractPath(paths.agents), toContractPath(paths.readme), toContractPath(paths.packageJson)],
      details: {
        agents_core_commands: agentsCoreCommands,
        scripts_from_agents: scriptsFromAgents,
        scripts_missing_in_package_json: scriptsMissingInPackage,
        scripts_missing_in_readme: scriptsMissingInReadme,
        npm_install_required: npmInstallRequired,
        npm_install_missing_in_readme: npmInstallMissingInReadme,
      },
    }),
  );

  const roadmapLastUpdated = parseRoadmapLastUpdated(sources.roadmap.text);
  const roadmapLastUpdatedDate = parseRoadmapDate(roadmapLastUpdated);
  const roadmapAgeDays = roadmapLastUpdatedDate ? daysBetween(roadmapLastUpdatedDate, today) : null;
  const roadmapFreshnessPass =
    roadmapLastUpdatedDate !== null && roadmapAgeDays !== null && roadmapAgeDays >= 0 && roadmapAgeDays <= maxRoadmapAgeDays;

  checks.push(
    buildCheck({
      id: 'DF-003',
      name: 'ROADMAP last-updated freshness is within SLA',
      status: roadmapFreshnessPass ? 'pass' : 'fail',
      summary: roadmapFreshnessPass
        ? 'ROADMAP last-updated marker is present and within freshness SLA.'
        : 'ROADMAP last-updated marker is missing, invalid, future-dated, or stale.',
      evidence: [toContractPath(paths.roadmap)],
      details: {
        roadmap_last_updated: roadmapLastUpdated,
        roadmap_age_days: roadmapAgeDays,
        max_roadmap_age_days: maxRoadmapAgeDays,
      },
    }),
  );

  const roadmapNextBacklogIds = parseRoadmapNextBacklogIds(sources.roadmap.text);
  const agentsBacklogDirectionIds = parseAgentsBacklogDirectionIds(sources.agents.text);
  const backlogDirectionPass =
    roadmapNextBacklogIds.length === agentsBacklogDirectionIds.length &&
    roadmapNextBacklogIds.every((value, index) => value === agentsBacklogDirectionIds[index]);

  checks.push(
    buildCheck({
      id: 'DF-004',
      name: 'AGENTS backlog direction matches ROADMAP Next queue',
      status: backlogDirectionPass ? 'pass' : 'fail',
      summary: backlogDirectionPass
        ? 'AGENTS backlog-direction declaration matches ROADMAP Next backlog IDs.'
        : 'AGENTS backlog-direction declaration differs from ROADMAP Next backlog IDs.',
      evidence: [toContractPath(paths.agents), toContractPath(paths.roadmap)],
      details: {
        agents_backlog_direction_ids: agentsBacklogDirectionIds,
        roadmap_next_backlog_ids: roadmapNextBacklogIds,
      },
    }),
  );

  const readmeLineCount = lineCount(sources.readme.text);
  const agentsLineCount = lineCount(sources.agents.text);
  const roadmapLineCount = lineCount(sources.roadmap.text);
  const handoffLineCount = lineCount(sources.handoff.text);
  const lineBudgetEvaluable =
    sources.readme.exists &&
    sources.agents.exists &&
    sources.roadmap.exists &&
    sources.handoff.exists &&
    !sources.readme.read_error &&
    !sources.agents.read_error &&
    !sources.roadmap.read_error &&
    !sources.handoff.read_error;
  const lineBudgetPass =
    lineBudgetEvaluable &&
    readmeLineCount <= lineBudgets.readme &&
    agentsLineCount <= lineBudgets.agents &&
    roadmapLineCount <= lineBudgets.roadmap &&
    handoffLineCount <= lineBudgets.handoff;

  checks.push(
    buildCheck({
      id: 'DF-005',
      name: 'Markdown size budgets stay within bounded line-count limits',
      status: lineBudgetPass ? 'pass' : 'fail',
      summary: lineBudgetPass
        ? 'README/AGENTS/ROADMAP/active-handoff line counts are within configured budgets.'
        : 'One or more markdown docs exceed configured line-count budgets or could not be evaluated.',
      evidence: [
        toContractPath(paths.readme),
        toContractPath(paths.agents),
        toContractPath(paths.roadmap),
        toContractPath(paths.handoff),
      ],
      details: {
        readme_line_count: readmeLineCount,
        max_readme_lines: lineBudgets.readme,
        agents_line_count: agentsLineCount,
        max_agents_lines: lineBudgets.agents,
        roadmap_line_count: roadmapLineCount,
        max_roadmap_lines: lineBudgets.roadmap,
        handoff_line_count: handoffLineCount,
        max_handoff_lines: lineBudgets.handoff,
      },
    }),
  );

  const compactionDocsReadable =
    sources.handoff.exists &&
    sources.archiveIndex.exists &&
    !sources.handoff.read_error &&
    !sources.archiveIndex.read_error;
  const roadmapHasHandoffLink = hasPathReference(sources.roadmap.text, paths.handoff);
  const roadmapHasArchiveLink = hasPathReference(sources.roadmap.text, paths.archiveIndex);
  const agentsHasHandoffLink = hasPathReference(sources.agents.text, paths.handoff);
  const compactionPass =
    compactionDocsReadable && roadmapHasHandoffLink && roadmapHasArchiveLink && agentsHasHandoffLink;

  checks.push(
    buildCheck({
      id: 'DF-006',
      name: 'Compaction assets and references are present (active handoff + archive index)',
      status: compactionPass ? 'pass' : 'fail',
      summary: compactionPass
        ? 'Active handoff/archive index files are readable and referenced by ROADMAP/AGENTS.'
        : 'Compaction assets are missing/unreadable or ROADMAP/AGENTS references are incomplete.',
      evidence: [
        toContractPath(paths.handoff),
        toContractPath(paths.archiveIndex),
        toContractPath(paths.roadmap),
        toContractPath(paths.agents),
      ],
      details: {
        handoff_exists: sources.handoff.exists,
        handoff_read_error: sources.handoff.read_error,
        archive_index_exists: sources.archiveIndex.exists,
        archive_index_read_error: sources.archiveIndex.read_error,
        roadmap_has_handoff_link: roadmapHasHandoffLink,
        roadmap_has_archive_link: roadmapHasArchiveLink,
        agents_has_handoff_link: agentsHasHandoffLink,
      },
    }),
  );

  return {
    checks,
    parsed: {
      roadmap_last_updated: roadmapLastUpdated,
      roadmap_age_days: roadmapAgeDays,
      agents_backlog_direction_ids: agentsBacklogDirectionIds,
      roadmap_next_backlog_ids: roadmapNextBacklogIds,
      line_counts: {
        readme: readmeLineCount,
        agents: agentsLineCount,
        roadmap: roadmapLineCount,
        handoff: handoffLineCount,
      },
    },
  };
}

function buildReport({ checks, reportPath, paths, maxRoadmapAgeDays, lineBudgets, parsed }) {
  const failedCheckIds = checks.filter(check => check.status !== 'pass').map(check => check.id);

  return {
    schema_version: 'docs_freshness_report.v1',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    publication: {
      command: 'npm run docs:freshness',
      deterministic_inputs: [
        toContractPath(paths.readme),
        toContractPath(paths.agents),
        toContractPath(paths.roadmap),
        toContractPath(paths.packageJson),
        toContractPath(paths.handoff),
        toContractPath(paths.archiveIndex),
      ],
      policy: {
        max_roadmap_age_days: maxRoadmapAgeDays,
        max_readme_lines: lineBudgets.readme,
        max_agents_lines: lineBudgets.agents,
        max_roadmap_lines: lineBudgets.roadmap,
        max_handoff_lines: lineBudgets.handoff,
      },
    },
    summary: {
      overall_status: failedCheckIds.length === 0 ? 'pass' : 'fail',
      failed_check_ids: failedCheckIds,
      roadmap_last_updated: parsed.roadmap_last_updated,
      roadmap_age_days: parsed.roadmap_age_days,
      agents_backlog_direction_ids: parsed.agents_backlog_direction_ids,
      roadmap_next_backlog_ids: parsed.roadmap_next_backlog_ids,
      line_counts: parsed.line_counts,
    },
    checks,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const maxRoadmapAgeDays = parseNonNegativeInteger(args.maxRoadmapAgeDays, '--max-roadmap-age-days');
  const lineBudgets = {
    readme: parseNonNegativeInteger(args.maxReadmeLines, '--max-readme-lines'),
    agents: parseNonNegativeInteger(args.maxAgentsLines, '--max-agents-lines'),
    roadmap: parseNonNegativeInteger(args.maxRoadmapLines, '--max-roadmap-lines'),
    handoff: parseNonNegativeInteger(args.maxHandoffLines, '--max-handoff-lines'),
  };
  const today = parseToday(args.today);
  const reportPath = resolve(args.report);
  const paths = {
    readme: resolve(args.readme),
    agents: resolve(args.agents),
    roadmap: resolve(args.roadmap),
    packageJson: resolve(args.packageJson),
    handoff: resolve(args.handoff),
    archiveIndex: resolve(args.archiveIndex),
  };

  const [readme, agents, roadmap, packageJsonText, handoff, archiveIndex] = await Promise.all([
    readText(paths.readme),
    readText(paths.agents),
    readText(paths.roadmap),
    readText(paths.packageJson),
    readText(paths.handoff),
    readText(paths.archiveIndex),
  ]);

  let parsedPackageJson = null;
  let packageJsonParseError = '';
  if (packageJsonText.exists && !packageJsonText.read_error) {
    try {
      parsedPackageJson = JSON.parse(packageJsonText.text);
    } catch (error) {
      packageJsonParseError = error instanceof Error ? error.message : String(error);
    }
  }

  const evaluation = evaluateChecks({
    paths,
    sources: {
      readme,
      agents,
      roadmap,
      packageJson: packageJsonText,
      handoff,
      archiveIndex,
    },
    packageJson: {
      parsed: parsedPackageJson,
      parse_error: packageJsonParseError,
    },
    maxRoadmapAgeDays,
    lineBudgets,
    today,
  });

  const report = buildReport({
    checks: evaluation.checks,
    reportPath,
    paths,
    maxRoadmapAgeDays,
    lineBudgets,
    parsed: evaluation.parsed,
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Docs freshness report written to ${reportPath}`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
}

main().catch(error => {
  console.error('Docs freshness audit failed:', error);
  process.exit(1);
});
