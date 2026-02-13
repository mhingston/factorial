#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_PRINCIPLES_PATH = join(ROOT_DIR, 'docs', 'golden-principles.md');
const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'logs', 'golden-principles', 'report.json');
const DEFAULT_OUTPUT_DIR = join(ROOT_DIR, 'logs', 'golden-principles');

const PRINCIPLES_SCHEMA_VERSION = 'golden_principles.v1';
const REPORT_SCHEMA_VERSION = 'golden_principles_report.v1';

function parseArgs(argv) {
  const args = {
    principles: DEFAULT_PRINCIPLES_PATH,
    report: DEFAULT_REPORT_PATH,
    autoFix: false,
    diffOnly: false,
    changedFiles: [],
    json: false,
    verbose: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--principles' || arg === '-p') && argv[index + 1]) {
      args.principles = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--auto-fix' || arg === '-f') {
      args.autoFix = true;
      continue;
    }
    if (arg === '--diff-only' || arg === '-d') {
      args.diffOnly = true;
      continue;
    }
    if (arg === '--changed-files' && argv[index + 1]) {
      args.changedFiles = argv[index + 1].split(',').filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === '--json' || arg === '-j') {
      args.json = true;
      continue;
    }
    if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Golden Principles Audit

Usage: node scripts/golden-principles-audit.js [options]

Options:
  -p, --principles <path>     Path to golden-principles.md (default: docs/golden-principles.md)
  -o, --report <path>         Output report path (default: logs/golden-principles/report.json)
  -f, --auto-fix              Apply auto-fixes for safe principles
  -d, --diff-only             Only scan changed files
  --changed-files <list>      Comma-separated list of changed files
  -j, --json                  Output report as JSON to stdout
  -v, --verbose               Verbose output
  -h, --help                  Show this help

Examples:
  node scripts/golden-principles-audit.js
  node scripts/golden-principles-audit.js --auto-fix
  node scripts/golden-principles-audit.js --diff-only --changed-files "src/foo.ts,src/bar.ts"
`);
}

function toContractPath(filePath) {
  const repoRelative = relative(ROOT_DIR, filePath);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : filePath;
}

async function readPrinciplesFile(path) {
  try {
    const content = await readFile(path, 'utf-8');
    return { exists: true, content, error: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exists: false, content: '', error: message };
  }
}

function parsePrinciples(content) {
  const principles = [];
  const lines = content.split('\n');
  let currentPrinciple = null;
  let currentSection = null;
  let currentSubsection = null;

  // Parse YAML frontmatter (only at the beginning of the file)
  let inFrontmatter = false;
  let frontmatterClosed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Handle frontmatter delimiters (only before any content)
    if (line === '---' && !frontmatterClosed) {
      inFrontmatter = !inFrontmatter;
      if (!inFrontmatter) {
        frontmatterClosed = true;
      }
      continue;
    }

    // Skip frontmatter content
    if (inFrontmatter) continue;

    // Parse principle headers (### GP-XXX: Name)
    const principleMatch = line.match(/^### (GP-\d+):\s*(.+)$/);
    if (principleMatch) {
      if (currentPrinciple) {
        principles.push(currentPrinciple);
      }
      currentPrinciple = {
        id: principleMatch[1],
        name: principleMatch[2].trim(),
        severity: 'info',
        category: 'general',
        detection: {
          strategy: 'regex',
          patterns: [],
          file_globs: [],
          ignore_comments: [],
        },
        fix: {
          auto_fixable: false,
          replacement: null,
          requires_human_review: true,
        },
        evidence: {
          solution_doc: '',
          example_violations: [],
        },
        line_start: lineNumber,
      };
      currentSection = null;
      currentSubsection = null;
      continue;
    }

    if (!currentPrinciple) continue;

    // Parse property lines like **Severity:** `warning`
    if (line.startsWith('**')) {
      const sectionMatch = line.match(/^\*\*(\w+):\*\*\s*`?([^`]*)`?$/);
      if (sectionMatch) {
        const key = sectionMatch[1].toLowerCase();
        const value = sectionMatch[2].trim();
        if (key === 'severity') {
          currentPrinciple.severity = value;
        } else if (key === 'category') {
          currentPrinciple.category = value;
        }
      }

      // Parse subsections (e.g., **Detection:**, **Fix:**, **Evidence:**)
      if (line.startsWith('**Detection:**')) {
        currentSection = 'detection';
        currentSubsection = null;
      } else if (line.startsWith('**Fix:**')) {
        currentSection = 'fix';
        currentSubsection = null;
      } else if (line.startsWith('**Evidence:**')) {
        currentSection = 'evidence';
        currentSubsection = null;
      }
      continue;
    }

    // Parse detection details
    if (currentSection === 'detection') {
      const trimmed = line.trim();

      // Track subsections within Detection
      if (trimmed === '- Patterns:') {
        currentSubsection = 'patterns';
        continue;
      }
      if (trimmed === '- Ignore patterns:') {
        currentSubsection = 'ignore';
        continue;
      }

      const strategyMatch = line.match(/- Strategy:\s*`?(\w+)`?/);
      if (strategyMatch) {
        currentPrinciple.detection.strategy = strategyMatch[1];
        currentSubsection = null;
        continue;
      }

      const globMatch = line.match(/- File globs:\s*(.+)/);
      if (globMatch) {
        currentPrinciple.detection.file_globs = globMatch[1]
          .split(',')
          .map(g => g.trim().replace(/^`+|`+$/g, ''));
        currentSubsection = null;
        continue;
      }

      // Match pattern lines only in Patterns subsection
      const patternMatch = line.match(/^\s+-\s+`([^`]+)`/);
      if (patternMatch && currentSubsection === 'patterns') {
        currentPrinciple.detection.patterns.push(patternMatch[1]);
      }

      // Match ignore patterns in Ignore patterns subsection
      if (patternMatch && currentSubsection === 'ignore') {
        currentPrinciple.detection.ignore_comments.push(patternMatch[1]);
      }
    }

    // Parse fix details
    if (currentSection === 'fix') {
      const autoFixMatch = line.match(/- Auto-fixable:\s*`?(true|false)`?/);
      if (autoFixMatch) {
        currentPrinciple.fix.auto_fixable = autoFixMatch[1] === 'true';
      }

      const humanReviewMatch = line.match(/- Requires human review:\s*`?(true|false)`?/);
      if (humanReviewMatch) {
        currentPrinciple.fix.requires_human_review = humanReviewMatch[1] === 'true';
      }
    }

    // Parse evidence details
    if (currentSection === 'evidence') {
      const solutionDocMatch = line.match(/- Solution doc:\s*`?([^`]+)`?/);
      if (solutionDocMatch) {
        currentPrinciple.evidence.solution_doc = solutionDocMatch[1].trim();
      }
    }
  }

  if (currentPrinciple) {
    principles.push(currentPrinciple);
  }

  return principles;
}

async function findFiles(globs, changedFiles = []) {
  if (changedFiles.length > 0) {
    return changedFiles.filter(file => {
      return globs.some(pattern => {
        // Simple glob matching for changed files
        // Convert glob pattern to regex
        const normalizedPattern = pattern
          .replace(/\*\*/g, '{{GLOBSTAR}}')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '.')
          .replace(/\./g, '\\.')
          .replace(/{{GLOBSTAR}}/g, '.*');

        const regex = new RegExp(normalizedPattern);
        return regex.test(file);
      });
    });
  }

  const files = new Set();
  for (const pattern of globs) {
    const matches = await glob(pattern, { cwd: ROOT_DIR, absolute: true });
    matches.forEach(f => files.add(f));
  }
  return [...files];
}

function hasIgnoreComment(content, lineNumber, principleId) {
  const lines = content.split('\n');
  const line = lines[lineNumber - 1] || '';
  const prevLine = lines[lineNumber - 2] || '';

  const ignorePattern = new RegExp(`//\\s*golden-ignore:\\s*${principleId}\\b`);
  return ignorePattern.test(line) || ignorePattern.test(prevLine);
}

async function detectViolations(principle, files, verbose) {
  const violations = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        for (const pattern of principle.detection.patterns) {
          let regex;
          try {
            regex = new RegExp(pattern, 'i');
          } catch {
            // If pattern is not valid regex, treat as literal
            regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          }

          if (regex.test(line)) {
            // Check for ignore comment
            if (hasIgnoreComment(content, lineNumber, principle.id)) {
              if (verbose) {
                console.log(`  Ignored ${principle.id} violation in ${toContractPath(filePath)}:${lineNumber}`);
              }
              continue;
            }

            violations.push({
              principle_id: principle.id,
              severity: principle.severity,
              file: toContractPath(filePath),
              line: lineNumber,
              column: line.search(regex) + 1,
              message: `Pattern violation: ${pattern}`,
              context: line.trim(),
              fixable: principle.fix.auto_fixable,
              suggested_fix: principle.fix.replacement || 'See golden-principles.md for fix guidance',
            });
          }
        }
      }
    } catch (error) {
      if (verbose) {
        console.error(`Error reading ${filePath}: ${error}`);
      }
    }
  }

  return violations;
}

async function applyFixes(violations, principles, verbose) {
  const fixesApplied = [];

  for (const violation of violations) {
    if (!violation.fixable) continue;

    const principle = principles.find(p => p.id === violation.principle_id);
    if (!principle || !principle.fix.auto_fixable) continue;

    // GP-001: Replace manual temp/build with test harness
    if (principle.id === 'GP-001') {
      try {
        const filePath = resolve(ROOT_DIR, violation.file);
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        // Check if already imports test harness
        const hasImport = lines.some(line =>
          line.includes('test-harness') ||
          line.includes('createSuiteIsolation') ||
          line.includes('ensureDeterministicCliBuild')
        );

        if (!hasImport) {
          // Find the last complete import statement (not part of multi-line import)
          let lastImportIndex = -1;
          let inMultiLineImport = false;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('import ')) {
              lastImportIndex = i;
              inMultiLineImport = line.includes('{') && !line.includes('}');
            } else if (inMultiLineImport && line.includes('}')) {
              lastImportIndex = i;
              inMultiLineImport = false;
            }
          }

          const importLine = `import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';`;
          if (lastImportIndex >= 0) {
            lines.splice(lastImportIndex + 1, 0, importLine);
          } else {
            lines.unshift(importLine);
          }

          await writeFile(filePath, lines.join('\n'), 'utf-8');

          fixesApplied.push({
            principle_id: principle.id,
            file: violation.file,
            original: '',
            replacement: importLine,
          });

          if (verbose) {
            console.log(`  Fixed: Added test harness import to ${violation.file}`);
          }
        }
      } catch (error) {
        if (verbose) {
          console.error(`Error applying fix to ${violation.file}: ${error}`);
        }
      }
    }
  }

  return fixesApplied;
}

function buildReport({
  principles,
  violations,
  fixesApplied,
  reportPath,
  principlesPath,
  args,
}) {
  const violationCounts = {};
  for (const principle of principles) {
    violationCounts[principle.id] = violations.filter(v => v.principle_id === principle.id).length;
  }

  const errorViolations = violations.filter(v => v.severity === 'error');
  const hasErrors = errorViolations.length > 0;

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    publication: {
      command: args.autoFix ? 'npm run golden:fix' : 'npm run golden:audit',
      deterministic_inputs: [toContractPath(principlesPath)],
      policy: {
        auto_fix_enabled: args.autoFix,
        diff_only: args.diffOnly,
        changed_files: args.changedFiles,
      },
    },
    summary: {
      overall_status: hasErrors ? 'fail' : 'pass',
      total_violations: violations.length,
      principles_checked: principles.map(p => p.id),
      violation_counts: violationCounts,
      auto_fixes_applied: fixesApplied.length,
    },
    violations,
    fixes_applied: fixesApplied,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.verbose) {
    console.log('Golden Principles Audit');
    console.log('=======================');
    console.log(`Principles file: ${args.principles}`);
    console.log(`Auto-fix: ${args.autoFix}`);
    console.log(`Diff-only: ${args.diffOnly}`);
    console.log('');
  }

  // Read principles file
  const principlesData = await readPrinciplesFile(args.principles);
  if (!principlesData.exists) {
    console.error(`Error: Principles file not found: ${args.principles}`);
    process.exit(2);
  }

  // Parse principles
  const principles = parsePrinciples(principlesData.content);
  if (args.verbose) {
    console.log(`Loaded ${principles.length} principles: ${principles.map(p => p.id).join(', ')}`);
    console.log('');
  }

  if (principles.length === 0) {
    console.error('Error: No principles found in principles file');
    process.exit(2);
  }

  // Detect violations for each principle
  const allViolations = [];

  for (const principle of principles) {
    if (args.verbose) {
      console.log(`Checking ${principle.id}: ${principle.name}`);
    }

    const files = await findFiles(principle.detection.file_globs, args.changedFiles);
    if (args.verbose) {
      console.log(`  Scanning ${files.length} files...`);
    }

    const violations = await detectViolations(principle, files, args.verbose);
    allViolations.push(...violations);

    if (args.verbose && violations.length > 0) {
      console.log(`  Found ${violations.length} violations`);
    }
  }

  if (args.verbose) {
    console.log('');
    console.log(`Total violations: ${allViolations.length}`);
    console.log('');
  }

  // Apply fixes if requested
  let fixesApplied = [];
  if (args.autoFix) {
    if (args.verbose) {
      console.log('Applying auto-fixes...');
    }
    fixesApplied = await applyFixes(allViolations, principles, args.verbose);
    if (args.verbose) {
      console.log(`Applied ${fixesApplied.length} fixes`);
      console.log('');
    }
  }

  // Build report
  const reportPath = resolve(args.report);
  await mkdir(dirname(reportPath), { recursive: true });

  const report = buildReport({
    principles,
    violations: allViolations,
    fixesApplied,
    reportPath,
    principlesPath: args.principles,
    args,
  });

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  if (args.verbose || !args.json) {
    console.log(`Report written to ${toContractPath(reportPath)}`);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  // Exit with appropriate code
  // 0 = pass (no errors), 1 = fail (errors found), 2 = crash
  if (report.summary.overall_status === 'fail') {
    process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Golden principles audit failed:', error);
  process.exit(2);
});
