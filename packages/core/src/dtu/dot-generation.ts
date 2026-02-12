import { z } from 'zod';
import { applyModelStylesheet } from '../stylesheet/index.js';
import { createDefaultLintEngine, type Diagnostic, type LintContext } from '../lint/index.js';
import { HandlerRegistry } from '../handlers/registry.js';
import {
  CodergenHandler,
  ConfidenceGateHandler,
  ConditionalHandler,
  ExitHandler,
  FanInHandler,
  FailureAnalyzeHandler,
  JudgeRubricHandler,
  ManagerLoopHandler,
  ParallelHandler,
  QualityGateHandler,
  StartHandler,
  ToolHandler,
  WaitForHumanHandler,
} from '../handlers/builtin.js';
import type { Graph } from '../types/index.js';
import { parseDOT } from '../../../dot-parser/src/index.js';

export type DotAttributeValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | Array<unknown>;

export type DotAttributes = Record<string, DotAttributeValue>;

export interface DotNodeSpec {
  id: string;
  type?: string;
  shape?: string;
  label?: string;
  attributes?: DotAttributes;
}

export interface DotEdgeSpec {
  from: string;
  to: string;
  label?: string;
  condition?: string;
  attributes?: DotAttributes;
}

export interface DotGraphSpec {
  id: string;
  goal?: string;
  label?: string;
  rankdir?: string;
  attributes?: DotAttributes;
  nodes: DotNodeSpec[];
  edges: DotEdgeSpec[];
}

export interface DotLintResult {
  graph: Graph;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export interface DotModificationResult {
  status: 'applied' | 'rolled_back';
  previous_dot: string;
  candidate_dot: string;
  next_dot: string;
  graph: Graph;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export interface DotModificationSummary {
  modification_id: string;
  status: DotModificationResult['status'];
  graph_id: string;
  node_count: number;
  edge_count: number;
  error_count: number;
  warning_count: number;
  errors: Array<{
    code: string;
    message: string;
    node_id?: string;
    edge?: { from: string; to: string };
  }>;
}

export const selfModificationReportSchema = z.object({
  schema_version: z.literal('self_modification_report.v1'),
  generated_at: z.string().datetime(),
  summary: z.object({
    total_modifications: z.number().int().nonnegative(),
    applied: z.number().int().nonnegative(),
    rolled_back: z.number().int().nonnegative(),
    lint_errors: z.number().int().nonnegative(),
  }),
  modifications: z.array(
    z.object({
      modification_id: z.string().min(1),
      status: z.enum(['applied', 'rolled_back']),
      graph_id: z.string().min(1),
      node_count: z.number().int().nonnegative(),
      edge_count: z.number().int().nonnegative(),
      error_count: z.number().int().nonnegative(),
      warning_count: z.number().int().nonnegative(),
      errors: z.array(
        z.object({
          code: z.string().min(1),
          message: z.string().min(1),
          node_id: z.string().optional(),
          edge: z.object({ from: z.string(), to: z.string() }).optional(),
        })
      ),
    })
  ),
});

export type SelfModificationReport = z.infer<typeof selfModificationReportSchema>;

const DEFAULT_RANKDIR = 'LR';

function formatAttributeValue(value: DotAttributeValue): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '"0"';
  }
  if (typeof value === 'boolean') {
    return JSON.stringify(value ? 'true' : 'false');
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  return JSON.stringify(JSON.stringify(value));
}

function sortedAttributeEntries(attributes: DotAttributes = {}): Array<[string, DotAttributeValue]> {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort((left, right) => left[0].localeCompare(right[0]));
}

function renderInlineAttributes(attributes: DotAttributes = {}): string {
  const entries = sortedAttributeEntries(attributes);
  if (entries.length === 0) {
    return '';
  }
  const rendered = entries.map(([key, value]) => `${key}=${formatAttributeValue(value)}`).join(', ');
  return ` [${rendered}]`;
}

function renderBlockAttributes(attributes: DotAttributes = {}, indent = '  '): string {
  const entries = sortedAttributeEntries(attributes);
  if (entries.length === 0) {
    return '';
  }
  const rendered = entries.map(([key, value]) => `${indent}${key}=${formatAttributeValue(value)}`).join(',\n');
  return `[\n${rendered}\n${indent.slice(0, Math.max(indent.length - 2, 0))}]`;
}

function buildGraphAttributes(spec: DotGraphSpec): DotAttributes {
  const attributes: DotAttributes = {
    ...spec.attributes,
    rankdir: spec.rankdir ?? DEFAULT_RANKDIR,
  };
  if (spec.goal !== undefined) {
    attributes.goal = spec.goal;
  }
  if (spec.label !== undefined) {
    attributes.label = spec.label;
  }
  return attributes;
}

function createBuiltinHandlerRegistry(): HandlerRegistry {
  const registry = new HandlerRegistry();
  const codergen = new CodergenHandler();
  registry.register('start', new StartHandler());
  registry.register('exit', new ExitHandler());
  registry.register('codergen', codergen);
  registry.register('failure.analyze', new FailureAnalyzeHandler(codergen));
  registry.register('judge.rubric', new JudgeRubricHandler(codergen));
  registry.register('stack.observe', codergen);
  registry.register('stack.steer', codergen);
  registry.register('tool', new ToolHandler());
  registry.register('conditional', new ConditionalHandler());
  registry.register('confidence.gate', new ConfidenceGateHandler());
  registry.register('parallel', new ParallelHandler());
  registry.register('parallel.fan_in', new FanInHandler());
  registry.register('quality.gate', new QualityGateHandler());
  registry.register('stack.manager_loop', new ManagerLoopHandler());
  registry.register(
    'wait.human',
    new WaitForHumanHandler({
      ask: async (_question, choices) => choices[0]?.key ?? '',
    })
  );
  return registry;
}

export function generateDotGraph(spec: DotGraphSpec): string {
  const graphAttributes = renderInlineAttributes(buildGraphAttributes(spec));
  const lines: string[] = [`digraph ${spec.id} {`, `  graph${graphAttributes}`];

  const nodes = [...spec.nodes].sort((left, right) => left.id.localeCompare(right.id));
  for (const node of nodes) {
    const attributes: DotAttributes = {
      ...node.attributes,
    };
    if (node.shape !== undefined) {
      attributes.shape = node.shape;
    }
    if (node.type !== undefined) {
      attributes.type = node.type;
    }
    if (node.label !== undefined) {
      attributes.label = node.label;
    }
    const block = renderBlockAttributes(attributes, '    ');
    lines.push('');
    if (block) {
      lines.push(`  ${node.id} ${block}`);
    } else {
      lines.push(`  ${node.id}`);
    }
  }

  const edges = [...spec.edges].sort((left, right) => {
    const leftKey = `${left.from}->${left.to}`;
    const rightKey = `${right.from}->${right.to}`;
    return leftKey.localeCompare(rightKey);
  });
  for (const edge of edges) {
    const attributes: DotAttributes = {
      ...edge.attributes,
    };
    if (edge.label !== undefined) {
      attributes.label = edge.label;
    }
    if (edge.condition !== undefined) {
      attributes.condition = edge.condition;
    }
    lines.push(`  ${edge.from} -> ${edge.to}${renderInlineAttributes(attributes)}`);
  }

  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export function lintDotSource(source: string, context: LintContext = {}): DotLintResult {
  const graph = applyModelStylesheet(parseDOT(source)) as Graph;
  const lintEngine = createDefaultLintEngine();
  const diagnostics = lintEngine.run(graph, context);
  const errors = diagnostics.filter(diagnostic => diagnostic.level === 'error');
  const warnings = diagnostics.filter(diagnostic => diagnostic.level === 'warning');
  return { graph, diagnostics, errors, warnings };
}

export function preflightLintDotSource(source: string): DotLintResult {
  const handlerRegistry = createBuiltinHandlerRegistry();
  return lintDotSource(source, { handlerRegistry });
}

export function applyDotModification(
  previousDot: string,
  spec: DotGraphSpec
): DotModificationResult {
  const candidateDot = generateDotGraph(spec);
  let lintResult: DotLintResult;
  try {
    lintResult = preflightLintDotSource(candidateDot);
  } catch (error) {
    const fallbackGraph = applyModelStylesheet(parseDOT(previousDot)) as Graph;
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics: Diagnostic[] = [
      {
        level: 'error',
        code: 'DOT_PARSE_ERROR',
        message,
      },
    ];
    return {
      status: 'rolled_back',
      previous_dot: previousDot,
      candidate_dot: candidateDot,
      next_dot: previousDot,
      graph: fallbackGraph,
      diagnostics,
      errors: diagnostics,
      warnings: [],
    };
  }
  if (lintResult.errors.length > 0) {
    const fallbackGraph = applyModelStylesheet(parseDOT(previousDot)) as Graph;
    return {
      status: 'rolled_back',
      previous_dot: previousDot,
      candidate_dot: candidateDot,
      next_dot: previousDot,
      graph: fallbackGraph,
      diagnostics: lintResult.diagnostics,
      errors: lintResult.errors,
      warnings: lintResult.warnings,
    };
  }
  return {
    status: 'applied',
    previous_dot: previousDot,
    candidate_dot: candidateDot,
    next_dot: candidateDot,
    graph: lintResult.graph,
    diagnostics: lintResult.diagnostics,
    errors: lintResult.errors,
    warnings: lintResult.warnings,
  };
}

export function buildSelfModificationReport(
  modifications: DotModificationSummary[]
): SelfModificationReport {
  const applied = modifications.filter(entry => entry.status === 'applied').length;
  const rolledBack = modifications.filter(entry => entry.status === 'rolled_back').length;
  const lintErrors = modifications.reduce((sum, entry) => sum + entry.error_count, 0);
  return {
    schema_version: 'self_modification_report.v1',
    generated_at: new Date().toISOString(),
    summary: {
      total_modifications: modifications.length,
      applied,
      rolled_back: rolledBack,
      lint_errors: lintErrors,
    },
    modifications,
  };
}
