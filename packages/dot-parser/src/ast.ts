/**
 * AST type definitions for DOT parser
 */

export interface ASTNode {
  type: 'node';
  id: string;
  shape?: string;
  label?: string;
  prompt?: string;
  max_retries?: number;
  goal_gate?: boolean;
  retry_target?: string;
  fallback_retry_target?: string;
  fidelity?: string;
  thread_id?: string;
  class?: string;
  timeout?: number;
  llm_model?: string;
  llm_provider?: string;
  reasoning_effort?: string;
  auto_status?: boolean;
  allow_partial?: boolean;
  outgoing?: ASTEdge[];
  attributes: Record<string, unknown>;
}

export interface ASTEdge {
  type: 'edge';
  from: string;
  to: string;
  label?: string;
  condition?: string;
  weight?: number;
  fidelity?: string;
  thread_id?: string;
  loop_restart?: boolean;
  attributes: Record<string, unknown>;
}

export interface ASTGraphAttr {
  type: 'graph_attr';
  attrs: Record<string, unknown>;
}

export interface ASTNodeDefaults {
  type: 'node_defaults';
  attrs: Record<string, unknown>;
}

export interface ASTEdgeDefaults {
  type: 'edge_defaults';
  attrs: Record<string, unknown>;
}

export interface ASTSubgraph {
  type: 'subgraph';
  id?: string;
  statements: ASTStatement[];
}

export interface ASTEdgeStatement {
  type: 'edge';
  edges: ASTEdge[];
}

export type ASTStatement = 
  | ASTNode
  | ASTEdgeStatement
  | ASTGraphAttr
  | ASTNodeDefaults
  | ASTEdgeDefaults
  | ASTSubgraph;

export interface ASTGraph {
  id: string;
  type: 'digraph';
  goal?: string;
  label?: string;
  model_stylesheet?: string;
  default_max_retry: number;
  retry_target?: string;
  fallback_retry_target?: string;
  default_fidelity?: string;
  nodes: Map<string, ASTNode>;
  edges: ASTEdge[];
  attributes: Record<string, unknown>;
}
