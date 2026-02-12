#!/usr/bin/env node

import { createHash, createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT_DIR = resolve(join(__dirname, '..'))
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const DEFAULT_REPORT_PATH = join(ROOT_DIR, 'docs', 'metrics', 'reports', 'release-hardening-latest.json')
const DEFAULT_SBOM_PATH = join(ROOT_DIR, 'docs', 'metrics', 'reports', 'release-sbom-latest.json')
const DEFAULT_SIGNATURE_PATH = join(ROOT_DIR, 'docs', 'metrics', 'reports', 'release-signature-latest.json')
const DEFAULT_RELEASE_WORKFLOW_PATH = join(ROOT_DIR, '.github', 'workflows', 'release.yml')

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    sbom: DEFAULT_SBOM_PATH,
    signature: DEFAULT_SIGNATURE_PATH,
    releaseWorkflow: DEFAULT_RELEASE_WORKFLOW_PATH,
    signingKeyEnv: 'RELEASE_SIGNING_KEY',
    strictSigning: false,
    json: false,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]

    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--sbom' && argv[index + 1]) {
      args.sbom = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--signature' && argv[index + 1]) {
      args.signature = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--release-workflow' && argv[index + 1]) {
      args.releaseWorkflow = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--signing-key-env' && argv[index + 1]) {
      args.signingKeyEnv = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--strict-signing') {
      args.strictSigning = true
      continue
    }
    if (arg === '--json') {
      args.json = true
      continue
    }
  }

  return args
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path)
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path
}

async function runCommand(command, cwd, envOverrides = {}) {
  return new Promise(resolvePromise => {
    const [executable, ...args] = command
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdout = []
    const stderr = []

    child.stdout.on('data', chunk => stdout.push(String(chunk)))
    child.stderr.on('data', chunk => stderr.push(String(chunk)))

    child.on('close', code => {
      resolvePromise({
        code: code ?? 1,
        stdout: stdout.join(''),
        stderr: stderr.join(''),
      })
    })
  })
}

function parsePackJson(stdout) {
  const trimmed = String(stdout || '').trim()
  if (!trimmed) {
    throw new Error('npm pack did not return JSON output')
  }

  const firstBracket = trimmed.indexOf('[')
  const lastBracket = trimmed.lastIndexOf(']')
  if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) {
    throw new Error('Unable to parse npm pack JSON payload')
  }

  const payload = trimmed.slice(firstBracket, lastBracket + 1)
  const parsed = JSON.parse(payload)
  if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0]?.filename !== 'string') {
    throw new Error('npm pack JSON payload missing filename entry')
  }

  return parsed
}

function sortComponents(components) {
  return components.sort((left, right) => {
    const leftKey = `${left.name}@${left.version}`
    const rightKey = `${right.name}@${right.version}`
    return leftKey.localeCompare(rightKey)
  })
}

async function generateSbomArtifact(sbomPath) {
  const packageJsonPath = join(ROOT_DIR, 'package.json')
  const lockfilePath = join(ROOT_DIR, 'package-lock.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))
  const lockfile = JSON.parse(await readFile(lockfilePath, 'utf-8'))

  const components = []
  const packages = lockfile?.packages ?? {}
  for (const [packagePath, metadata] of Object.entries(packages)) {
    if (!packagePath.startsWith('node_modules/')) {
      continue
    }
    components.push({
      name: packagePath.replace(/^node_modules\//, ''),
      version: metadata?.version ?? 'unknown',
      resolved: metadata?.resolved ?? '',
      integrity: metadata?.integrity ?? '',
      license: metadata?.license ?? '',
      dev: Boolean(metadata?.dev),
    })
  }

  const sbom = {
    schema_version: 'release_sbom.v1',
    generated_at: new Date().toISOString(),
    root_package: {
      name: packageJson?.name ?? '',
      version: packageJson?.version ?? '',
      license: packageJson?.license ?? '',
    },
    component_count: components.length,
    components: sortComponents(components),
  }

  await writeFile(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`)

  return {
    id: 'RH-001',
    name: 'SBOM generation',
    status: 'pass',
    summary: `Generated deterministic SBOM with ${components.length} components.`,
    evidence: [toContractPath(sbomPath), toContractPath(lockfilePath)],
    details: {
      sbom_schema_version: 'release_sbom.v1',
      component_count: components.length,
    },
  }
}

async function generateSignatureArtifact(signaturePath, signingKeyEnv, strictSigning) {
  const signingKey = process.env[signingKeyEnv]
  const strictSigningMet = Boolean(signingKey)

  if (strictSigning && !strictSigningMet) {
    return {
      id: 'RH-002',
      name: 'Artifact signing',
      status: 'fail',
      summary: `Signing key env "${signingKeyEnv}" is required in strict signing mode.`,
      evidence: [],
      details: {
        strict_signing: true,
        signing_key_env: signingKeyEnv,
        signing_key_present: false,
      },
    }
  }

  const effectiveSigningKey = signingKey || 'local-development-signing-key'
  const keySource = signingKey ? `env:${signingKeyEnv}` : 'fallback-development-key'
  const tempRoot = await mkdtemp(join(tmpdir(), 'factorial-release-hardening-'))
  const npmCacheRoot = join(tempRoot, 'npm-cache')
  const npmLogsRoot = join(tempRoot, 'npm-logs')
  await mkdir(npmCacheRoot, { recursive: true })
  await mkdir(npmLogsRoot, { recursive: true })
  const npmEnvOverrides = {
    npm_config_cache: npmCacheRoot,
    npm_config_logs_dir: npmLogsRoot,
  }

  const buildResult = await runCommand([npmCommand, 'run', 'build'], ROOT_DIR, npmEnvOverrides)
  if (buildResult.code !== 0) {
    return {
      id: 'RH-002',
      name: 'Artifact signing',
      status: 'fail',
      summary: 'Build failed before packaging/signing release artifact.',
      evidence: [],
      details: {
        build_exit_code: buildResult.code,
      },
    }
  }

  const packResult = await runCommand([npmCommand, 'pack', '--json'], ROOT_DIR, npmEnvOverrides)
  if (packResult.code !== 0) {
    return {
      id: 'RH-002',
      name: 'Artifact signing',
      status: 'fail',
      summary: 'Unable to create release package artifact with npm pack.',
      evidence: [],
      details: {
        pack_exit_code: packResult.code,
        signing_key_env: signingKeyEnv,
      },
    }
  }

  let packageArtifactPath = ''

  try {
    const packJson = parsePackJson(packResult.stdout)
    const packageFilename = String(packJson[0].filename)
    packageArtifactPath = join(ROOT_DIR, packageFilename)

    if (!existsSync(packageArtifactPath)) {
      return {
        id: 'RH-002',
        name: 'Artifact signing',
        status: 'fail',
        summary: 'npm pack succeeded but package artifact file was not found.',
        evidence: [],
        details: {
          package_filename: packageFilename,
          package_artifact_exists: false,
        },
      }
    }

    const bytes = await readFile(packageArtifactPath)
    const artifactSha256 = createHash('sha256').update(bytes).digest('hex')
    const signature = createHmac('sha256', effectiveSigningKey).update(bytes).digest('hex')

    const signatureArtifact = {
      schema_version: 'release_signature.v1',
      generated_at: new Date().toISOString(),
      algorithm: 'hmac-sha256',
      key_source: keySource,
      artifact: {
        path: toContractPath(packageArtifactPath),
        size_bytes: bytes.length,
        sha256: artifactSha256,
      },
      signature,
    }

    await writeFile(signaturePath, `${JSON.stringify(signatureArtifact, null, 2)}\n`)

    return {
      id: 'RH-002',
      name: 'Artifact signing',
      status: 'pass',
      summary: `Release package artifact signed via ${keySource}.`,
      evidence: [toContractPath(signaturePath), 'npm pack --json'],
      details: {
        signature_schema_version: 'release_signature.v1',
        key_source: keySource,
        strict_signing: strictSigning,
      },
    }
  } catch (error) {
    return {
      id: 'RH-002',
      name: 'Artifact signing',
      status: 'fail',
      summary: `Artifact signing failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence: [],
      details: {
        signing_key_env: signingKeyEnv,
      },
    }
  } finally {
    if (packageArtifactPath && existsSync(packageArtifactPath)) {
      await unlink(packageArtifactPath)
    }
    await rm(tempRoot, { recursive: true, force: true })
  }
}

async function verifyProvenancePolicy(releaseWorkflowPath) {
  if (!existsSync(releaseWorkflowPath)) {
    return {
      id: 'RH-003',
      name: 'Provenance policy verification',
      status: 'fail',
      summary: 'Release workflow file is missing.',
      evidence: [],
      details: {
        release_workflow_path: toContractPath(releaseWorkflowPath),
      },
    }
  }

  const workflowText = await readFile(releaseWorkflowPath, 'utf-8')
  const hasIdTokenWrite = /id-token:\s*write/m.test(workflowText)
  const hasContentsWrite = /contents:\s*write/m.test(workflowText)
  const hasPublishProvenance = /npm\s+publish[^\n]*--provenance/m.test(workflowText)
  const hasReleaseHardeningCommand = /npm\s+run\s+release:hardening\b/m.test(workflowText)
  const hardeningCommandIndex = workflowText.search(/npm\s+run\s+release:hardening\b/m)
  const publishCommandIndex = workflowText.search(/npm\s+publish[^\n]*--provenance/m)
  const hardeningRunsBeforePublish =
    hardeningCommandIndex !== -1 &&
    publishCommandIndex !== -1 &&
    hardeningCommandIndex < publishCommandIndex

  const ok =
    hasIdTokenWrite &&
    hasContentsWrite &&
    hasPublishProvenance &&
    hasReleaseHardeningCommand &&
    hardeningRunsBeforePublish

  return {
    id: 'RH-003',
    name: 'Provenance policy verification',
    status: ok ? 'pass' : 'fail',
    summary: ok
      ? 'Release workflow enforces release hardening and npm provenance policy.'
      : 'Release workflow provenance policy does not satisfy required release-hardening checks.',
    evidence: [toContractPath(releaseWorkflowPath)],
    details: {
      has_id_token_write: hasIdTokenWrite,
      has_contents_write: hasContentsWrite,
      has_publish_provenance_flag: hasPublishProvenance,
      has_release_hardening_command: hasReleaseHardeningCommand,
      hardening_runs_before_publish: hardeningRunsBeforePublish,
    },
  }
}

async function main() {
  const args = parseArgs(process.argv)

  const reportPath = resolve(args.report)
  const sbomPath = resolve(args.sbom)
  const signaturePath = resolve(args.signature)
  const releaseWorkflowPath = resolve(args.releaseWorkflow)

  await mkdir(dirname(reportPath), { recursive: true })
  await mkdir(dirname(sbomPath), { recursive: true })
  await mkdir(dirname(signaturePath), { recursive: true })

  const checks = []
  checks.push(await generateSbomArtifact(sbomPath))
  checks.push(await generateSignatureArtifact(signaturePath, args.signingKeyEnv, args.strictSigning))
  checks.push(await verifyProvenancePolicy(releaseWorkflowPath))

  const summary = {
    sbom_status: checks.find(check => check.id === 'RH-001')?.status ?? 'fail',
    signing_status: checks.find(check => check.id === 'RH-002')?.status ?? 'fail',
    provenance_status: checks.find(check => check.id === 'RH-003')?.status ?? 'fail',
  }
  const overallStatus = checks.every(check => check.status === 'pass') ? 'pass' : 'fail'

  const report = {
    schema_version: 'release_hardening_report.v1',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    sbom_path: toContractPath(sbomPath),
    signature_path: toContractPath(signaturePath),
    release_workflow_path: toContractPath(releaseWorkflowPath),
    strict_signing: args.strictSigning,
    signing_key_env: args.signingKeyEnv,
    summary: {
      ...summary,
      overall_status: overallStatus,
    },
    checks,
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(`Release hardening report written to ${reportPath}`)
  console.log(`Release SBOM artifact written to ${sbomPath}`)
  console.log(`Release signature artifact written to ${signaturePath}`)

  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  }

  process.exit(overallStatus === 'pass' ? 0 : 1)
}

main().catch(error => {
  console.error('Release hardening gate failed:', error)
  process.exit(1)
})
