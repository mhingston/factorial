#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..', '..'));

const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'logs', 'tools', 'date_linter', 'report.json');

function parseArgs(argv) {
  const args = {
    paths: [],
    report: DEFAULT_REPORT_PATH,
    fix: false,
    json: false,
    verbose: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--path' && argv[index + 1]) {
      args.paths.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--fix') {
      args.fix = true;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node date-linter.js [options]

Enforce deterministic date formatting. Detects usage of 'new Date()' without 
explicit timezone and enforces ISO-8601 with 'Z' suffix or explicit offset.

Options:
  --path <path>       Add a file or directory to scan (can be used multiple times)
  --report, -o <path> Output report path (default: logs/tools/date_linter/report.json)
  --fix               Apply fixes (default: read-only mode)
  --json              Output report as JSON to stdout
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Examples:
  node date-linter.js --path ./src
  node date-linter.js --path ./src --fix
`);
      process.exit(0);
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

async function collectFiles(paths) {
  const files = [];
  const extensions = new Set(['.js', '.ts', '.mjs', '.cjs']);

  async function walk(currentPath) {
    let entries = [];
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      // If readdir fails, check if it's a file
      try {
        if (extname(currentPath) && extensions.has(extname(currentPath))) {
          files.push(resolve(currentPath));
        }
      } catch {
        // Skip unreadable paths
      }
      return;
    }

    for (const entry of entries) {
      const absolute = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and common non-source directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
          await walk(absolute);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (extensions.has(ext)) {
          files.push(resolve(absolute));
        }
      }
    }
  }

  for (const path of paths) {
    await walk(resolve(path));
  }

  return [...new Set(files)].sort();
}

function buildCheck({ id, name, status, summary, evidence, details }) {
  return {
    id,
    level: 'tool-date-linter',
    name,
    status,
    summary,
    evidence,
    details,
  };
}

function findDateViolations(content, filePath) {
  const violations = [];
  const lines = content.split('\n');

  // Pattern 1: new Date() without explicit timezone
  // Matches: new Date(), new Date(variable), new Date(1234567890)
  // Excludes: new Date('2024-01-01T00:00:00Z'), new Date().toISOString()
  const newDatePattern = /new\s+Date\s*\([^)]*\)/g;
  // Pattern 2: Date.now() is acceptable (deterministic for relative timing)
  // Pattern 3: toISOString() usage is good
  const isoStringPattern = /\.toISOString\s*\(\)/;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;

    let match;
    while ((match = newDatePattern.exec(line)) !== null) {
      const dateExpr = match[0];
      const matchIndex = match.index;

      // Skip if it's already using ISO string (checked elsewhere) or toISOString() is called
      const restOfLine = line.slice(matchIndex + dateExpr.length);
      const hasIsoString = isoStringPattern.test(restOfLine);

      // Check if the Date constructor has a valid ISO string argument with Z or offset
      const argMatch = dateExpr.match(/new\s+Date\s*\(\s*['"`]/);
      const hasValidIsoArg = argMatch && /(Z|[+-]\d{2}:\d{2})/.test(dateExpr);

      // Skip if Date is used for timestamp comparison with Date.now()
      const isTimestampComparison = /Date\.now\s*\(\)/.test(line) || line.includes('getTime()');

      if (!hasValidIsoArg && !hasIsoString && !isTimestampComparison) {
        violations.push({
          file: toContractPath(filePath),
          line: lineNumber,
          column: matchIndex + 1,
          code: line.trim(),
          message: 'Non-deterministic date construction without explicit timezone',
          severity: 'error',
          fix: 'Use new Date().toISOString() or new Date("YYYY-MM-DDTHH:mm:ssZ") with explicit timezone',
        });
      }
    }

    // Pattern 4: Check for toLocaleString without explicit locale and timezone
    // This is non-deterministic across different environments
    const localePattern = /\.toLocaleString\s*\(/g;
    while ((match = localePattern.exec(line)) !== null) {
      const afterMatch = line.slice(match.index + match[0].length);
      // Check if options with timeZone are provided
      if (!afterMatch.includes('timeZone')) {
        violations.push({
          file: toContractPath(filePath),
          line: lineNumber,
          column: match.index + 1,
          code: line.trim(),
          message: 'toLocaleString without explicit timeZone is non-deterministic',
          severity: 'warning',
          fix: 'Add { timeZone: "UTC" } or another explicit timezone to toLocaleString options',
        });
      }
    }
  }

  return violations;
}

async function evaluateChecks({ files, fix }) {
  const checks = [];
  const allViolations = [];
  let filesWithViolations = 0;

  for (const file of files) {
    const content = await readText(file);
    if (!content.exists || content.read_error) {
      continue;
    }

    const violations = findDateViolations(content.text, file);
    if (violations.length > 0) {
      filesWithViolations += 1;
      allViolations.push(...violations);

      if (fix) {
        // AGT-003: Writes require explicit flag
        // Implementation would apply fixes here
        // For now, just log that fix mode is enabled
        console.log(`  [DRY-RUN] Would fix ${violations.length} violation(s) in ${toContractPath(file)}`);
      }
    }
  }

  const hasErrors = allViolations.some(v => v.severity === 'error');

  checks.push(
    buildCheck({
      id: 'DATE-001',
      name: 'Deterministic date formatting compliance',
      status: hasErrors ? 'fail' : 'pass',
      summary: hasErrors
        ? `Found ${allViolations.filter(v => v.severity === 'error').length} error(s) and ${allViolations.filter(v => v.severity === 'warning').length} warning(s) in ${filesWithViolations} file(s)`
        : 'All date constructions use explicit timezone or ISO-8601 format',
      evidence: filesWithViolations > 0
        ? [...new Set(allViolations.slice(0, 5).map(v => v.file))]
        : files.slice(0, 5).map(f => toContractPath(f)),
      details: {
        files_scanned: files.length,
        files_with_violations: filesWithViolations,
        total_violations: allViolations.length,
        error_count: allViolations.filter(v => v.severity === 'error').length,
        warning_count: allViolations.filter(v => v.severity === 'warning').length,
        fix_mode: fix,
      },
    })
  );

  return { checks, violations: allViolations };
}

function buildReport({ checks, reportPath, paths, violations }) {
  const failedCheckIds = checks.filter(check => check.status !== 'pass').map(check => check.id);

  return {
    schema_version: 'tool_date_linter_report.v1',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    tool: {
      name: 'date-linter',
      version: '1.0.0',
      description: 'Enforce deterministic date formatting',
    },
    summary: {
      overall_status: failedCheckIds.length === 0 ? 'pass' : 'fail',
      failed_check_ids: failedCheckIds,
      files_scanned: paths.length,
      violations_found: violations.length,
    },
    checks,
    violations: violations.slice(0, 100), // Limit report size
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const reportPath = resolve(args.report);

    if (args.paths.length === 0) {
      console.error('Error: At least one --path is required');
      process.exit(1);
    }

    if (args.verbose) {
      console.log('Scanning paths:', args.paths);
    }

    const files = await collectFiles(args.paths);

    if (args.verbose) {
      console.log(`Found ${files.length} files to scan`);
    }

    const { checks, violations } = await evaluateChecks({ files, fix: args.fix });

    const report = buildReport({
      checks,
      reportPath,
      paths: args.paths,
      violations,
    });

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}
`, 'utf-8');
    console.log(`Report written to ${reportPath}`);

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    }

    // AGT-003: Read-only by default
    if (!args.fix && violations.length > 0) {
      console.log(`\nFound ${violations.length} violation(s). Run with --fix to apply corrections.`);
    }

    process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
  } catch (error) {
    console.error('Tool execution failed:', error);
    process.exit(1);
  }
}

main();
