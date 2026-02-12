import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface CommandResult { code: number; stdout: string; stderr: string }

const ROOT_DIR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

describe('Release hardening script', () => {
  it('emits deterministic release hardening report with sbom/signing/provenance checks', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-release-hardening-'))
    const reportPath = join(logsRoot, 'report.json')
    const sbomPath = join(logsRoot, 'sbom.json')
    const signaturePath = join(logsRoot, 'signature.json')

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'release-hardening.js'),
        '--report',
        reportPath,
        '--sbom',
        sbomPath,
        '--signature',
        signaturePath,
        '--strict-signing',
        '--signing-key-env',
        'BK008_TEST_SIGNING_KEY',
      ],
      ROOT_DIR,
      {
        BK008_TEST_SIGNING_KEY: 'deterministic-test-signing-key',
      },
    )

    expect(result.code).toBe(0)

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>
    expect(report.schema_version).toBe('release_hardening_report.v1')
    expect(report.summary).toMatchObject({
      sbom_status: 'pass',
      signing_status: 'pass',
      provenance_status: 'pass',
      overall_status: 'pass',
    })

    const checks = (report.checks as Array<Record<string, unknown>>) ?? []
    const checksById = Object.fromEntries(checks.map(check => [String(check.id), check]))
    expect(String((checksById['RH-001'] || {}).status)).toBe('pass')
    expect(String((checksById['RH-002'] || {}).status)).toBe('pass')
    expect(String((checksById['RH-003'] || {}).status)).toBe('pass')

    const sbom = JSON.parse(await readFile(sbomPath, 'utf-8')) as Record<string, unknown>
    expect(sbom.schema_version).toBe('release_sbom.v1')
    expect(typeof sbom.component_count).toBe('number')

    const signature = JSON.parse(await readFile(signaturePath, 'utf-8')) as Record<string, unknown>
    expect(signature.schema_version).toBe('release_signature.v1')
    expect(signature.algorithm).toBe('hmac-sha256')
  }, 60_000)

  it('fails closed in strict signing mode when signing key env is missing', async () => {
    const logsRoot = await mkdtemp(join(tmpdir(), 'attractor-release-hardening-missing-key-'))
    const reportPath = join(logsRoot, 'report.json')
    const sbomPath = join(logsRoot, 'sbom.json')
    const signaturePath = join(logsRoot, 'signature.json')

    const result = await run(
      [
        process.execPath,
        join(ROOT_DIR, 'scripts', 'release-hardening.js'),
        '--report',
        reportPath,
        '--sbom',
        sbomPath,
        '--signature',
        signaturePath,
        '--strict-signing',
        '--signing-key-env',
        'BK008_MISSING_SIGNING_KEY',
      ],
      ROOT_DIR,
    )

    expect(result.code).toBe(1)

    const report = JSON.parse(await readFile(reportPath, 'utf-8')) as Record<string, unknown>
    const checks = (report.checks as Array<Record<string, unknown>>) ?? []
    const signingCheck = checks.find(check => check.id === 'RH-002') || {}

    expect(String((report.summary as Record<string, unknown>)?.overall_status)).toBe('fail')
    expect(String((signingCheck as Record<string, unknown>).status)).toBe('fail')
  }, 60_000)
})

async function run(
  cmd: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<CommandResult> {
  return new Promise(resolve => {
    const [exe, ...args] = cmd
    const child = spawn(exe, args, {
      cwd,
      env: { ...process.env, ...env },
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
