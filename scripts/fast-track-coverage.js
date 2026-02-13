#!/usr/bin/env node
/**
 * Fast-Track Coverage Checker
 * 
 * Verifies that changed lines in a PR have 100% test coverage.
 * Uses git diff to identify changed lines and compares against coverage report.
 * 
 * Exit codes:
 * 0 - All changed lines have coverage
 * 1 - Some changed lines lack coverage
 * 2 - Error (missing coverage report, etc.)
 */

import { execSync } from 'child_process';
import { appendFileSync, existsSync, readFileSync } from 'fs';

/**
 * Get line-by-line diff information for each file
 */
function getLineDiffs(baseRef, headRef) {
  try {
    const diffCommand = baseRef && headRef
      ? `git diff -U0 ${baseRef}...${headRef}`
      : 'git diff -U0 HEAD~1 HEAD';
    
    const output = execSync(diffCommand, { encoding: 'utf8', cwd: process.cwd() });
    
    const fileChanges = new Map();
    let currentFile = null;
    let currentLines = [];
    
    for (const line of output.split('\n')) {
      // Match diff header: diff --git a/path b/path
      const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
      if (fileMatch) {
        if (currentFile && currentLines.length > 0) {
          fileChanges.set(currentFile, currentLines);
        }
        currentFile = fileMatch[2]; // Use the "b" (new) path
        currentLines = [];
        continue;
      }
      
      // Match hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch) {
        const newStart = parseInt(hunkMatch[3], 10);
        const newCount = parseInt(hunkMatch[4] || '1', 10);
        
        // If newCount is 0, lines were deleted (not relevant for coverage)
        if (newCount > 0) {
          for (let i = 0; i < newCount; i++) {
            currentLines.push(newStart + i);
          }
        }
      }
    }
    
    // Don't forget the last file
    if (currentFile && currentLines.length > 0) {
      fileChanges.set(currentFile, currentLines);
    }
    
    return fileChanges;
  } catch (error) {
    console.error('Failed to get line diffs:', error.message);
    return new Map();
  }
}

/**
 * Parse coverage report to get uncovered lines per file
 */
function parseCoverageReport(coveragePath) {
  if (!existsSync(coveragePath)) {
    console.error(`Coverage report not found: ${coveragePath}`);
    return null;
  }
  
  try {
    const content = readFileSync(coveragePath, 'utf8');
    const coverage = JSON.parse(content);
    
    const uncoveredLines = new Map();
    
    // Handle different coverage formats
    if (coverage.coverage) {
      // Istanbul/nyc format
      for (const [file, data] of Object.entries(coverage.coverage)) {
        if (data.uncoveredLines) {
          uncoveredLines.set(file, new Set(data.uncoveredLines));
        } else if (data.statementMap && data.s) {
          const uncovered = [];
          for (const [stmtId, count] of Object.entries(data.s)) {
            if (count === 0) {
              const stmt = data.statementMap[stmtId];
              for (let line = stmt.start.line; line <= stmt.end.line; line++) {
                uncovered.push(line);
              }
            }
          }
          uncoveredLines.set(file, new Set(uncovered));
        }
      }
    } else if (coverage.result) {
      // vitest/v8 format
      for (const [file, data] of Object.entries(coverage.result)) {
        if (data.uncoveredLines) {
          uncoveredLines.set(file, new Set(data.uncoveredLines));
        } else if (data.functions || data.statements || data.lines) {
          const uncovered = [];
          // Extract uncovered lines from line coverage data
          if (data.lines && data.lines.details) {
            for (const detail of data.lines.details) {
              if (detail.hit === 0) {
                uncovered.push(detail.line);
              }
            }
          }
          uncoveredLines.set(file, new Set(uncovered));
        }
      }
    }
    
    return uncoveredLines;
  } catch (error) {
    console.error('Failed to parse coverage report:', error.message);
    return null;
  }
}

/**
 * Check if changed lines are covered
 */
function checkCoverage(lineDiffs, uncoveredLines) {
  const uncoveredChangedLines = [];
  
  for (const [file, changedLines] of lineDiffs) {
    // Normalize file path for comparison
    const normalizedFile = file.replace(/^src\//, '').replace(/\.ts$/, '.js');
    
    // Find matching coverage entry
    let fileUncovered = null;
    for (const [covFile, lines] of uncoveredLines) {
      if (covFile.includes(file) || covFile.includes(normalizedFile) || file.includes(covFile)) {
        fileUncovered = lines;
        break;
      }
    }
    
    if (fileUncovered) {
      for (const line of changedLines) {
        if (fileUncovered.has(line)) {
          uncoveredChangedLines.push(`${file}:${line}`);
        }
      }
    }
  }
  
  return uncoveredChangedLines;
}

/**
 * Filter out non-source files from line diffs
 */
function filterSourceFiles(lineDiffs) {
  const sourceFiles = new Map();
  const sourceExtensions = ['.ts', '.js', '.tsx', '.jsx'];
  const excludePatterns = [
    /^test/,
    /\.test\./,
    /\.spec\./,
    /__tests__/,
    /node_modules/,
    /^docs/,
    /^scripts/,
    /^\.github/,
  ];
  
  for (const [file, lines] of lineDiffs) {
    // Check if it's a source file
    const hasSourceExt = sourceExtensions.some(ext => file.endsWith(ext));
    const isExcluded = excludePatterns.some(pattern => pattern.test(file));
    
    if (hasSourceExt && !isExcluded) {
      sourceFiles.set(file, lines);
    }
  }
  
  return sourceFiles;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const baseRef = process.env.GITHUB_BASE_REF || args[0];
  const headRef = process.env.GITHUB_HEAD_REF || args[1];
  const coveragePath = process.env.COVERAGE_PATH || './coverage/coverage-final.json';
  
  console.log('Fast-Track Coverage Checker');
  console.log('==========================');
  console.log(`Base ref: ${baseRef || 'HEAD~1'}`);
  console.log(`Head ref: ${headRef || 'HEAD'}`);
  console.log(`Coverage report: ${coveragePath}`);
  console.log('');
  
  // Get changed lines
  const lineDiffs = getLineDiffs(baseRef, headRef);
  console.log(`Found ${lineDiffs.size} changed files`);
  
  if (lineDiffs.size === 0) {
    console.log('✓ No files changed - coverage check passes');
    process.exit(0);
  }
  
  // Filter to source files only
  const sourceFileDiffs = filterSourceFiles(lineDiffs);
  console.log(`${sourceFileDiffs.size} source files with changes`);
  
  if (sourceFileDiffs.size === 0) {
    console.log('✓ No source files changed - coverage check passes');
    process.exit(0);
  }
  
  // Parse coverage report
  const uncoveredLines = parseCoverageReport(coveragePath);
  if (!uncoveredLines) {
    console.error('✗ Failed to parse coverage report');
    process.exit(2);
  }
  
  console.log(`Parsed coverage for ${uncoveredLines.size} files`);
  
  // Check coverage
  const uncoveredChangedLines = checkCoverage(sourceFileDiffs, uncoveredLines);
  
  // Output results
  console.log('');
  console.log('Results');
  console.log('=======');
  
  let totalChangedLines = 0;
  for (const lines of sourceFileDiffs.values()) {
    totalChangedLines += lines.length;
  }
  
  console.log(`Total changed source lines: ${totalChangedLines}`);
  console.log(`Uncovered changed lines: ${uncoveredChangedLines.length}`);
  
  if (uncoveredChangedLines.length === 0) {
    console.log('');
    console.log('✓ All changed lines have coverage (100%)');
    console.log('Fast-track eligibility: PASSED');
    
    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, 'coverage_passed=true\n');
      appendFileSync(process.env.GITHUB_OUTPUT, `coverage_percent=100\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `uncovered_lines=0\n`);
    }
    
    process.exit(0);
  } else {
    console.log('');
    console.log('✗ Some changed lines lack coverage:');
    for (const line of uncoveredChangedLines.slice(0, 20)) {
      console.log(`  - ${line}`);
    }
    if (uncoveredChangedLines.length > 20) {
      console.log(`  ... and ${uncoveredChangedLines.length - 20} more`);
    }
    
    const coveragePercent = ((totalChangedLines - uncoveredChangedLines.length) / totalChangedLines * 100).toFixed(2);
    console.log('');
    console.log(`Coverage on changed lines: ${coveragePercent}%`);
    console.log('Fast-track eligibility: FAILED');
    
    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, 'coverage_passed=false\n');
      appendFileSync(process.env.GITHUB_OUTPUT, `coverage_percent=${coveragePercent}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `uncovered_lines=${uncoveredChangedLines.length}\n`);
    }
    
    process.exit(1);
  }
}

main();
