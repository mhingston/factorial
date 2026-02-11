import { describe, expect, it } from 'vitest';
import { evaluateCondition, isConditionSyntaxValid } from './index.js';
import type { Outcome } from '../types/index.js';

const successOutcome: Outcome = { status: 'SUCCESS', context_updates: {} };
const failOutcome: Outcome = { status: 'FAIL', context_updates: {} };
const partialOutcome: Outcome = { status: 'PARTIAL_SUCCESS', context_updates: {} };

describe('evaluateCondition', () => {
  it('handles outcome success/fail checks', () => {
    expect(evaluateCondition('outcome=success', successOutcome, {})).toBe(true);
    expect(evaluateCondition('outcome=fail', successOutcome, {})).toBe(false);
    expect(evaluateCondition('outcome!=success', failOutcome, {})).toBe(true);
    expect(evaluateCondition('outcome=partial_success', partialOutcome, {})).toBe(true);
    expect(evaluateCondition('outcome<>fail', successOutcome, {})).toBe(true);
  });

  it('handles preferred_label checks', () => {
    const outcome: Outcome = {
      status: 'SUCCESS',
      preferred_label: 'Approve',
      context_updates: {},
    };
    expect(evaluateCondition("preferred_label='Approve'", outcome, {})).toBe(true);
    expect(evaluateCondition("preferred_label!='Reject'", outcome, {})).toBe(true);
  });

  it('handles context checks and conjunctions', () => {
    const context = {
      tests_passed: true,
      score: 95,
      nested: { result: 'ok' },
      'flat.path': 'flat-value',
      nullable: null,
    };
    expect(evaluateCondition('context.tests_passed=true', successOutcome, context)).toBe(true);
    expect(evaluateCondition('context.score=95', successOutcome, context)).toBe(true);
    expect(evaluateCondition("context.nested.result='ok'", successOutcome, context)).toBe(true);
    expect(evaluateCondition("context.flat.path='flat-value'", successOutcome, context)).toBe(true);
    expect(evaluateCondition("context.nullable!='value'", successOutcome, context)).toBe(true);
    expect(
      evaluateCondition('outcome=success && context.tests_passed=true', successOutcome, context)
    ).toBe(true);
  });

  it('treats empty conditions as true', () => {
    expect(evaluateCondition('   ', successOutcome, {})).toBe(true);
  });

  it('returns false for invalid clauses or unknown keys', () => {
    expect(evaluateCondition('bad clause', successOutcome, {})).toBe(false);
    expect(evaluateCondition('foo=bar', successOutcome, {})).toBe(false);
  });

  it('validates condition syntax', () => {
    expect(isConditionSyntaxValid('outcome=success')).toBe(true);
    expect(isConditionSyntaxValid('context.tests_passed=true')).toBe(true);
    expect(isConditionSyntaxValid("preferred_label='A' && outcome<>fail")).toBe(true);
    expect(isConditionSyntaxValid('foo=bar')).toBe(false);
    expect(isConditionSyntaxValid('context.tests_passed=')).toBe(false);
    expect(isConditionSyntaxValid('outcome')).toBe(false);
  });
});
