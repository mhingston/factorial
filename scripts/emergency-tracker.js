#!/usr/bin/env node
/**
 * Emergency Fix Tracker
 * 
 * Creates a tracking issue for emergency/hotfix PRs.
 * Enforces post-merge review requirements and rollback window.
 * 
 * Usage:
 *   node scripts/emergency-tracker.js --pr-url <url> --pr-title <title> --pr-body <body>
 * 
 * Environment:
 *   GITHUB_TOKEN - Required for issue creation
 *   GITHUB_REPOSITORY - owner/repo format
 */

import { appendFileSync } from 'fs';

const REVERT_WINDOW_HOURS = 2;
const POST_MERGE_REVIEW_HOURS = 24;

/**
 * Create tracking issue via GitHub API
 */
async function createTrackingIssue(repo, prUrl, prTitle, prBody, prNumber) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable required');
  }

  const issueBody = `## Emergency Fix Tracking

**PR:** ${prUrl}
**Title:** ${prTitle}
**Merged at:** ${new Date().toISOString()}

### Description
${prBody ? prBody.slice(0, 500) + (prBody.length > 500 ? '...' : '') : 'No description provided'}

### Revert Window
⏱️ **${REVERT_WINDOW_HOURS} hours from merge** - Monitor for failures

If CI fails, error rates spike, or issues are reported, initiate automatic rollback:
\`\`\`bash
git revert -m 1 HEAD
git push origin HEAD:hotfix-rollback-${prNumber}
\`\`\`

### Post-Merge Review Required
⚠️ **Required within ${POST_MERGE_REVIEW_HOURS} hours**

Reviewers must:
- [ ] Verify fix resolves the stated issue
- [ ] Check no regressions introduced
- [ ] Confirm rollback procedure tested
- [ ] Sign off on emergency classification

### Checklist
- [ ] Issue created (this ticket)
- [ ] Rollback PR prepared
- [ ] Monitoring dashboards checked
- [ ] On-call notified

### Automated Actions
- Created: ${new Date().toISOString()}
- Auto-close: ${new Date(Date.now() + POST_MERGE_REVIEW_HOURS * 60 * 60 * 1000).toISOString()}

/cc @on-call
`;

  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `🚨 Emergency Fix Tracking: ${prTitle.slice(0, 80)}`,
      body: issueBody,
      labels: ['emergency-fix', 'tracking', 'post-merge-review'],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${error}`);
  }

  const issue = await response.json();
  return issue;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      options[key] = value;
      if (value !== 'true') i++;
    }
  }

  return options;
}

/**
 * Extract PR number from URL
 */
function extractPRNumber(url) {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs();
  
  const repo = process.env.GITHUB_REPOSITORY;
  const prUrl = args['pr-url'] || process.env.PR_URL;
  const prTitle = args['pr-title'] || process.env.PR_TITLE || 'Emergency Fix';
  const prBody = args['pr-body'] || process.env.PR_BODY || '';

  if (!repo) {
    console.error('Error: GITHUB_REPOSITORY environment variable required');
    process.exit(1);
  }

  if (!prUrl) {
    console.error('Error: --pr-url or PR_URL environment variable required');
    process.exit(1);
  }

  console.log('Emergency Fix Tracker');
  console.log('====================');
  console.log(`Repository: ${repo}`);
  console.log(`PR URL: ${prUrl}`);
  console.log(`PR Title: ${prTitle}`);
  console.log('');

  try {
    const prNumber = extractPRNumber(prUrl);
    console.log('Creating tracking issue...');
    
    const issue = await createTrackingIssue(repo, prUrl, prTitle, prBody, prNumber);
    
    console.log('');
    console.log('✓ Tracking issue created successfully');
    console.log(`Issue URL: ${issue.html_url}`);
    console.log(`Issue Number: #${issue.number}`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Add issue URL to PR body');
    console.log(`2. Monitor for ${REVERT_WINDOW_HOURS} hours post-merge`);
    console.log(`3. Complete post-merge review within ${POST_MERGE_REVIEW_HOURS} hours`);

    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `issue_url=${issue.html_url}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `issue_number=${issue.number}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `tracking_created=true\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('✗ Failed to create tracking issue');
    console.error(error.message);
    
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, 'tracking_created=false\n');
      appendFileSync(process.env.GITHUB_OUTPUT, `error=${error.message}\n`);
    }
    
    process.exit(1);
  }
}

main();
