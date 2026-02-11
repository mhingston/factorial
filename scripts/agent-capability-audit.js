#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const workspace = process.cwd();

/**
 * @typedef {"PASS" | "FAIL" | "SKIP"} CheckStatus
 */

/**
 * @typedef AuditResult
 * @property {string} name
 * @property {CheckStatus} status
 * @property {boolean} required
 * @property {string} detail
 * @property {string} [stdout]
 * @property {string} [stderr]
 */

/** @type {AuditResult[]} */
const results = [];

function truncateOutput(text, maxChars = 5000) {
  if (!text) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n... <truncated>`;
}

function runCommand(command, args) {
  const response = spawnSync(command, args, {
    cwd: workspace,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    stdio: "pipe",
  });

  if (response.error) {
    return {
      ok: false,
      detail: response.error.message,
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
    };
  }

  return {
    ok: response.status === 0,
    detail: response.status === 0 ? "ok" : `exit code ${response.status ?? "unknown"}`,
    stdout: response.stdout ?? "",
    stderr: response.stderr ?? "",
  };
}

function pushResult(result) {
  results.push(result);
  console.log(`[${result.status}] ${result.name}: ${result.detail}`);

  if (result.status === "FAIL") {
    const stdout = truncateOutput(result.stdout ?? "");
    const stderr = truncateOutput(result.stderr ?? "");

    if (stdout) {
      console.log("---- stdout ----");
      console.log(stdout);
    }

    if (stderr) {
      console.log("---- stderr ----");
      console.log(stderr);
    }
  }
}

function runRequiredCommandCheck(name, command, args) {
  console.log(`\n[check] ${name}`);
  const output = runCommand(command, args);

  pushResult({
    name,
    status: output.ok ? "PASS" : "FAIL",
    required: true,
    detail: output.detail,
    stdout: output.stdout,
    stderr: output.stderr,
  });
}

async function runOptionalServiceProbe() {
  const serviceUrl = process.env.AGENT_AUDIT_SERVICE_URL;
  if (!serviceUrl) {
    pushResult({
      name: "Optional local service probe",
      status: "SKIP",
      required: false,
      detail: "Set AGENT_AUDIT_SERVICE_URL to enable this check.",
    });
    return;
  }

  const timeoutMs = Number.parseInt(process.env.AGENT_AUDIT_SERVICE_TIMEOUT_MS ?? "2000", 10);
  const required = process.env.AGENT_AUDIT_REQUIRE_SERVICE === "1";

  if (typeof fetch !== "function") {
    pushResult({
      name: "Optional local service probe",
      status: required ? "FAIL" : "SKIP",
      required,
      detail: "Fetch API is unavailable in this Node runtime.",
    });
    return;
  }

  console.log("\n[check] Optional local service probe");
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(serviceUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "factorial-agent-audit",
      },
    });

    pushResult({
      name: "Optional local service probe",
      status: response.ok ? "PASS" : required ? "FAIL" : "SKIP",
      required,
      detail: `HTTP ${response.status} from ${serviceUrl}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushResult({
      name: "Optional local service probe",
      status: required ? "FAIL" : "SKIP",
      required,
      detail: `${serviceUrl} unreachable (${message})`,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function printSummaryAndExit() {
  const requiredFailures = results.filter((result) => result.required && result.status === "FAIL");
  const requiredPasses = results.filter((result) => result.required && result.status === "PASS");
  const optionalSkips = results.filter((result) => !result.required && result.status === "SKIP");

  console.log("\n=== Agent Capability Audit Summary ===");
  console.log(`Required checks passed: ${requiredPasses.length}`);
  console.log(`Required checks failed: ${requiredFailures.length}`);
  console.log(`Optional checks skipped: ${optionalSkips.length}`);

  if (requiredFailures.length > 0) {
    console.log("Audit result: FAIL");
    process.exit(1);
  }

  console.log("Audit result: PASS");
  process.exit(0);
}

async function main() {
  console.log("=== Agent Capability Audit ===");
  console.log(`Workspace: ${workspace}`);

  runRequiredCommandCheck("Lint (`npm run lint`)", npmCommand, ["run", "lint"]);
  runRequiredCommandCheck("Typecheck (`npm run typecheck`)", npmCommand, ["run", "typecheck"]);
  runRequiredCommandCheck("Tests (`npm run test:run`)", npmCommand, ["run", "test:run"]);
  runRequiredCommandCheck("Git access (`git status --porcelain`)", "git", ["status", "--porcelain"]);
  await runOptionalServiceProbe();
  printSummaryAndExit();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Audit execution failed: ${message}`);
  process.exit(1);
});
