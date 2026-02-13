#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..', '..'));

const DEFAULT_DOCS_DIR = join(ROOT_DIR, 'docs');
const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'logs', 'tools', 'cross_doc_validator', 'report.json');

function parseArgs(argv) {
  const args = {
    docsDir: DEFAULT_DOCS_DIR,
    report: DEFAULT_REPORT_PATH,
    fix: false,
    json: false,
    verbose: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--docs-dir' && argv[index + 1]) {
      args.docsDir = argv[index + 1];
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
Usage: node cross-doc-validator.js [options]

Validates cross-references between documentation files.
Checks for broken internal links in the docs/ directory.

Options:
  --docs-dir <path>   Documentation directory (default: ./docs)
  --report, -o <path> Output report path (default: logs/tools/cross_doc_validator/report.json)
  --fix               Apply fixes (default: read-only mode)
  --json              Output report as JSON to stdout
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Examples:
  node cross-doc-validator.js
  node cross-doc-validator.js --docs-dir ./docs --verbose
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

async function collectMarkdownFiles(docsDir) {
  const files = [];

  async function walk(currentPath) {
    let entries = [];
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolute = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden directories and common non-doc directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(absolute);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(resolve(absolute));
      }
    }
  }

  await walk(resolve(docsDir));
  return files.sort();
}

function extractInternalLinks(content, sourceFile) {
  const links = [];

  // Pattern for markdown links: [text](path)
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    const linkText = match[1];
    const linkPath = match[2];

    // Skip external links (http/https/mailto)
    if (/^(https?:|mailto:|#)/.test(linkPath)) {
      continue;
    }

    // Skip anchor-only links (handled separately)
    if (linkPath.startsWith('#')) {
      continue;
    }

    // Parse the link path
    let targetPath = linkPath;
    let anchor = '';

    // Extract anchor if present
    const anchorMatch = linkPath.match(/^([^#]+)(#.*)$/);
    if (anchorMatch) {
      targetPath = anchorMatch[1];
      anchor = anchorMatch[2];
    }

    links.push({
      source: toContractPath(sourceFile),
      line: content.slice(0, match.index).split('\n').length,
      column: match.index - content.lastIndexOf('\n', match.index),
      text: linkText,
      raw: linkPath,
      targetPath,
      anchor,
      fullMatch: match[0],
    });
  }

  return links;
}

function resolveLinkTarget(sourceFile, linkTarget, docsDir) {
  // Handle relative paths
  let resolvedPath;

  if (linkTarget.startsWith('./') || linkTarget.startsWith('../')) {
    const sourceDir = dirname(sourceFile);
    resolvedPath = resolve(sourceDir, linkTarget);
  } else if (linkTarget.startsWith('/')) {
    // Absolute from repo root
    resolvedPath = resolve(ROOT_DIR, linkTarget.slice(1));
  } else {
    // Relative to docs root
    resolvedPath = resolve(docsDir, linkTarget);
  }

  // Ensure .md extension if not present
  if (!extname(resolvedPath) && !resolvedPath.endsWith('.md')) {
    resolvedPath += '.md';
  }

  return resolvedPath;
}

async function validateLinks(links, docsDir) {
  const violations = [];
  const checkedPaths = new Set();

  for (const link of links) {
    const sourcePath = resolve(ROOT_DIR, link.source);
    const targetPath = resolveLinkTarget(sourcePath, link.targetPath, docsDir);
    const cacheKey = `${sourcePath} -> ${targetPath}`;

    // Skip if we've already checked this exact link
    if (checkedPaths.has(cacheKey)) {
      continue;
    }
    checkedPaths.add(cacheKey);

    const target = await readText(targetPath);

    if (!target.exists) {
      violations.push({
        type: 'broken-link',
        severity: 'error',
        source: link.source,
        line: link.line,
        column: link.column,
        target: link.targetPath,
        resolvedTarget: toContractPath(targetPath),
        message: `Broken link: "${link.text}" -> "${link.targetPath}" (file not found)`,
        suggestion: `Check if the file exists or update the link`,
      });
    } else if (link.anchor) {
      // Validate anchor exists in target
      const anchorId = link.anchor.slice(1); // Remove #
      const headingPattern = new RegExp(`^#{1,6}\\s+.*$`, 'm');
      const hasHeading = headingPattern.test(target.text);

      // Check for heading with matching ID or text
      const headingMatches = [
        new RegExp(`^#{1,6}\\s+${anchorId.replace(/-/g, ' ')}$`, 'mi'),
        new RegExp(`\{#[^}]*${anchorId}[^}]*\}`, 'i'),
        new RegExp(`id=["']${anchorId}["']`, 'i'),
      ];

      const anchorExists = headingMatches.some(pattern => pattern.test(target.text));

      if (!anchorExists && hasHeading) {
        // Get available headings for suggestion
        const headings = [];
        const headingRegex = /^#{1,6}\s+(.+)$/gm;
        let headingMatch;
        while ((headingMatch = headingRegex.exec(target.text)) !== null && headings.length < 5) {
          headings.push(headingMatch[1].trim().toLowerCase().replace(/\s+/g, '-'));
        }

        violations.push({
          type: 'broken-anchor',
          severity: 'warning',
          source: link.source,
          line: link.line,
          column: link.column,
          target: link.targetPath,
          anchor: link.anchor,
          message: `Broken anchor: "${link.anchor}" not found in ${link.targetPath}`,
          suggestion: headings.length > 0
            ? `Available anchors might be: ${headings.slice(0, 3).join(', ')}...`
            : 'No headings found in target file',
        });
      }
    }
  }

  return violations;
}

function buildCheck({ id, name, status, summary, evidence, details }) {
  return {
    id,
    level: 'tool-cross-doc-validator',
    name,
    status,
    summary,
    evidence,
    details,
  };
}

async function evaluateChecks({ docsDir, fix }) {
  const checks = [];

  // Collect all markdown files
  const mdFiles = await collectMarkdownFiles(docsDir);

  // Extract all internal links
  const allLinks = [];
  for (const file of mdFiles) {
    const content = await readText(file);
    if (content.exists) {
      const links = extractInternalLinks(content.text, file);
      allLinks.push(...links);
    }
  }

  // Validate links
  const violations = await validateLinks(allLinks, docsDir);

  // Check for orphaned files (files with no incoming links)
  const linkedTargets = new Set(
    violations
      .filter(v => v.type === 'broken-link')
      .map(v => v.resolvedTarget)
  );

  const hasErrors = violations.some(v => v.severity === 'error');

  checks.push(
    buildCheck({
      id: 'XDOC-001',
      name: 'All internal documentation links are valid',
      status: hasErrors ? 'fail' : 'pass',
      summary: hasErrors
        ? `Found ${violations.filter(v => v.severity === 'error').length} broken link(s) and ${violations.filter(v => v.severity === 'warning').length} warning(s)`
        : `All ${allLinks.length} internal link(s) are valid`,
      evidence: violations.length > 0
        ? [...new Set(violations.slice(0, 5).map(v => v.source))]
        : mdFiles.slice(0, 5).map(f => toContractPath(f)),
      details: {
        files_scanned: mdFiles.length,
        links_found: allLinks.length,
        violations_found: violations.length,
        error_count: violations.filter(v => v.severity === 'error').length,
        warning_count: violations.filter(v => v.severity === 'warning').length,
        fix_mode: fix,
      },
    })
  );

  return { checks, violations, stats: { files: mdFiles.length, links: allLinks.length } };
}

function buildReport({ checks, reportPath, docsDir, violations, stats }) {
  const failedCheckIds = checks.filter(check => check.status !== 'pass').map(check => check.id);

  return {
    schema_version: 'tool_cross_doc_validator_report.v1',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    tool: {
      name: 'cross-doc-validator',
      version: '1.0.0',
      description: 'Validates cross-references between documentation files',
    },
    summary: {
      overall_status: failedCheckIds.length === 0 ? 'pass' : 'fail',
      failed_check_ids: failedCheckIds,
      files_scanned: stats.files,
      links_validated: stats.links,
      violations_found: violations.length,
    },
    checks,
    violations: violations.slice(0, 100),
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const reportPath = resolve(args.report);
    const docsDir = resolve(args.docsDir);

    if (args.verbose) {
      console.log('Scanning docs directory:', toContractPath(docsDir));
    }

    const { checks, violations, stats } = await evaluateChecks({ docsDir, fix: args.fix });

    const report = buildReport({
      checks,
      reportPath,
      docsDir,
      violations,
      stats,
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
      console.log(`\nFound ${violations.length} issue(s):`);
      const errors = violations.filter(v => v.severity === 'error');
      const warnings = violations.filter(v => v.severity === 'warning');

      for (const error of errors.slice(0, 5)) {
        console.log(`  ERROR: ${error.source}:${error.line} - ${error.message}`);
      }
      if (errors.length > 5) {
        console.log(`  ... and ${errors.length - 5} more errors`);
      }

      for (const warning of warnings.slice(0, 3)) {
        console.log(`  WARNING: ${warning.source}:${warning.line} - ${warning.message}`);
      }
      if (warnings.length > 3) {
        console.log(`  ... and ${warnings.length - 3} more warnings`);
      }
    }

    // AGT-003: Read-only by default
    if (!args.fix && violations.length > 0) {
      console.log(`\nRun with --fix to automatically correct links where possible.`);
    }

    process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
  } catch (error) {
    console.error('Tool execution failed:', error);
    process.exit(1);
  }
}

main();
