import { parse, SyntaxError } from './parser.js';
import type { ASTGraph, ASTNode, ASTEdge } from './ast.js';
import type { ParsedGraph, ParsedNode, ParsedEdge } from './types.js';

export interface ParseOptions {
  sourceName?: string;
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

export class DOTParserError extends Error {
  readonly errors: ParseError[];

  constructor(message: string, errors: ParseError[] = []) {
    super(message);
    this.name = 'DOTParserError';
    this.errors = errors;
  }
}

const SHAPE_TO_TYPE: Record<string, string> = {
  Mdiamond: 'start',
  circle: 'start',
  Msquare: 'exit',
  doublecircle: 'exit',
  box: 'codergen',
  hexagon: 'wait.human',
  diamond: 'conditional',
  component: 'parallel',
  tripleoctagon: 'parallel.fan_in',
  parallelogram: 'tool',
  house: 'stack.manager_loop',
};

const DEFAULT_FIDELITY = 'compact';

function normalizeString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeAttributes(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value ? { ...value } : {};
}

function buildNode(astNode: ASTNode, graph: ASTGraph): ParsedNode {
  const attributes = normalizeAttributes(astNode.attributes);
  const shape = normalizeString(astNode.shape ?? attributes.shape) || 'box';
  const label = normalizeString(astNode.label ?? attributes.label) || astNode.id;
  const type =
    normalizeString(attributes.type) ??
    normalizeString(attributes.node_type) ??
    normalizeString(astNode.type === 'node' ? undefined : astNode.type) ??
    SHAPE_TO_TYPE[shape] ??
    'codergen';

  return {
    id: astNode.id,
    type,
    shape,
    label,
    prompt: normalizeString(astNode.prompt ?? attributes.prompt),
    max_retries: normalizeNumber(astNode.max_retries ?? attributes.max_retries) ?? 0,
    goal_gate: normalizeBoolean(astNode.goal_gate ?? attributes.goal_gate) ?? false,
    retry_target: normalizeString(astNode.retry_target ?? attributes.retry_target),
    fallback_retry_target: normalizeString(astNode.fallback_retry_target ?? attributes.fallback_retry_target),
    fidelity: normalizeString(astNode.fidelity ?? attributes.fidelity) || graph.default_fidelity || DEFAULT_FIDELITY,
    thread_id: normalizeString(astNode.thread_id ?? attributes.thread_id),
    class: normalizeString(astNode.class ?? attributes.class),
    timeout: normalizeNumber(astNode.timeout ?? attributes.timeout),
    llm_model: normalizeString(astNode.llm_model ?? attributes.llm_model),
    llm_provider: normalizeString(astNode.llm_provider ?? attributes.llm_provider),
    reasoning_effort: (normalizeString(astNode.reasoning_effort ?? attributes.reasoning_effort) ||
      'high') as ParsedNode['reasoning_effort'],
    auto_status: normalizeBoolean(astNode.auto_status ?? attributes.auto_status) ?? false,
    allow_partial: normalizeBoolean(astNode.allow_partial ?? attributes.allow_partial) ?? false,
    attributes,
  };
}

function buildEdge(astEdge: ASTEdge, graph: ASTGraph): ParsedEdge {
  const attributes = normalizeAttributes(astEdge.attributes);
  return {
    from: astEdge.from,
    to: astEdge.to,
    label: normalizeString(astEdge.label ?? attributes.label),
    condition: normalizeString(astEdge.condition ?? attributes.condition),
    weight: normalizeNumber(astEdge.weight ?? attributes.weight) ?? 0,
    fidelity: normalizeString(astEdge.fidelity ?? attributes.fidelity) || graph.default_fidelity || DEFAULT_FIDELITY,
    thread_id: normalizeString(astEdge.thread_id ?? attributes.thread_id),
    loop_restart: normalizeBoolean(astEdge.loop_restart ?? attributes.loop_restart) ?? false,
    attributes,
  };
}

export function parseDOT(input: string, _options: ParseOptions = {}): ParsedGraph {
  try {
    const ast = parse(input) as ASTGraph;
    const nodes = new Map<string, ParsedNode>();

    for (const [id, node] of ast.nodes.entries()) {
      nodes.set(id, buildNode(node, ast));
    }

    const edges = ast.edges.map(edge => buildEdge(edge, ast));

    return {
      id: ast.id,
      type: ast.type,
      goal: normalizeString(ast.goal),
      label: normalizeString(ast.label),
      model_stylesheet: normalizeString(ast.model_stylesheet),
      default_max_retry: normalizeNumber(ast.default_max_retry) ?? 50,
      retry_target: normalizeString(ast.retry_target),
      fallback_retry_target: normalizeString(ast.fallback_retry_target),
      default_fidelity: normalizeString(ast.default_fidelity) || DEFAULT_FIDELITY,
      nodes,
      edges,
      attributes: normalizeAttributes(ast.attributes),
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      const location = error.location?.start;
      const parseError: ParseError = {
        message: error.message,
        line: location?.line,
        column: location?.column,
      };
      throw new DOTParserError(error.message, [parseError]);
    }

    throw new DOTParserError(
      error instanceof Error ? error.message : 'Failed to parse DOT source'
    );
  }
}

export default parseDOT;
