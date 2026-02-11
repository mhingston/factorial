import type { Graph, Node } from '../types/index.js';

export type StylesheetSelectorType = 'all' | 'class' | 'id' | 'shape';

export interface StylesheetSelector {
  type: StylesheetSelectorType;
  value: string;
}

export interface StylesheetRule {
  selectors: StylesheetSelector[];
  declarations: Record<string, string>;
}

export class StylesheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StylesheetError';
  }
}

const ALLOWED_PROPERTIES = new Set(['llm_provider', 'llm_model', 'reasoning_effort']);

export function parseModelStylesheet(stylesheet: string): StylesheetRule[] {
  const trimmed = (stylesheet || '').trim();
  if (!trimmed) return [];

  const stripped = stripComments(trimmed);
  const rules: StylesheetRule[] = [];
  let cursor = 0;

  while (cursor < stripped.length) {
    cursor = skipWhitespace(stripped, cursor);
    if (cursor >= stripped.length) break;

    const openBrace = stripped.indexOf('{', cursor);
    if (openBrace === -1) {
      throw new StylesheetError('Stylesheet missing opening "{"');
    }

    const selectorText = stripped.slice(cursor, openBrace).trim();
    if (!selectorText) {
      throw new StylesheetError('Stylesheet rule missing selector');
    }

    const closeBrace = stripped.indexOf('}', openBrace + 1);
    if (closeBrace === -1) {
      throw new StylesheetError('Stylesheet rule missing closing "}"');
    }

    const bodyText = stripped.slice(openBrace + 1, closeBrace).trim();
    const selectors = parseSelectors(selectorText);
    const declarations = parseDeclarations(bodyText);

    rules.push({ selectors, declarations });
    cursor = closeBrace + 1;
  }

  return rules;
}

export function applyModelStylesheet(graph: Graph): Graph {
  const stylesheet = graph.model_stylesheet || '';
  if (!stylesheet.trim()) return graph;

  const rules = parseModelStylesheet(stylesheet);
  if (rules.length === 0) return graph;

  const explicitFlags = new Map<string, Record<string, boolean>>();

  for (const [id, node] of graph.nodes.entries()) {
    const attrs = node.attributes || {};
    explicitFlags.set(id, {
      llm_provider: Object.prototype.hasOwnProperty.call(attrs, 'llm_provider'),
      llm_model: Object.prototype.hasOwnProperty.call(attrs, 'llm_model'),
      reasoning_effort: Object.prototype.hasOwnProperty.call(attrs, 'reasoning_effort'),
    });
  }

  for (const rule of rules) {
    for (const [id, node] of graph.nodes.entries()) {
      if (!matchesSelectors(node, rule.selectors)) continue;
      const flags = explicitFlags.get(id);
      applyDeclarations(node, rule.declarations, flags);
    }
  }

  return graph;
}

function applyDeclarations(
  node: Node,
  declarations: Record<string, string>,
  flags?: Record<string, boolean>
): void {
  const isExplicit = flags ?? {
    llm_provider: Boolean(node.llm_provider),
    llm_model: Boolean(node.llm_model),
    reasoning_effort: Boolean(node.reasoning_effort),
  };

  for (const [key, value] of Object.entries(declarations)) {
    if (key === 'llm_provider' && !isExplicit.llm_provider) {
      node.llm_provider = value;
      node.attributes.llm_provider = value;
    }
    if (key === 'llm_model' && !isExplicit.llm_model) {
      node.llm_model = value;
      node.attributes.llm_model = value;
    }
    if (key === 'reasoning_effort' && !isExplicit.reasoning_effort) {
      node.reasoning_effort = value as Node['reasoning_effort'];
      node.attributes.reasoning_effort = value;
    }
  }
}

function parseSelectors(input: string): StylesheetSelector[] {
  return input.split(',').map(part => part.trim()).filter(Boolean).map(selector => {
    if (selector === '*') {
      return { type: 'all', value: '*' };
    }
    if (selector.startsWith('.')) {
      return { type: 'class', value: selector.slice(1) };
    }
    if (selector.startsWith('#')) {
      return { type: 'id', value: selector.slice(1) };
    }
    return { type: 'shape', value: selector };
  });
}

function parseDeclarations(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input) return result;

  const parts = input.split(';').map(part => part.trim()).filter(Boolean);
  for (const part of parts) {
    const separatorIndex = part.includes(':') ? part.indexOf(':') : part.indexOf('=');
    if (separatorIndex === -1) {
      throw new StylesheetError(`Invalid declaration "${part}"`);
    }
    const key = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!key || !rawValue) {
      throw new StylesheetError(`Invalid declaration "${part}"`);
    }
    if (!ALLOWED_PROPERTIES.has(key)) {
      throw new StylesheetError(`Unsupported property "${key}"`);
    }
    const value = stripQuotes(rawValue);
    if (key === 'reasoning_effort' && !['low', 'medium', 'high'].includes(value)) {
      throw new StylesheetError(`Invalid reasoning_effort "${value}"`);
    }
    result[key] = value;
  }

  return result;
}

function matchesSelectors(node: Node, selectors: StylesheetSelector[]): boolean {
  return selectors.some(selector => matchesSelector(node, selector));
}

function matchesSelector(node: Node, selector: StylesheetSelector): boolean {
  switch (selector.type) {
    case 'all':
      return true;
    case 'id':
      return node.id === selector.value;
    case 'class': {
      const classes = (node.class || '')
        .split(/[,\s]+/)
        .map(entry => entry.trim())
        .filter(Boolean);
      return classes.includes(selector.value);
    }
    case 'shape':
      return node.shape === selector.value || node.type === selector.value;
    default:
      return false;
  }
}

function stripComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function skipWhitespace(input: string, index: number): number {
  let i = index;
  while (i < input.length && /\s/.test(input[i])) {
    i += 1;
  }
  return i;
}
