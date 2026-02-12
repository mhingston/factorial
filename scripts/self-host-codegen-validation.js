#!/usr/bin/env node
// FA-005: Handler/schema codegen validation

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { generateCodegenArtifacts } from '../dist/packages/core/src/dtu/codegen.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_REPORT_PATH = join(
  ROOT_DIR,
  'docs',
  'metrics',
  'reports',
  'codegen-validation-latest.json'
);
const DEFAULT_FIXTURES_ROOT = join(ROOT_DIR, 'tests', 'fixtures', 'dtu', 'codegen');

function fixtureName(nodeType) {
  return nodeType.replace(/\./g, '-');
}

function parseArgs(argv) {
  const args = {
    fixturesRoot: DEFAULT_FIXTURES_ROOT,
    report: DEFAULT_REPORT_PATH,
    requirePass: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fixtures' && argv[index + 1]) {
      args.fixturesRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--require-pass') {
      args.requirePass = true;
    }
  }

  return args;
}

async function runCodegenValidation() {
  console.log('FA-005: Codegen Validation');
  console.log('===========================\n');

  const args = parseArgs(process.argv);
  const fixturesRoot = resolve(args.fixturesRoot);
  const targetsPath = join(fixturesRoot, 'targets.json');
  const expectedRoot = join(fixturesRoot, 'expected');
  const targets = JSON.parse(await readFile(targetsPath, 'utf-8'));
  const artifacts = generateCodegenArtifacts(targets);

  const handlerResults = [];
  for (const artifact of artifacts) {
    const baseName = fixtureName(artifact.node_type);
    const schemaPath = join(expectedRoot, `${baseName}.schema.json`);
    const handlerPath = join(expectedRoot, `${baseName}.handler.ts`);
    const errors = [];
    let goldenMatch = true;

    const expectedSchemaRaw = await readFile(schemaPath, 'utf-8');
    const expectedSchema = JSON.parse(expectedSchemaRaw);
    if (JSON.stringify(expectedSchema) !== JSON.stringify(artifact.schema)) {
      goldenMatch = false;
      errors.push('schema mismatch against golden fixture');
    }

    const expectedHandler = await readFile(handlerPath, 'utf-8');
    if (expectedHandler !== artifact.handler_source) {
      goldenMatch = false;
      errors.push('handler source mismatch against golden fixture');
    }

    handlerResults.push({
      node_type: artifact.node_type,
      handler_name: artifact.handler_name,
      status: goldenMatch ? 'pass' : 'fail',
      schema_path: schemaPath,
      handler_path: handlerPath,
      golden_match: goldenMatch,
      errors,
    });
  }

  const passed = handlerResults.filter(result => result.status === 'pass').length;
  const failed = handlerResults.length - passed;
  const report = {
    schema_version: 'codegen_validation_report.v1',
    generated_at: new Date().toISOString(),
    summary: {
      total_handlers: handlerResults.length,
      passed,
      failed,
    },
    handlers: handlerResults,
  };

  const validation = {
    passed: failed === 0,
    checks: [
      {
        name: 'golden_fixtures_match',
        passed: failed === 0,
        message: failed === 0 ? 'All codegen artifacts match golden fixtures' : 'Golden mismatches detected',
      },
    ],
  };

  const validatedReport = {
    ...report,
    validation,
    fa_005_status: validation.passed ? 'pass' : 'fail',
  };

  const reportPath = resolve(args.report);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(validatedReport, null, 2)}\n`, 'utf-8');
  console.log(`Report written to: ${reportPath}`);

  if (failed > 0 && args.requirePass) {
    process.exit(1);
  }
}

runCodegenValidation().catch(error => {
  console.error('Codegen validation failed:', error);
  process.exit(1);
});
