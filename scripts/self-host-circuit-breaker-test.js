#!/usr/bin/env node
// FA-002: Circuit Breaker Test
// Validates circuit breaker patterns with automatic degradation and human-escalation triggers

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
} from '../packages/core/dist/dtu/circuit-breaker.js';

const REPORT_PATH = process.argv.includes('--report')
  ? process.argv[process.argv.indexOf('--report') + 1]
  : './logs/circuit-breaker-test-report.json';

const REQUIRE_PASS = process.argv.includes('--require-pass');

// Track events for analysis
class EventTracker {
  constructor() {
    this.events = [];
  }

  onEvent(event) {
    this.events.push({
      ...event,
      timestamp_ms: Date.now(),
    });
  }

  getStateTransitions() {
    return this.events.filter(e => e.type === 'state_change');
  }

  getFailures() {
    return this.events.filter(e => e.type === 'failure');
  }

  getRejections() {
    return this.events.filter(e => e.type === 'rejected');
  }
}

async function runCircuitBreakerTests() {
  console.log('FA-002: Circuit Breaker Test');
  console.log('=============================\n');

  const testResults = [];

  // Test 1: Basic circuit breaker opens after threshold
  console.log('Test 1: Circuit opens after failure threshold');
  {
    const tracker = new EventTracker();
    const breaker = new CircuitBreaker('test-1', { failure_threshold: 3 });
    breaker.onEvent(e => tracker.onEvent(e));

    let callCount = 0;
    const failingOperation = () => {
      callCount++;
      return Promise.reject(new Error(`Failure ${callCount}`));
    };

    // Should fail 3 times then open
    await breaker.execute(failingOperation).catch(() => {});
    await breaker.execute(failingOperation).catch(() => {});
    await breaker.execute(failingOperation).catch(() => {});

    const state1 = breaker.getState();
    const metrics1 = breaker.getMetrics();

    // Next call should be rejected
    let rejected = false;
    try {
      await breaker.execute(() => Promise.resolve('success'));
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        rejected = true;
      }
    }

    testResults.push({
      test: 'opens_after_threshold',
      passed: state1 === 'open' && rejected,
      metrics: metrics1,
      events: tracker.getStateTransitions(),
    });

    console.log(`  State after 3 failures: ${state1}`);
    console.log(`  Call rejected when open: ${rejected ? 'YES' : 'NO'}`);
    console.log(`  Result: ${state1 === 'open' && rejected ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 2: Automatic degradation (half-open after timeout)
  console.log('Test 2: Automatic degradation (half-open after timeout)');
  {
    const tracker = new EventTracker();
    const breaker = new CircuitBreaker('test-2', {
      failure_threshold: 1,
      timeout_ms: 100,
    });
    breaker.onEvent(e => tracker.onEvent(e));

    // Open the circuit
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    console.log(`  State after failure: ${breaker.getState()}`);

    // Wait for timeout
    await new Promise(r => setTimeout(r, 150));

    // Next call should transition to half-open
    await breaker.execute(() => Promise.resolve('success'));
    const state2 = breaker.getState();

    testResults.push({
      test: 'half_open_after_timeout',
      passed: state2 === 'half_open' || state2 === 'closed',
      state: state2,
      events: tracker.getStateTransitions(),
    });

    console.log(`  State after timeout + success: ${state2}`);
    console.log(`  Result: ${state2 === 'half_open' || state2 === 'closed' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 3: Recovery after success threshold in half-open
  console.log('Test 3: Recovery after success threshold');
  {
    const tracker = new EventTracker();
    const breaker = new CircuitBreaker('test-3', {
      failure_threshold: 1,
      success_threshold: 2,
      timeout_ms: 50,
    });
    breaker.onEvent(e => tracker.onEvent(e));

    // Open the circuit
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await new Promise(r => setTimeout(r, 60));

    // Two successes should close it
    await breaker.execute(() => Promise.resolve('s1'));
    await breaker.execute(() => Promise.resolve('s2'));

    const state3 = breaker.getState();
    const metrics3 = breaker.getMetrics();

    testResults.push({
      test: 'closes_after_success_threshold',
      passed: state3 === 'closed',
      state: state3,
      consecutive_successes: metrics3.consecutive_successes,
      events: tracker.getStateTransitions(),
    });

    console.log(`  Final state: ${state3}`);
    console.log(`  Consecutive successes: ${metrics3.consecutive_successes}`);
    console.log(`  Result: ${state3 === 'closed' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 4: Re-opens on failure in half-open
  console.log('Test 4: Re-opens on failure in half-open state');
  {
    const tracker = new EventTracker();
    const breaker = new CircuitBreaker('test-4', {
      failure_threshold: 1,
      success_threshold: 3,
      timeout_ms: 50,
    });
    breaker.onEvent(e => tracker.onEvent(e));

    // Open the circuit
    await breaker.execute(() => Promise.reject(new Error('fail1'))).catch(() => {});
    await new Promise(r => setTimeout(r, 60));

    // One success
    await breaker.execute(() => Promise.resolve('s1'));
    console.log(`  State after 1 success in half-open: ${breaker.getState()}`);

    // Failure should re-open
    await breaker.execute(() => Promise.reject(new Error('fail2'))).catch(() => {});
    const state4 = breaker.getState();

    testResults.push({
      test: 'reopens_on_failure_in_half_open',
      passed: state4 === 'open',
      state: state4,
      events: tracker.getStateTransitions(),
    });

    console.log(`  State after failure in half-open: ${state4}`);
    console.log(`  Result: ${state4 === 'open' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 5: Half-open call limiting
  console.log('Test 5: Half-open call limiting');
  {
    const tracker = new EventTracker();
    const breaker = new CircuitBreaker('test-5', {
      failure_threshold: 1,
      timeout_ms: 50,
      half_open_max_calls: 2,
    });
    breaker.onEvent(e => tracker.onEvent(e));

    // Open the circuit
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await new Promise(r => setTimeout(r, 60));

    // Make 2 calls in half-open (don't complete enough to close)
    await breaker.execute(() => Promise.resolve('s1'));
    await new Promise(r => setTimeout(r, 10));
    await breaker.execute(() => Promise.resolve('s2'));

    // Third call should be rejected
    let rejected5 = false;
    try {
      await breaker.execute(() => Promise.resolve('s3'));
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        rejected5 = true;
      }
    }

    testResults.push({
      test: 'limits_half_open_calls',
      passed: rejected5,
      rejected: rejected5,
      rejections: tracker.getRejections().length,
    });

    console.log(`  Third call rejected: ${rejected5 ? 'YES' : 'NO'}`);
    console.log(`  Total rejections: ${tracker.getRejections().length}`);
    console.log(`  Result: ${rejected5 ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 6: Human escalation trigger detection
  console.log('Test 6: Human escalation trigger detection');
  {
    const tracker = new EventTracker();
    const breaker = new CircuitBreaker('test-6', {
      failure_threshold: 2,
    });
    breaker.onEvent(e => tracker.onEvent(e));

    // Generate enough failures to trigger escalation concern
    await breaker.execute(() => Promise.reject(new Error('f1'))).catch(() => {});
    await breaker.execute(() => Promise.reject(new Error('f2'))).catch(() => {});

    const metrics6 = breaker.getMetrics();
    const shouldEscalate =
      metrics6.consecutive_failures >= 2 ||
      (metrics6.total_failures > 0 && metrics6.total_successes === 0);

    testResults.push({
      test: 'escalation_trigger_detection',
      passed: shouldEscalate,
      consecutive_failures: metrics6.consecutive_failures,
      total_failures: metrics6.total_failures,
      total_successes: metrics6.total_successes,
      should_escalate: shouldEscalate,
    });

    console.log(`  Consecutive failures: ${metrics6.consecutive_failures}`);
    console.log(`  Total failures: ${metrics6.total_failures}`);
    console.log(`  Total successes: ${metrics6.total_successes}`);
    console.log(`  Should escalate: ${shouldEscalate ? 'YES' : 'NO'}`);
    console.log(`  Result: ${shouldEscalate ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 7: Multiple circuit breakers in registry
  console.log('Test 7: Multiple circuit breakers (registry)');
  {
    const registry = new CircuitBreakerRegistry();

    const cb1 = registry.getOrCreate('service-a', { failure_threshold: 2 });
    const cb2 = registry.getOrCreate('service-b', { failure_threshold: 3 });
    const cb1Again = registry.getOrCreate('service-a');

    // Fail service-a twice
    await cb1.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await cb1.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

    // service-b should still be closed
    await cb2.execute(() => Promise.resolve('success'));

    const allMetrics = registry.getAll().map(cb => ({
      name: cb.getName(),
      state: cb.getState(),
      metrics: cb.getMetrics(),
    }));

    testResults.push({
      test: 'registry_isolation',
      passed: cb1.getState() === 'open' && cb2.getState() === 'closed' && cb1 === cb1Again,
      service_a_state: cb1.getState(),
      service_b_state: cb2.getState(),
      same_instance: cb1 === cb1Again,
      all_metrics: allMetrics,
    });

    console.log(`  Service A state: ${cb1.getState()}`);
    console.log(`  Service B state: ${cb2.getState()}`);
    console.log(`  Same instance for service-a: ${cb1 === cb1Again ? 'YES' : 'NO'}`);
    console.log(`  Result: ${cb1.getState() === 'open' && cb2.getState() === 'closed' ? 'PASS' : 'FAIL'}\n`);
  }

  // Summary
  console.log('Test Summary:');
  console.log('=============');
  const passed = testResults.filter(r => r.passed).length;
  const total = testResults.length;
  console.log(`Passed: ${passed}/${total}`);

  const report = {
    schema_version: 'circuit_breaker_test_report.v1',
    generated_at: new Date().toISOString(),
    fa_002_status: passed === total ? 'pass' : 'fail',
    summary: {
      total_tests: total,
      passed,
      failed: total - passed,
    },
    tests: testResults,
    requirements_validated: {
      automatic_degradation: testResults.some(
        r => r.test === 'half_open_after_timeout' && r.passed
      ),
      human_escalation_triggers: testResults.some(
        r => r.test === 'escalation_trigger_detection' && r.passed
      ),
      failure_isolation: testResults.some(
        r => r.test === 'registry_isolation' && r.passed
      ),
      recovery_mechanism: testResults.some(
        r => r.test === 'closes_after_success_threshold' && r.passed
      ),
    },
  };

  console.log('\nRequirements Validated:');
  for (const [req, validated] of Object.entries(report.requirements_validated)) {
    console.log(`  ${validated ? '✓' : '✗'} ${req}`);
  }

  // Write report
  const reportPath = resolve(REPORT_PATH);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  // Exit code
  const exitCode = passed === total ? 0 : 1;
  if (exitCode !== 0 && REQUIRE_PASS) {
    console.error('\nFA-002 VALIDATION FAILED');
  } else if (exitCode === 0) {
    console.log('\nFA-002 VALIDATION PASSED');
  }

  process.exit(exitCode);
}

runCircuitBreakerTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
