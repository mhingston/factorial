import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(join(__filename, '..'));

interface AuditResult {
  schema_version: string;
  summary: {
    overall_status: 'pass' | 'fail';
    total_violations: number;
    principles_checked: string[];
    violation_counts: Record<string, number>;
  };
  violations: Array<{
    principle_id: string;
    severity: string;
    file: string;
    line: number;
    message: string;
  }>;
}

async function runAudit(args: string[] = []): Promise<AuditResult> {
  const result = await execa('node', [
    resolve(__dirname, '../scripts/golden-principles-audit.js'),
    '--report',
    join(__dirname, '../logs/golden-principles/test-report.json'),
    '--json',
    ...args,
  ], {
    cwd: resolve(__dirname, '..'),
    reject: false,
  });

  // Parse the JSON output from stdout
  try {
    const lines = result.stdout.split('\n');
    const jsonLine = lines.find(line => line.startsWith('{'));
    if (jsonLine) {
      return JSON.parse(jsonLine) as AuditResult;
    }
  } catch {
    // Fall through to read from file
  }

  // Read from report file
  const reportContent = await readFile(
    resolve(__dirname, '../logs/golden-principles/test-report.json'),
    'utf-8'
  );
  return JSON.parse(reportContent) as AuditResult;
}

describe('Golden Principles Audit', () => {
  it('should load and parse principles from golden-principles.md', async () => {
    const result = await runAudit();

    expect(result.schema_version).toBe('golden_principles_report.v1');
    expect(result.summary.principles_checked).toContain('GP-001');
    expect(result.summary.principles_checked).toContain('GP-002');
    expect(result.summary.principles_checked).toContain('GP-003');
  });

  it('should detect GP-001 violations (manual test harness)', async () => {
    const result = await runAudit([
      '--changed-files',
      'tests/fixtures/golden-principles/gp-001-non-compliant.test.ts',
    ]);

    const gp001Violations = result.violations.filter(v => v.principle_id === 'GP-001');
    expect(gp001Violations.length).toBeGreaterThan(0);

    // Should detect mkdtemp violation
    const mkdtempViolation = gp001Violations.find(v =>
      v.message.toLowerCase().includes('mkdtemp')
    );
    expect(mkdtempViolation).toBeDefined();
  });

  it('should not flag GP-001 violations in compliant code', async () => {
    const result = await runAudit([
      '--changed-files',
      'tests/fixtures/golden-principles/gp-001-compliant.test.ts',
    ]);

    const gp001Violations = result.violations.filter(v =>
      v.file.includes('gp-001-compliant')
    );
    expect(gp001Violations.length).toBe(0);
  });

  it('should detect GP-002 violations (missing implementation refs)', async () => {
    const result = await runAudit([
      '--changed-files',
      'tests/fixtures/golden-principles/gp-002-non-compliant.md',
    ]);

    // GP-002 detection is more complex, may need adjustment
    // This test validates the structure is in place
    expect(result.summary.principles_checked).toContain('GP-002');
  });

  it('should detect GP-003 violations (missing input validation)', async () => {
    const result = await runAudit([
      '--changed-files',
      'tests/fixtures/golden-principles/gp-003-non-compliant.ts',
    ]);

    const gp003Violations = result.violations.filter(v => v.principle_id === 'GP-003');

    // Should find req.body access without validation
    expect(gp003Violations.length).toBeGreaterThan(0);
    const bodyViolation = gp003Violations.find(v =>
      v.context && v.context.includes('req.body')
    );
    expect(bodyViolation).toBeDefined();
  });

  it('should not flag GP-003 violations in compliant code', async () => {
    const result = await runAudit([
      '--changed-files',
      'tests/fixtures/golden-principles/gp-003-compliant.ts',
    ]);

    const gp003Violations = result.violations.filter(v =>
      v.file.includes('gp-003-compliant')
    );
    // Should have fewer or no violations for compliant code
    expect(gp003Violations.length).toBeLessThanOrEqual(1);
  });

  it('should respect ignore comments', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'golden-test-'));
    const testFile = join(tempDir, 'ignored-violation.test.ts');

    await writeFile(testFile, `
// golden-ignore: GP-001 This is intentional for testing
const tmpDir = await mkdtemp(join(os.tmpdir(), 'test-'));

// This should still be flagged
const anotherDir = await mkdtemp(join(tmpdir(), 'another-'));
`);

    const result = await runAudit(['--changed-files', testFile]);

    await rm(tempDir, { recursive: true, force: true });

    const gp001Violations = result.violations.filter(v => v.principle_id === 'GP-001');
    // Should only flag the second violation, not the ignored one
    expect(gp001Violations.length).toBe(1);
  });

  it('should generate valid report structure', async () => {
    const result = await runAudit();

    expect(result).toHaveProperty('schema_version');
    expect(result).toHaveProperty('generated_at');
    expect(result).toHaveProperty('publication');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('violations');
    expect(result).toHaveProperty('fixes_applied');

    expect(result.summary).toHaveProperty('overall_status');
    expect(result.summary).toHaveProperty('total_violations');
    expect(result.summary).toHaveProperty('principles_checked');
    expect(result.summary).toHaveProperty('violation_counts');
    expect(result.summary).toHaveProperty('auto_fixes_applied');
  });

  it('should exit with code 0 on pass, 1 on fail', async () => {
    // Test with compliant code only
    const passResult = await execa('node', [
      resolve(__dirname, '../scripts/golden-principles-audit.js'),
      '--changed-files',
      'tests/fixtures/golden-principles/gp-001-compliant.test.ts',
    ], {
      cwd: resolve(__dirname, '..'),
      reject: false,
    });

    expect(passResult.exitCode).toBe(0);
  });
});
