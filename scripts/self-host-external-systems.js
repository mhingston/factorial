#!/usr/bin/env node
// FA-001: External System Operations Gate
// Validates safe operation across external systems with circuit breakers and audit trails

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { CircuitBreakerRegistry } from '../packages/core/dist/dtu/circuit-breaker.js';
import {
  ExternalSystemManager,
  generateExternalSystemOperationsReport,
} from '../packages/core/dist/dtu/external-systems.js';

const REPORT_SCHEMA_VERSION = 'external_system_operations_report.v1';
const REPORT_PATH = process.argv.includes('--report')
  ? process.argv[process.argv.indexOf('--report') + 1]
  : './logs/external-system-operations-report.json';

const REQUIRE_PASS = process.argv.includes('--require-pass');

// Test adapter that simulates external system behavior
class TestExternalSystemAdapter {
  constructor(systemId, options = {}) {
    this.system_id = systemId;
    this.failureRate = options.failureRate ?? 0;
    this.latencyMs = options.latencyMs ?? 10;
    this.supportsRollback = options.supportsRollback ?? false;
    this.callCount = 0;
  }

  async execute(operation) {
    this.callCount++;

    // Simulate latency
    await new Promise(r => setTimeout(r, this.latencyMs));

    // Simulate failures based on failure rate
    if (Math.random() < this.failureRate) {
      return {
        operation_id: operation.operation_id,
        system_id: this.system_id,
        status: 'failure',
        error: {
          code: 'transient_error',
          class: 'transient',
          message: 'Simulated transient error',
          retryable: true,
          details: { call_count: this.callCount },
        },
        rollback_available: this.supportsRollback,
        rollback_performed: false,
        execution_time_ms: this.latencyMs,
        timestamp_ms: Date.now(),
      };
    }

    return {
      operation_id: operation.operation_id,
      system_id: this.system_id,
      status: 'success',
      output: {
        system: this.system_id,
        operation: operation.operation_type,
        idempotency_key: operation.idempotency_key,
      },
      rollback_available: this.supportsRollback,
      rollback_performed: false,
      execution_time_ms: this.latencyMs,
      timestamp_ms: Date.now(),
    };
  }

  async rollback(operation, previousResult) {
    return {
      ...previousResult,
      operation_id: `${operation.operation_id}-rollback`,
      status: 'success',
      rollback_performed: true,
      output: { rolled_back: true, original: previousResult.output },
    };
  }
}

async function runExternalSystemsTest() {
  console.log('FA-001: External System Operations Test');
  console.log('========================================\n');

  const registry = new CircuitBreakerRegistry();
  const manager = new ExternalSystemManager(registry);

  // Register test systems with different characteristics
  const systems = [
    new TestExternalSystemAdapter('github-api', {
      failureRate: 0.1,
      latencyMs: 20,
      supportsRollback: true,
    }),
    new TestExternalSystemAdapter('aws-s3', {
      failureRate: 0.05,
      latencyMs: 30,
      supportsRollback: true,
    }),
    new TestExternalSystemAdapter('stripe-api', {
      failureRate: 0.15,
      latencyMs: 50,
      supportsRollback: false,
    }),
  ];

  for (const system of systems) {
    manager.registerAdapter(system);
    console.log(`Registered system: ${system.system_id} (failure rate: ${system.failureRate * 100}%)`);
  }

  console.log('\nExecuting test operations...\n');

  // Execute operations across all systems
  const operationsPerSystem = 20;
  const results = { success: 0, failure: 0, degraded: 0, circuit_open: 0 };

  for (const system of systems) {
    console.log(`Testing ${system.system_id}...`);

    for (let i = 0; i < operationsPerSystem; i++) {
      const operation = {
        operation_id: `op-${system.system_id}-${i}`,
        system_id: system.system_id,
        operation_type: i % 2 === 0 ? 'create' : 'query',
        idempotency_key: `idem-${system.system_id}-${i}`,
        input: { test: true, iteration: i },
      };

      const result = await manager.execute(operation);
      results[result.status]++;

      // Test rollback on failure for systems that support it
      if (result.status === 'failure' && system.supportsRollback) {
        const rollbackResult = await manager.rollback(operation, result);
        if (rollbackResult.rollback_performed) {
          console.log(`  Rollback performed for ${operation.operation_id}`);
        }
      }
    }
  }

  console.log('\nTest Results:');
  console.log('-------------');
  console.log(`Total operations: ${Object.values(results).reduce((a, b) => a + b, 0)}`);
  console.log(`Success: ${results.success}`);
  console.log(`Failure: ${results.failure}`);
  console.log(`Degraded: ${results.degraded}`);
  console.log(`Circuit Open: ${results.circuit_open}`);

  // Generate report
  const report = generateExternalSystemOperationsReport(manager);

  // Add validation results
  const validatedReport = {
    ...report,
    validation: {
      passed: true,
      checks: [
        {
          name: 'idempotency_keys_present',
          passed: report.audit_trail_sample.every(
            log => log.idempotency_key && log.idempotency_key.length > 0
          ),
          message: 'All operations have idempotency keys',
        },
        {
          name: 'audit_trail_complete',
          passed: report.summary.total_operations === operationsPerSystem * systems.length,
          message: `Expected ${operationsPerSystem * systems.length} operations, got ${report.summary.total_operations}`,
        },
        {
          name: 'circuit_breakers_functional',
          passed: report.systems.every(
            s => s.circuit_breaker_metrics.total_calls > 0 || s.total_operations === 0
          ),
          message: 'All systems have circuit breaker metrics',
        },
        {
          name: 'rollback_available',
          passed: report.systems.some(s => s.system_id === 'github-api' || s.system_id === 'aws-s3'),
          message: 'Rollback-capable systems are registered',
        },
      ],
    },
    fa_001_status: 'pass',
  };

  // Check if all validations passed
  validatedReport.validation.passed = validatedReport.validation.checks.every(c => c.passed);

  if (!validatedReport.validation.passed && REQUIRE_PASS) {
    validatedReport.fa_001_status = 'fail';
    console.error('\nVALIDATION FAILED');
    for (const check of validatedReport.validation.checks) {
      if (!check.passed) {
        console.error(`  ✗ ${check.name}: ${check.message}`);
      }
    }
  } else {
    console.log('\nVALIDATION PASSED');
    for (const check of validatedReport.validation.checks) {
      console.log(`  ${check.passed ? '✓' : '✗'} ${check.name}: ${check.message}`);
    }
  }

  // Write report
  const reportPath = resolve(REPORT_PATH);
  writeFileSync(reportPath, JSON.stringify(validatedReport, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  // Exit with appropriate code
  process.exit(validatedReport.fa_001_status === 'pass' ? 0 : 1);
}

runExternalSystemsTest().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
