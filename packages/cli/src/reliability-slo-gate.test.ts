import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createSuiteIsolation, ensureDeterministicCliBuild } from '../test-harness.js';

interface CommandResult { code: number; stdout: string; stderr: string }

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

describe('Reliability SLO gate script', () => {
  it('emits pass report with resolved lock decision when thresholds are met', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-reliability-slo-pass-'))
    const weeklyReportPath = join(tempRoot, 'week-2026-02-09_to_2026-02-15.md')
    const reportPath = join(tempRoot, 'report.json')

    await writeWeeklyReport(weeklyReportPath, {
      start: '2026-02-09',
      end: '2026-02-15',
      reopenRate: '0.0% (0/4)',
      reviewArtifactsCount: 4,
    })

    const result = await run([
      process.execPath,
      join(ROOT_DIR, 'scripts', 'reliability-slo-gate.js'),
      '--weekly-report',
      weeklyReportPath,
      '--report',
      reportPath,
      '--today',
      '2026-02-12',
    ], ROOT_DIR)

    expect(result.code).toBe(0)

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>
    expect(report.schema_version).toBe('compound_reliability_slo_report.v1')
    expect((report.summary as Record<string, unknown>).overall_status).toBe('pass')
    expect((report.summary as Record<string, unknown>).consensus_lock_decision).toBe('resolved')

    const checks = (report.checks as Array<Record<string, unknown>>) ?? []
    const byId = Object.fromEntries(checks.map(check => [String(check.id), check]))
    expect(String((byId['SLO-001'] || {}).status)).toBe('pass')
    expect(String((byId['SLO-002'] || {}).status)).toBe('pass')
    expect(String((byId['SLO-003'] || {}).status)).toBe('pass')
    expect(String((byId['SLO-004'] || {}).status)).toBe('pass')
  })

  it('fails closed with reopen lock decision when thresholds are violated', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'attractor-reliability-slo-fail-'))
    const weeklyReportPath = join(tempRoot, 'week-2026-02-09_to_2026-02-15.md')
    const reportPath = join(tempRoot, 'report.json')

    await writeWeeklyReport(weeklyReportPath, {
      start: '2026-02-09',
      end: '2026-02-15',
      reopenRate: '50.0% (2/4)',
      reviewArtifactsCount: 4,
    })

    const result = await run([
      process.execPath,
      join(ROOT_DIR, 'scripts', 'reliability-slo-gate.js'),
      '--weekly-report',
      weeklyReportPath,
      '--report',
      reportPath,
      '--today',
      '2026-02-16',
    ], ROOT_DIR)

    expect(result.code).toBe(1)

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>
    expect((report.summary as Record<string, unknown>).overall_status).toBe('fail')
    expect((report.summary as Record<string, unknown>).consensus_lock_decision).toBe('reopen')

    const checks = (report.checks as Array<Record<string, unknown>>) ?? []
    const byId = Object.fromEntries(checks.map(check => [String(check.id), check]))
    expect(String((byId['SLO-001'] || {}).status)).toBe('fail')
    expect(String((byId['SLO-002'] || {}).status)).toBe('fail')
    expect(String((byId['SLO-004'] || {}).status)).toBe('pass')
  })
})

async function writeWeeklyReport(
  path: string,
  payload: {
    start: string
    end: string
    reopenRate: string
    reviewArtifactsCount: number
  },
): Promise<void> {
  const content = [
    `Week of ${payload.start} to ${payload.end}`,
    '- solutions_created_weekly: 1',
    '- context_updates_weekly: 1',
    '- known_issue_recurrence_rate: 0.0% (0/2)',
    '- median_cycles_to_close: N/A (single-pass batch data only in this week range)',
    `- reopen_rate: ${payload.reopenRate}`,
    '- verifier_agreement_rate: N/A (no independent duplicate verifier runs recorded)',
    `- review_artifacts_counted: ${payload.reviewArtifactsCount}`,
    '- Notes / actions: Test fixture',
    '',
  ].join('\n')
  await writeFile(path, content, 'utf-8')
}

async function run(
  cmd: string[],
  cwd: string,
): Promise<CommandResult> {
  return new Promise(resolve => {
    const [exe, ...args] = cmd
    const child = spawn(exe, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const out: string[] = []
    const err: string[] = []

    child.stdout.on('data', chunk => out.push(String(chunk)))
    child.stderr.on('data', chunk => err.push(String(chunk)))

    child.on('close', code => {
      resolve({
        code: code ?? 1,
        stdout: out.join(''),
        stderr: err.join(''),
      })
    })
  })
}
