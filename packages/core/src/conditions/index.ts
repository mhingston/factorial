import type { Outcome } from '../types/index.js';

export type ConditionContext = Record<string, unknown>;

type Operator = '=' | '!=' | '<>';

export function evaluateCondition(
  condition: string,
  outcome: Outcome,
  context: ConditionContext
): boolean {
  const trimmed = condition.trim();
  if (!trimmed) return true;

  const clauses = trimmed.split('&&').map(clause => clause.trim()).filter(Boolean);
  return clauses.every(clause => evaluateClause(clause, outcome, context));
}

export function isConditionSyntaxValid(condition: string): boolean {
  const trimmed = condition.trim();
  if (!trimmed) return true;

  const clauses = trimmed.split('&&').map(clause => clause.trim()).filter(Boolean);
  return clauses.every(clause => {
    const match = clause.match(/^([a-zA-Z0-9_.]+)\s*(=|!=|<>)\s*(.+)$/);
    if (!match) return false;
    const key = match[1].trim();
    if (key !== 'outcome' && key !== 'preferred_label' && !key.startsWith('context.')) {
      return false;
    }
    const literal = match[3].trim();
    return literal.length > 0;
  });
}

function evaluateClause(clause: string, outcome: Outcome, context: ConditionContext): boolean {
  const match = clause.match(/^([a-zA-Z0-9_.]+)\s*(=|!=|<>)\s*(.+)$/);
  if (!match) return false;

  const [, rawKey, operator, rawLiteral] = match as [string, string, Operator, string];
  const key = rawKey.trim();
  const literal = parseLiteral(rawLiteral.trim());

  if (key === 'outcome') {
    return compareOutcome(outcome.status, literal, operator);
  }

  if (key === 'preferred_label') {
    return compareValues(outcome.preferred_label, literal, operator);
  }

  if (key.startsWith('context.')) {
    const contextKey = key.slice('context.'.length);
    const actual = resolveContextValue(context, contextKey);
    return compareValues(actual, literal, operator);
  }

  return false;
}

function parseLiteral(raw: string): unknown {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) return numeric;

  return trimmed;
}

function resolveContextValue(context: ConditionContext, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(context, path)) {
    return context[path];
  }

  const segments = path.split('.');
  let current: unknown = context;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function compareOutcome(actual: string, literal: unknown, operator: Operator): boolean {
  const normalizedLiteral = typeof literal === 'string' ? literal.toLowerCase() : literal;
  let matches = false;

  if (normalizedLiteral === 'success') {
    matches = actual === 'SUCCESS' || actual === 'PARTIAL_SUCCESS';
  } else if (normalizedLiteral === 'fail') {
    matches = actual === 'FAIL';
  } else if (normalizedLiteral === 'partial_success') {
    matches = actual === 'PARTIAL_SUCCESS';
  } else {
    matches = compareValues(actual, literal, '=');
  }

  return operator === '!=' || operator === '<>' ? !matches : matches;
}

function compareValues(actual: unknown, expected: unknown, operator: Operator): boolean {
  const isEqual = valuesEqual(actual, expected);
  return operator === '!=' || operator === '<>' ? !isEqual : isEqual;
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return actual === expected;
  }
  if (typeof actual === 'boolean' && typeof expected === 'boolean') {
    return actual === expected;
  }
  if (actual === undefined || actual === null) {
    return expected === undefined || expected === null;
  }
  return String(actual) === String(expected);
}
