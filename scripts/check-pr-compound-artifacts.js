#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = { bodyFile: '' };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--body-file' || arg === '-f') && argv[index + 1]) {
      args.bodyFile = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function readBody(bodyFile) {
  if (bodyFile) {
    return readFileSync(resolve(bodyFile), 'utf8');
  }
  return process.env.PR_BODY || '';
}

function readField(body, label) {
  const regex = new RegExp(`^\\s*-\\s*${escapeRegex(label)}\\s*:\\s*(.+)$`, 'im');
  const match = body.match(regex);
  return match?.[1]?.trim() ?? '';
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLinkLike(value) {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (/^\[[^\]]+\]\([^\)]+\)$/.test(value)) return true;
  if (/^`[^`]+`$/.test(value)) return true;
  if (/^[./A-Za-z0-9_-]+\.(md|txt|json)$/i.test(value)) return true;
  return false;
}

function hasCompoundValue(value) {
  if (isLinkLike(value)) return true;
  if (/^N\/?A\b.+/i.test(value)) return true;
  return false;
}

function extractConsensusDecision(body) {
  const explicitField = body.match(/Consensus lock decision[^\n:]*:\s*(resolved|reopen)\b/i);
  if (explicitField) {
    return explicitField[1].toLowerCase();
  }
  const fallback = body.match(/\bconsensus\s+lock\b[\s\S]{0,80}\b(resolved|reopen)\b/i);
  return fallback ? fallback[1].toLowerCase() : '';
}

function main() {
  const args = parseArgs(process.argv);
  const body = readBody(args.bodyFile);

  if (!body.trim()) {
    console.error('PR body is empty. Provide PR_BODY or --body-file.');
    process.exit(1);
  }

  const planValue = readField(body, 'Plan artifact');
  const reviewValue = readField(body, 'Structured review artifact');
  const compoundValue = readField(body, 'Compound artifact (or `N/A` with reason)');
  const decision = extractConsensusDecision(body);

  const failures = [];
  if (!isLinkLike(planValue)) {
    failures.push('Plan artifact link is missing or invalid.');
  }
  if (!isLinkLike(reviewValue)) {
    failures.push('Structured review artifact link is missing or invalid.');
  }
  if (!hasCompoundValue(compoundValue)) {
    failures.push('Compound artifact link is missing or invalid (or missing explicit N/A reason).');
  }
  if (!(decision === 'resolved' || decision === 'reopen')) {
    failures.push('Consensus lock decision must be explicitly set to resolved or reopen.');
  }
  if (!/ratchet rule/i.test(body)) {
    failures.push('Ratchet rule reference is missing in PR body/checklist.');
  }

  if (failures.length > 0) {
    console.error('Compound PR artifact compliance check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Compound PR artifact compliance: PASS');
  console.log(`- Plan artifact: ${planValue}`);
  console.log(`- Structured review artifact: ${reviewValue}`);
  console.log(`- Compound artifact: ${compoundValue}`);
  console.log(`- Consensus lock decision: ${decision}`);
}

main();
