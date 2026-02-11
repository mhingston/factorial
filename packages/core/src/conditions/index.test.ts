import { describe, expect, it } from 'vitest';
import { evaluateCondition, isConditionSyntaxValid } from './index.js';
import type { Outcome } from '../types/index.js';

const successOutcome: Outcome = { status: 'SUCCESS', context_updates: {} };
const failOutcome: Outcome = { status: 'FAIL', context_updates: {} };

describe('evaluateCondition', () => {
  it('handles outcome success/fail checks', () => {
    expect(evaluateCondition('outcome=success', successOutcome, {})).toBe(true);
    expect(evaluateCondition('outcome=fail', successOutcome, {})).toBe(false);
    expect(evaluateCondition('outcome!=success', failOutcome, {})).toBe(true);
  });

  it('handles context checks and conjunctions', () => {
    const context = { tests_passed: true };
    expect(evaluateCondition('context.tests_passed=true', successOutcome, context)).toBe(true);
    expect(
      evaluateCondition('outcome=success && context.tests_passed=true', successOutcome, context)
    ).toBe(true);
  });

  it('treats empty conditions as true', () => {
    expect(evaluateCondition('   ', successOutcome, {})).toBe(true);
  });

  it('validates condition syntax', () => {
    expect(isConditionSyntaxValid('outcome=success')).toBe(true);
    expect(isConditionSyntaxValid('context.tests_passed=true')).toBe(true);
    expect(isConditionSyntaxValid('foo=bar')).toBe(false);
  });
});
