#!/usr/bin/env node
/**
 * CI Tier Classifier
 * 
 * Determines the appropriate CI tier (fast-track, standard, emergency) based on:
 * - PR diff size (<50 lines for fast-track)
 * - Changed file paths (security-critical files prevent fast-track)
 * - plan.md metadata (ci_tier field)
 * - PR labels (tier:fast, tier:emergency)
 * - Branch name patterns (hotfix/*, emergency/*)
 * 
 * Outputs JSON with tier decision and reasoning for GitHub Actions consumption.
 */

import { execSync } from 'child_process';
import { appendFileSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Security-critical path patterns that always force standard track
const SECURITY_CRITICAL_PATTERNS = [
  /^\.github\/workflows\//,
  /^\.github\/scripts\//,
  /\/auth\//,
  /\/crypto\//,
  /\/secrets?\//,
  /\/security\//,
  /auth\./,
  /crypto\./,
  /secret\./,
  /password\./,
  /credential\./,
  /key\.js$/,
  /key\.ts$/,
  /token\./,
  /oauth\./,
  /jwt\./,
  /^scripts\/ci-/,  // CI scripts themselves
  /^scripts\/release-/,  // Release scripts
];

// Fast-track eligible path patterns (docs only changes are eligible)
const FAST_TRACK_ELIGIBLE_PATTERNS = [
  /^docs\//,
  /^\.md$/,
  /\.md$/,
  /^README/,
  /^CHANGELOG/,
  /^LICENSE/,
];

const TIER = {
  FAST: 'fast',
  STANDARD: 'standard',
  EMERGENCY: 'emergency',
};

/**
 * Check if a file path matches any security-critical pattern
 */
function isSecurityCritical(filePath) {
  return SECURITY_CRITICAL_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if all changed files are in fast-track eligible paths
 */
function areAllFilesFastTrackEligible(files) {
  return files.every(file => 
    FAST_TRACK_ELIGIBLE_PATTERNS.some(pattern => pattern.test(file))
  );
}

/**
 * Get list of changed files from git diff
 */
function getChangedFiles(baseRef, headRef) {
  try {
    const diffCommand = baseRef && headRef
      ? `git diff --name-only ${baseRef}...${headRef}`
      : 'git diff --name-only HEAD~1 HEAD';
    
    const output = execSync(diffCommand, { encoding: 'utf8', cwd: process.cwd() });
    return output.trim().split('\n').filter(f => f.length > 0);
  } catch (error) {
    console.error('Failed to get changed files:', error.message);
    return [];
  }
}

/**
 * Get diff stat (lines changed) from git diff
 */
function getDiffStats(baseRef, headRef) {
  try {
    const diffCommand = baseRef && headRef
      ? `git diff --shortstat ${baseRef}...${headRef}`
      : 'git diff --shortstat HEAD~1 HEAD';
    
    const output = execSync(diffCommand, { encoding: 'utf8', cwd: process.cwd() });
    
    // Parse output like: "10 files changed, 50 insertions(+), 20 deletions(-)"
    const match = output.match(/(\d+) insertion.*?\(.*?\)|(\d+) deletion.*?\(.*?\)/g);
    if (!match) return { insertions: 0, deletions: 0, total: 0 };
    
    let insertions = 0;
    let deletions = 0;
    
    for (const part of match) {
      const insertionMatch = part.match(/(\d+) insertion/);
      const deletionMatch = part.match(/(\d+) deletion/);
      if (insertionMatch) insertions += parseInt(insertionMatch[1], 10);
      if (deletionMatch) deletions += parseInt(deletionMatch[1], 10);
    }
    
    return { insertions, deletions, total: insertions + deletions };
  } catch (error) {
    console.error('Failed to get diff stats:', error.message);
    return { insertions: 0, deletions: 0, total: 0 };
  }
}

/**
 * Parse plan.md for ci_tier metadata
 */
function parsePlanMetadata(planPath) {
  if (!existsSync(planPath)) {
    return { ciTier: null, riskLevel: null };
  }
  
  try {
    const content = readFileSync(planPath, 'utf8');
    
    // Look for ci_tier: fast|standard|emergency
    const tierMatch = content.match(/ci_tier:\s*(fast|standard|emergency)/i);
    const riskMatch = content.match(/risk level:\s*`?(low|medium|high)`?/i);
    
    return {
      ciTier: tierMatch ? tierMatch[1].toLowerCase() : null,
      riskLevel: riskMatch ? riskMatch[1].toLowerCase() : null,
    };
  } catch (error) {
    console.error('Failed to parse plan.md:', error.message);
    return { ciTier: null, riskLevel: null };
  }
}

/**
 * Parse PR labels from environment or input
 */
function parsePRLabels(labelsInput) {
  if (!labelsInput) return [];
  
  try {
    // Handle JSON array from GitHub Actions
    const parsed = JSON.parse(labelsInput);
    if (Array.isArray(parsed)) {
      return parsed.map(l => l.name || l).map(l => l.toLowerCase());
    }
    return labelsInput.split(',').map(l => l.trim().toLowerCase());
  } catch {
    return labelsInput.split(',').map(l => l.trim().toLowerCase());
  }
}

/**
 * Determine tier based on all inputs
 */
function determineTier(inputs) {
  const {
    changedFiles,
    diffStats,
    planMetadata,
    prLabels,
    branchName,
    isEmergencyBranch,
  } = inputs;

  const reasons = [];
  
  // Emergency tier: highest priority
  if (isEmergencyBranch || prLabels.includes('tier:emergency') || prLabels.includes('emergency-fix')) {
    reasons.push('Emergency branch or label detected');
    if (planMetadata.ciTier === 'emergency') {
      reasons.push('Plan.md explicitly declares emergency tier');
    }
    return { tier: TIER.EMERGENCY, reasons };
  }
  
  // Check for security-critical files (blocks fast-track)
  const securityFiles = changedFiles.filter(isSecurityCritical);
  if (securityFiles.length > 0) {
    reasons.push(`Security-critical files modified: ${securityFiles.join(', ')}`);
    return { tier: TIER.STANDARD, reasons };
  }
  
  // Fast-track eligibility checks
  const isUnderLineLimit = diffStats.total < 50;
  const hasFastTrackLabel = prLabels.includes('tier:fast') || prLabels.includes('fast-track');
  const planRequestsFast = planMetadata.ciTier === 'fast';
  const planRiskIsLow = planMetadata.riskLevel === 'low';
  
  // If plan explicitly requests fast-track, verify eligibility
  if (planRequestsFast) {
    if (!isUnderLineLimit) {
      reasons.push(`Plan requests fast-track but diff is ${diffStats.total} lines (limit: 50)`);
      return { tier: TIER.STANDARD, reasons };
    }
    if (securityFiles.length > 0) {
      reasons.push('Plan requests fast-track but security files modified');
      return { tier: TIER.STANDARD, reasons };
    }
    reasons.push('Plan.md explicitly declares fast-track tier');
    return { tier: TIER.FAST, reasons };
  }
  
  // If label requests fast-track, verify eligibility
  if (hasFastTrackLabel) {
    if (!isUnderLineLimit) {
      reasons.push(`Fast-track label present but diff is ${diffStats.total} lines (limit: 50)`);
      return { tier: TIER.STANDARD, reasons };
    }
    reasons.push('PR label requests fast-track tier');
    return { tier: TIER.FAST, reasons };
  }
  
  // Automated fast-track detection for docs-only changes
  if (isUnderLineLimit && changedFiles.length > 0 && areAllFilesFastTrackEligible(changedFiles)) {
    reasons.push('Automated: docs-only changes under line limit');
    return { tier: TIER.FAST, reasons };
  }
  
  // Default to standard
  reasons.push(`Standard track: ${diffStats.total} lines changed, no fast-track signals`);
  return { tier: TIER.STANDARD, reasons };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const baseRef = process.env.GITHUB_BASE_REF || args[0];
  const headRef = process.env.GITHUB_HEAD_REF || args[1];
  const branchName = process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || '';
  const labelsInput = process.env.PR_LABELS || process.env.GITHUB_PR_LABELS || '';
  const planPath = process.env.PLAN_PATH || 'docs/plans/plan.md';
  
  // Detect emergency branch pattern
  const isEmergencyBranch = /^hotfix\//.test(branchName) || /^emergency\//.test(branchName);
  
  // Gather inputs
  const changedFiles = getChangedFiles(baseRef, headRef);
  const diffStats = getDiffStats(baseRef, headRef);
  const planMetadata = parsePlanMetadata(planPath);
  const prLabels = parsePRLabels(labelsInput);
  
  // Determine tier
  const result = determineTier({
    changedFiles,
    diffStats,
    planMetadata,
    prLabels,
    branchName,
    isEmergencyBranch,
  });
  
  // Output result as JSON for GitHub Actions
  const output = {
    tier: result.tier,
    reasons: result.reasons,
    metadata: {
      changedFiles,
      diffStats,
      planMetadata,
      prLabels,
      isEmergencyBranch,
    },
    timestamp: new Date().toISOString(),
  };
  
  // Output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `tier=${result.tier}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `json=${JSON.stringify(JSON.stringify(output))}\n`);
  }
  
  console.log(JSON.stringify(output, null, 2));
  
  // Exit with appropriate code
  process.exit(0);
}

main();
