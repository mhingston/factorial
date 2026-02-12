import { describe, expect, it } from 'vitest';
import {
  FULL_AUTONOMY_GATE_IDS,
  buildFullAutonomyReadinessReport,
  fullAutonomyReadinessReportSchema,
} from './full-autonomy-readiness.js';

describe('full-autonomy-readiness', () => {
  it('builds a passing readiness report when all gates pass', () => {
    const checks = FULL_AUTONOMY_GATE_IDS.map(id => ({
      id,
      status: 'pass' as const,
      summary: 'ok',
      evidence_paths: [`docs/metrics/reports/${id}-latest.json`],
    }));

    const report = buildFullAutonomyReadinessReport({
      reportPath: 'docs/metrics/reports/full-autonomy-readiness-latest.json',
      checks,
      generatedAt: new Date('2026-02-12T00:00:00.000Z'),
    });

    expect(report.readiness_status).toBe('pass');
    expect(report.summary.passed).toBe(FULL_AUTONOMY_GATE_IDS.length);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.missing).toBe(0);
    expect(report.summary.required_gate_ids).toEqual([...FULL_AUTONOMY_GATE_IDS]);
  });

  it('fails readiness when gates are missing or failing', () => {
    const checks = [
      { id: 'FA-001', status: 'pass' as const, summary: 'ok', evidence_paths: ['a'] },
      { id: 'FA-002', status: 'fail' as const, summary: 'no', evidence_paths: ['b'] },
      { id: 'FA-003', status: 'missing' as const, summary: 'missing', evidence_paths: [] },
    ];

    const report = buildFullAutonomyReadinessReport({
      reportPath: 'docs/metrics/reports/full-autonomy-readiness-latest.json',
      checks,
      generatedAt: new Date('2026-02-12T00:00:00.000Z'),
    });

    expect(report.readiness_status).toBe('fail');
    expect(report.summary.failed_gate_ids).toContain('FA-002');
    expect(report.summary.missing_gate_ids).toContain('FA-003');
  });

  it('validates readiness report fixtures against schema', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');

    const basePath = path.resolve('tests/fixtures/full-autonomy-readiness');
    const passFixture = JSON.parse(
      await readFile(path.join(basePath, 'full-autonomy-readiness.pass.json'), 'utf-8')
    ) as unknown;
    const failFixture = JSON.parse(
      await readFile(path.join(basePath, 'full-autonomy-readiness.fail.json'), 'utf-8')
    ) as unknown;

    expect(fullAutonomyReadinessReportSchema.parse(passFixture)).toBeTruthy();
    expect(fullAutonomyReadinessReportSchema.parse(failFixture)).toBeTruthy();
  });
});
