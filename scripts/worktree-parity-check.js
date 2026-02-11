#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = process.cwd();
const baseLogsRoot = mkdtempSync(join(tmpdir(), "attractor-worktree-base-"));
const worktreeLogsRoot = mkdtempSync(join(tmpdir(), "attractor-worktree-wt-"));
const worktreeParent = mkdtempSync(join(tmpdir(), "attractor-worktree-checkout-"));
const worktreeDir = join(worktreeParent, "repo-worktree");

const baseGraphPath = join(repoRoot, "tests", "fixtures", "e2e", "cli_smoke.dot");
const baseEnvPath = join(repoRoot, "tests", "fixtures", "e2e", ".env.smoke");

const baseCliEntry = resolve(repoRoot, "dist", "packages", "cli", "src", "index.js");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 20 * 1024 * 1024,
  });

  return {
    ok: result.status === 0,
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function requireSuccess(step, result) {
  if (result.ok) {
    return;
  }

  console.error(`\n[FAIL] ${step}`);
  console.error(`Exit code: ${result.code}`);

  if (result.stdout) {
    console.error("---- stdout ----");
    console.error(result.stdout);
  }

  if (result.stderr) {
    console.error("---- stderr ----");
    console.error(result.stderr);
  }

  cleanup();
  process.exit(1);
}

function parseJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertEqual(step, left, right) {
  if (left === right) {
    return;
  }

  console.error(`\n[FAIL] ${step}`);
  console.error(`Left: ${JSON.stringify(left)}`);
  console.error(`Right: ${JSON.stringify(right)}`);
  cleanup();
  process.exit(1);
}

function assertTruthy(step, value) {
  if (value) {
    return;
  }

  console.error(`\n[FAIL] ${step}`);
  cleanup();
  process.exit(1);
}

function normalizeManifest(manifest) {
  const outcome = toObject(manifest.outcome);
  const graph = toObject(manifest.graph);
  const modelProvenance = Array.isArray(manifest.model_provenance) ? manifest.model_provenance : [];

  return {
    schema_version: String(manifest.schema_version ?? ""),
    command: String(manifest.command ?? ""),
    outcome_status: String(outcome.status ?? ""),
    outcome_failure_reason: String(outcome.failure_reason ?? ""),
    graph_node_count: Number(graph.node_count ?? 0),
    graph_edge_count: Number(graph.edge_count ?? 0),
    promotion_stage: String(graph.promotion_stage ?? ""),
    quality_profile: String(graph.quality_profile ?? ""),
    model_provenance_count: modelProvenance.length,
  };
}

function toObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function cleanup() {
  if (worktreeDir) {
    run("git", ["worktree", "remove", "--force", worktreeDir], repoRoot);
  }

  rmSync(baseLogsRoot, { recursive: true, force: true });
  rmSync(worktreeLogsRoot, { recursive: true, force: true });
  rmSync(worktreeParent, { recursive: true, force: true });
}

function runCli(cliEntry, graphPath, envPath, logsRoot, cwd) {
  const runResult = run(
    process.execPath,
    [
      cliEntry,
      "run",
      "--graph",
      graphPath,
      "--logs-root",
      logsRoot,
      "--env-file",
      envPath,
      "--llm-backend",
      "cli",
    ],
    cwd
  );
  requireSuccess(`CLI run (${cwd})`, runResult);

  const resumeResult = run(
    process.execPath,
    [
      cliEntry,
      "resume",
      "--graph",
      graphPath,
      "--logs-root",
      logsRoot,
      "--env-file",
      envPath,
      "--llm-backend",
      "cli",
    ],
    cwd
  );
  requireSuccess(`CLI resume (${cwd})`, resumeResult);
}

function main() {
  console.log("=== Worktree parity check ===");
  console.log(`Repository: ${repoRoot}`);
  const requireHead = process.env.WORKTREE_PARITY_REQUIRE_HEAD === "1";
  const allowDirty = process.env.WORKTREE_PARITY_ALLOW_DIRTY === "1";

  const gitRepoCheck = run("git", ["rev-parse", "--is-inside-work-tree"], repoRoot);
  requireSuccess("Verify git repository", gitRepoCheck);

  const headCheck = run("git", ["rev-parse", "--verify", "HEAD"], repoRoot);
  if (!headCheck.ok) {
    if (requireHead) {
      console.error("Worktree parity check: FAIL (no resolvable HEAD commit in strict mode)");
      cleanup();
      process.exit(1);
    }
    console.log("Worktree parity check: SKIP (no resolvable HEAD commit in this checkout)");
    cleanup();
    process.exit(0);
  }

  if (!allowDirty) {
    const dirtyCheck = run("git", ["status", "--porcelain", "--untracked-files=no"], repoRoot);
    requireSuccess("Verify git status", dirtyCheck);
    if (dirtyCheck.stdout.trim()) {
      if (requireHead) {
        console.error("Worktree parity check: FAIL (tracked working-tree changes detected in strict mode)");
        cleanup();
        process.exit(1);
      }
      console.log("Worktree parity check: SKIP (tracked working-tree changes detected; use a clean checkout)");
      cleanup();
      process.exit(0);
    }
  }

  const buildBase = run("npm", ["run", "build"], repoRoot);
  requireSuccess("Build in primary checkout", buildBase);

  runCli(baseCliEntry, baseGraphPath, baseEnvPath, baseLogsRoot, repoRoot);

  const addWorktree = run("git", ["worktree", "add", "--detach", worktreeDir, "HEAD"], repoRoot);
  requireSuccess("Create detached git worktree", addWorktree);

  const installWorktreeDeps = run("npm", ["ci"], worktreeDir);
  requireSuccess("Install dependencies in worktree checkout", installWorktreeDeps);

  const buildWorktree = run("npm", ["run", "build"], worktreeDir);
  requireSuccess("Build in worktree checkout", buildWorktree);

  const worktreeGraphPath = join(worktreeDir, "tests", "fixtures", "e2e", "cli_smoke.dot");
  const worktreeEnvPath = join(worktreeDir, "tests", "fixtures", "e2e", ".env.smoke");
  const worktreeCliEntry = resolve(worktreeDir, "dist", "packages", "cli", "src", "index.js");

  runCli(worktreeCliEntry, worktreeGraphPath, worktreeEnvPath, worktreeLogsRoot, worktreeDir);

  const baseOutput = parseJsonFile(join(baseLogsRoot, "work", "output.json"));
  const worktreeOutput = parseJsonFile(join(worktreeLogsRoot, "work", "output.json"));
  const baseManifest = parseJsonFile(join(baseLogsRoot, "run_manifest.json"));
  const worktreeManifest = parseJsonFile(join(worktreeLogsRoot, "run_manifest.json"));

  assertEqual("Base run output status", baseOutput.status, "success");
  assertEqual("Worktree run output status", worktreeOutput.status, "success");
  assertEqual("Base run output value", baseOutput.output, "smoke-output");
  assertEqual("Worktree run output value", worktreeOutput.output, "smoke-output");
  assertEqual(
    "Normalized run manifest parity",
    JSON.stringify(normalizeManifest(baseManifest)),
    JSON.stringify(normalizeManifest(worktreeManifest))
  );
  assertTruthy("Base checkpoint exists", parseJsonFile(join(baseLogsRoot, "checkpoint.json")));
  assertTruthy("Worktree checkpoint exists", parseJsonFile(join(worktreeLogsRoot, "checkpoint.json")));

  cleanup();
  console.log("Worktree parity check: PASS");
}

main();
