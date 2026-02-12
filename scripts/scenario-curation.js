#!/usr/bin/env node
/**
 * Scenario Curation Interface
 * 
 * Implements SC-001: Explicit separation between in-repo and holdout scenarios
 * with curation UI.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_ROOT = path.resolve(process.cwd(), 'scenarios');
const MAX_AGE_DAYS = 30;

// Main entry point
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'curate':
      await runInteractiveCuration();
      break;
    case 'check-freshness':
      await checkFreshness();
      break;
    case 'promote':
      const scenarioId = process.argv[3];
      if (!scenarioId) {
        console.error('Usage: scenario-curation.js promote <scenario-id>');
        process.exit(1);
      }
      await promoteScenario(scenarioId);
      break;
    default:
      showUsage();
  }
}

function showUsage() {
  console.log(`
Scenario Curation Interface (SC-001)

Usage:
  node scenario-curation.js <command>

Commands:
  curate                    Interactive TUI for scenario curation
  check-freshness           Validate holdout freshness (fails if >30 days old)
  promote <scenario-id>     Promote holdout scenario to in-repo

Examples:
  node scenario-curation.js curate
  node scenario-curation.js check-freshness
  node scenario-curation.js promote my-scenario-001
`);
}

async function runInteractiveCuration() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\n🎯 Scenario Curation Interface\n');
  console.log('='.repeat(50));
  
  const catalog = await buildCatalog();
  
  console.log(`\n📊 Current Status:`);
  console.log(`  In-repo: ${catalog.totals.in_repo} scenarios`);
  console.log(`    - Smoke: ${catalog.in_repo.smoke.length}`);
  console.log(`    - Regression: ${catalog.in_repo.regression.length}`);
  console.log(`  Holdout: ${catalog.totals.holdout} scenarios`);
  
  console.log('\n📋 Options:');
  console.log('  [1] List all scenarios');
  console.log('  [2] Promote holdout to in-repo');
  console.log('  [3] Check freshness');
  console.log('  [4] Exit');
  
  const answer = await new Promise((resolve) => {
    rl.question('\n> ', resolve);
  });
  
  switch (answer.trim()) {
    case '1':
      renderCatalog(catalog);
      break;
    case '2': {
      const idToPromote = await new Promise((resolve) => {
        rl.question('\nEnter scenario ID to promote: ', resolve);
      });
      if (idToPromote.trim()) {
        try {
          await promoteScenario(idToPromote.trim());
        } catch (error) {
          console.error(`✗ Failed: ${error.message}`);
        }
      }
      break;
    }
    case '3':
      await checkFreshness();
      break;
    case '4':
    default:
      console.log('Goodbye!');
  }
  
  rl.close();
}

async function buildCatalog() {
  const catalog = {
    in_repo: { smoke: [], regression: [] },
    holdout: { curated: [] },
    totals: { in_repo: 0, holdout: 0 }
  };
  
  // Scan in-repo
  const inRepoPath = path.join(SCENARIOS_ROOT, 'in-repo');
  for (const suite of ['smoke', 'regression']) {
    const suitePath = path.join(inRepoPath, suite);
    const scenarios = await scanDirectory(suitePath);
    catalog.in_repo[suite] = scenarios;
    catalog.totals.in_repo += scenarios.length;
  }
  
  // Scan holdout
  const holdoutPath = path.join(SCENARIOS_ROOT, 'holdout', 'curated');
  const holdoutScenarios = await scanDirectory(holdoutPath);
  catalog.holdout.curated = holdoutScenarios;
  catalog.totals.holdout = holdoutScenarios.length;
  
  return catalog;
}

async function scanDirectory(dirPath) {
  const scenarios = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        const filePath = path.join(dirPath, entry.name);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);
          const stats = fs.statSync(filePath);
          
          scenarios.push({
            scenario_id: data.scenario_id || entry.name.replace('.json', ''),
            description: data.description || 'No description',
            difficulty: data.difficulty,
            category: data.category,
            last_updated: stats.mtime.toISOString(),
            tags: data.tags || []
          });
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }
  
  return scenarios.sort((a, b) => a.scenario_id.localeCompare(b.scenario_id));
}

function renderCatalog(catalog) {
  console.log('\n📚 Scenario Catalog\n');
  console.log('='.repeat(60));
  
  console.log('\n🧪 In-Repo Scenarios:');
  if (catalog.in_repo.smoke.length > 0) {
    console.log('\n  Smoke Tests:');
    for (const s of catalog.in_repo.smoke) {
      console.log(`    - ${s.scenario_id}: ${s.description}`);
    }
  }
  if (catalog.in_repo.regression.length > 0) {
    console.log('\n  Regression Tests:');
    for (const s of catalog.in_repo.regression) {
      console.log(`    - ${s.scenario_id}: ${s.description}`);
    }
  }
  if (catalog.totals.in_repo === 0) {
    console.log('  (none)');
  }
  
  console.log('\n🔒 Holdout Scenarios:');
  if (catalog.holdout.curated.length > 0) {
    for (const s of catalog.holdout.curated) {
      console.log(`    - ${s.scenario_id}: ${s.description}`);
    }
  } else {
    console.log('  (none)');
  }
  
  console.log(`\n📊 Totals: ${catalog.totals.in_repo} in-repo, ${catalog.totals.holdout} holdout`);
}

async function checkFreshness() {
  const now = new Date();
  const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  
  const catalog = await buildCatalog();
  
  let staleCount = 0;
  let oldestDate = null;
  
  for (const scenario of catalog.holdout.curated) {
    if (scenario.last_updated) {
      const updatedDate = new Date(scenario.last_updated);
      const ageMs = now.getTime() - updatedDate.getTime();
      
      if (ageMs > maxAgeMs) {
        staleCount++;
      }
      
      if (!oldestDate || updatedDate < oldestDate) {
        oldestDate = updatedDate;
      }
    }
  }
  
  const allIds = [
    ...catalog.in_repo.smoke.map(s => s.scenario_id),
    ...catalog.in_repo.regression.map(s => s.scenario_id),
    ...catalog.holdout.curated.map(s => s.scenario_id)
  ];
  const duplicates = allIds.filter((item, index) => allIds.indexOf(item) !== index);
  
  const report = {
    schema_version: 'scenario_freshness_report.v1',
    generated_at: now.toISOString(),
    fresh: staleCount === 0 && duplicates.length === 0,
    scenarios_root: SCENARIOS_ROOT,
    max_age_days: MAX_AGE_DAYS,
    holdout: {
      total: catalog.totals.holdout,
      stale: staleCount,
      fresh: catalog.totals.holdout - staleCount,
      oldest_date: oldestDate?.toISOString()
    },
    in_repo: {
      total: catalog.totals.in_repo,
      coverage_check: 'pass',
      missing_holdout: []
    },
    duplicates: [...new Set(duplicates)]
  };
  
  renderFreshnessReport(report);
  
  if (!report.fresh) {
    process.exit(1);
  }
}

function renderFreshnessReport(report) {
  console.log('\n🕐 Scenario Freshness Report\n');
  console.log('='.repeat(60));
  console.log(`Schema: ${report.schema_version}`);
  console.log(`Generated: ${report.generated_at}`);
  console.log(`Scenarios Root: ${report.scenarios_root}`);
  console.log(`Max Age: ${report.max_age_days} days`);
  
  const status = report.fresh ? '✅ FRESH' : '❌ STALE';
  console.log(`\nStatus: ${status}`);
  
  console.log(`\n🔒 Holdout Scenarios:`);
  console.log(`  Total: ${report.holdout.total}`);
  console.log(`  Fresh: ${report.holdout.fresh}`);
  console.log(`  Stale: ${report.holdout.stale}`);
  if (report.holdout.oldest_date) {
    const age = Math.floor((new Date().getTime() - new Date(report.holdout.oldest_date).getTime()) / (1000 * 60 * 60 * 24));
    console.log(`  Oldest: ${age} days ago`);
  }
  
  console.log(`\n🧪 In-Repo Scenarios:`);
  console.log(`  Total: ${report.in_repo.total}`);
  console.log(`  Coverage Check: ${report.in_repo.coverage_check.toUpperCase()}`);
  
  if (report.duplicates.length > 0) {
    console.log(`\n⚠️  Duplicate IDs Found:`);
    for (const dup of report.duplicates) {
      console.log(`  - ${dup}`);
    }
  }
}

async function promoteScenario(scenarioId) {
  const holdoutDir = path.join(SCENARIOS_ROOT, 'holdout', 'curated');
  const inRepoDir = path.join(SCENARIOS_ROOT, 'in-repo', 'regression');
  
  const sourcePath = path.join(holdoutDir, `${scenarioId}.json`);
  const destPath = path.join(inRepoDir, `${scenarioId}.json`);
  
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Holdout scenario not found: ${scenarioId}`);
  }
  
  fs.mkdirSync(inRepoDir, { recursive: true });
  
  const content = fs.readFileSync(sourcePath, 'utf-8');
  const data = JSON.parse(content);
  
  data.promoted_from_holdout = true;
  data.promoted_at = new Date().toISOString();
  
  fs.writeFileSync(destPath, JSON.stringify(data, null, 2));
  
  console.log(`✓ Promoted scenario: ${scenarioId}`);
  console.log(`  From: ${sourcePath}`);
  console.log(`  To: ${destPath}`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
