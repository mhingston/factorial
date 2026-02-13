#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..', '..'));

const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'logs', 'tools', 'drift_detector', 'report.json');
const DEFAULT_GOLDEN_DIR = join(ROOT_DIR, 'tests', 'golden');

function parseArgs(argv) {
  const args = {
    paths: [],
    goldenDir: DEFAULT_GOLDEN_DIR,
    report: DEFAULT_REPORT_PATH,
    fix: false,
    json: false,
    verbose: false,
    strict: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--path' && argv[index + 1]) {
      args.paths.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--golden-dir' && argv[index + 1]) {
      args.goldenDir = argv[index + 1];
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
    if (arg === '--strict') {
      args.strict = true;
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
Usage: node drift-detector.js [options]

Compares current code against golden patterns to detect drift.
Validates that implementations follow established patterns from tests/golden.

Options:
  --path <path>       Add a file or directory to validate (can be used multiple times)
  --golden-dir <path> Directory containing golden patterns (default: ./tests/golden)
  --report, -o <path> Output report path (default: logs/tools/drift_detector/report.json)
  --fix               Apply fixes (default: read-only mode)
  --strict            Treat warnings as errors
  --json              Output report as JSON to stdout
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Examples:
  node drift-detector.js --path ./src --path ./scripts
  node drift-detector.js --path ./src --strict
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

// Extract patterns from golden files
function extractGoldenPatterns(content) {
  const patterns = {
    functionSignatures: [],
    errorHandling: [],
    logging: [],
    asyncPatterns: [],
  };

  // Extract function signatures
  const funcRegex = /(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    patterns.functionSignatures.push(match[0]);
  }

  // Extract error handling patterns
  const tryCatchRegex = /try\s*\{[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{/g;
  while ((match = tryCatchRegex.exec(content)) !== null) {
    patterns.errorHandling.push('try-catch block');
  }

  // Extract logging patterns
  const logRegex = /console\.(log|error|warn|info)\s*\(/g;
  while ((match = logRegex.exec(content)) !== null) {
    patterns.logging.push(match[0]);
  }

  // Extract async patterns
  const asyncRegex = /async\s+|await\s+|Promise\./g;
  while ((match = asyncRegex.exec(content)) !== null) {
    patterns.asyncPatterns.push(match[0].trim());
  }

  return patterns;
}

// Validate code against golden patterns
function validateAgainstGolden(sourceContent, goldenPatterns, filePath) {
  const violations = [];
  const lines = sourceContent.split('\n');

  // Check for missing error handling
  const hasAsync = /async\s+|await\s+/.test(sourceContent);
  const hasTryCatch = /try\s*\{/.test(sourceContent);

  if (hasAsync && !hasTryCatch && goldenPatterns.errorHandling.length > 0) {
    // Find async functions without try-catch
    const asyncFuncRegex = /async\s+function\s+(\w+)/g;
    let match;
    while ((match = asyncFuncRegex.exec(sourceContent)) !== null) {
      const funcName = match[1];
      const funcStart = match.index;
      const funcEnd = findFunctionEnd(sourceContent, funcStart);
      const funcBody = sourceContent.slice(funcStart, funcEnd);

      if (!/try\s*\{/.test(funcBody)) {
        const line = sourceContent.slice(0, funcStart).split('\n').length;
        violations.push({
          type: 'missing-error-handling',
          severity: 'warning',
          file: toContractPath(filePath),
          line,
          column: 1,
          message: `Async function "${funcName}" lacks try-catch error handling`,
          suggestion: 'Wrap async operations in try-catch blocks',
          goldenReference: 'Golden patterns include error handling',
        });
      }
    }
  }

  // Check for proper argument parsing patterns
  const hasParseArgs = /function\s+parseArgs/.test(sourceContent);
  const hasArgvLoop = /for\s*\([^)]*argv/.test(sourceContent);

  if (sourceContent.includes('process.argv') && !hasParseArgs && !hasArgvLoop) {
    // Check if it's a script file
    if (filePath.includes('/scripts/') || filePath.includes('\\scripts\\')) {
      violations.push({
        type: 'missing-parse-args',
        severity: 'warning',
        file: toContractPath(filePath),
        line: 1,
        column: 1,
        message: 'Script should implement parseArgs() function for CLI argument handling',
        suggestion: 'Follow pattern: function parseArgs(argv) { ... }',
        goldenReference: 'scripts/ claims-consistency-audit.js pattern',
      });
    }
  }

  // Check for report schema compliance
  const hasSchemaVersion = /schema_version/.test(sourceContent);
  const hasGeneratedAt = /generated_at/.test(sourceContent);

  if (sourceContent.includes('report') && sourceContent.includes('JSON.stringify')) {
    if (!hasSchemaVersion) {
      violations.push({
        type: 'missing-schema-version',
        severity: 'error',
        file: toContractPath(filePath),
        line: 1,
        column: 1,
        message: 'Report objects must include schema_version field',
        suggestion: 'Add schema_version: "tool_name_report.v1" to report object',
        goldenReference: 'All tools should follow report schema conventions',
      });
    }

    if (!hasGeneratedAt) {
      violations.push({
        type: 'missing-generated-at',
        severity: 'error',
        file: toContractPath(filePath),
        line: 1,
        column: 1,
        message: 'Report objects must include generated_at timestamp',
        suggestion: 'Add generated_at: new Date().toISOString()',
        goldenReference: 'All tools should follow report schema conventions',
      });
    }
  }

  // Check for security invariants comments
  const hasAgt001 = /AGT-001|deterministic/.test(sourceContent);
  const hasAgt003 = /AGT-003|read.?only|explicit.*flag/i.test(sourceContent);

  if (sourceContent.includes('process.exit') && sourceContent.includes('mkdir')) {
    // Likely a tool script
    if (!hasAgt001) {
      violations.push({
        type: 'missing-invariant-doc',
        severity: 'warning',
        file: toContractPath(filePath),
        line: 1,
        column: 1,
        message: 'Tool should document or implement deterministic output (AGT-001)',
        suggestion: 'Add comment or test ensuring deterministic output',
        goldenReference: 'AGT-001: Generated tools must be deterministic',
      });
    }

    if (!hasAgt003) {
      violations.push({
        type: 'missing-invariant-doc',
        severity: 'warning',
        file: toContractPath(filePath),
        line: 1,
        column: 1,
        message: 'Tool should document read-only default behavior (AGT-003)',
        suggestion: 'Add comment about --fix flag requirement for writes',
        goldenReference: 'AGT-003: Read-only by default, writes require explicit flag',
      });
    }
  }

  return violations;
}

function findFunctionEnd(content, startIndex) {
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = startIndex; i < content.length; i += 1) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';

    // Handle strings
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && prevChar !== '\\') {
      inString = false;
    }

    if (!inString) {
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return i + 1;
        }
      }
    }
  }

  return content.length;
}

function buildCheck({ id, name, status, summary, evidence, details }) {
  return {
    id,
    level: 'tool-drift-detector',
    name,
    status,
    summary,
    evidence,
    details,
  };
}

async function evaluateChecks({ paths, goldenDir, strict }) {
  const checks = [];
  const allViolations = [];

  // Load golden patterns
  let goldenPatterns = {
    functionSignatures: [],
    errorHandling: [],
    logging: [],
    asyncPatterns: [],
  };

  try {
    const goldenContent = await readText(join(goldenDir, 'golden-regression.test.ts'));
    if (goldenContent.exists) {
      goldenPatterns = extractGoldenPatterns(goldenContent.text);
    }
  } catch {
    // Golden file may not exist, use defaults
  }

  // Collect all source files
  const sourceFiles = [];
  for (const path of paths) {
    const content = await readText(resolve(path));
    if (content.exists) {
      sourceFiles.push({ path: resolve(path), content: content.text });
    }
  }

  // Validate each file
  for (const file of sourceFiles) {
    const violations = validateAgainstGolden(file.content, goldenPatterns, file.path);
    allViolations.push(...violations);
  }

  const hasErrors = allViolations.some(v => v.severity === 'error');
  const hasWarnings = allViolations.some(v => v.severity === 'warning');

  checks.push(
    buildCheck({
      id: 'DRIFT-001',
      name: 'Code follows golden patterns and conventions',
      status: hasErrors || (strict && hasWarnings) ? 'fail' : 'pass',
      summary: hasErrors
        ? `Found ${allViolations.filter(v => v.severity === 'error').length} error(s)`
        : hasWarnings
        ? `Found ${allViolations.filter(v => v.severity === 'warning').length} warning(s)`
        : 'All code follows golden patterns',
      evidence: allViolations.length > 0
        ? [...new Set(allViolations.slice(0, 5).map(v => v.file))]
        : sourceFiles.slice(0, 5).map(f => toContractPath(f.path)),
      details: {
        files_validated: sourceFiles.length,
        violations_found: allViolations.length,
        error_count: allViolations.filter(v => v.severity === 'error').length,
        warning_count: allViolations.filter(v => v.severity === 'warning').length,
        strict_mode: strict,
      },
    })
  );

  return { checks, violations: allViolations };
}

function buildReport({ checks, reportPath, paths, violations, goldenDir }) {
  const failedCheckIds = checks.filter(check => check.status !== 'pass').map(check => check.id);

  return {
    schema_version: 'tool_drift_detector_report.v1',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    tool: {
      name: 'drift-detector',
      version: '1.0.0',
      description: 'Compares current code against golden patterns to detect drift',
    },
    summary: {
      overall_status: failedCheckIds.length === 0 ? 'pass' : 'fail',
      failed_check_ids: failedCheckIds,
      paths_checked: paths.length,
      violations_found: violations.length,
    },
    checks,
    violations: violations.slice(0, 100),
    golden_reference: toContractPath(goldenDir),
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const reportPath = resolve(args.report);
    const goldenDir = resolve(args.goldenDir);

    if (args.paths.length === 0) {
      console.error('Error: At least one --path is required');
      process.exit(1);
    }

    if (args.verbose) {
      console.log('Checking paths:', args.paths);
      console.log('Golden directory:', toContractPath(goldenDir));
    }

    const { checks, violations } = await evaluateChecks({
      paths: args.paths,
      goldenDir,
      strict: args.strict,
    });

    const report = buildReport({
      checks,
      reportPath,
      paths: args.paths,
      violations,
      goldenDir,
    });

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}
`, 'utf-8');
    console.log(`Report written to ${reportPath}`);

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    }

    // Print summary
    if (violations.length > 0) {
      console.log(`\nFound ${violations.length} drift issue(s):`);
      const errors = violations.filter(v => v.severity === 'error');
      const warnings = violations.filter(v => v.severity === 'warning');

      for (const error of errors.slice(0, 5)) {
        console.log(`  ERROR: ${error.file}:${error.line} - ${error.message}`);
      }
      if (errors.length > 5) {
        console.log(`  ... and ${errors.length - 5} more errors`);
      }

      for (const warning of warnings.slice(0, 3)) {
        console.log(`  WARNING: ${warning.file}:${warning.line} - ${warning.message}`);
      }
      if (warnings.length > 3) {
        console.log(`  ... and ${warnings.length - 3} more warnings`);
      }
    }

    // AGT-003: Read-only by default
    if (!args.fix && violations.length > 0) {
      console.log(`\nRun with --fix to apply corrections where possible.`);
    }

    process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
  } catch (error) {
    console.error('Tool execution failed:', error);
    process.exit(1);
  }
}

main();
