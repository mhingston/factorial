{
  // Helper functions for building AST
  function buildGraph(type, id, statements) {
    const nodes = new Map();
    const edges = [];
    const attributes = {};
    
    // Default values from spec
    let graphAttrs = {
      default_max_retry: 50,
      default_fidelity: ''
    };
    
    function applyNodeDefaults(stmt, defaults, inheritedClass) {
      const mergedAttributes = { ...defaults, ...(stmt.attributes || {}) };
      const node = {
        type: 'node',
        id: stmt.id,
        shape: 'box',
        label: stmt.id,
        max_retries: 0,
        goal_gate: false,
        reasoning_effort: 'high',
        auto_status: false,
        allow_partial: false,
        ...defaults,
        ...stmt,
        attributes: mergedAttributes,
        outgoing: [],
      };
      if (inheritedClass) {
        const mergedClass = mergeClasses(node.class, inheritedClass);
        if (mergedClass) {
          node.class = mergedClass;
          node.attributes.class = mergedClass;
        }
      }
      return node;
    }
    
    function applyEdgeDefaults(edge, defaults) {
      const mergedAttributes = { ...defaults, ...(edge.attributes || {}) };
      return {
        type: 'edge',
        from: edge.from,
        to: edge.to,
        weight: 0,
        loop_restart: false,
        ...defaults,
        ...edge,
        attributes: mergedAttributes,
      };
    }
    
    function processStatements(stmts, nodeDefaults, edgeDefaults, inheritedClass, isSubgraph) {
      for (const stmt of stmts) {
        if (stmt.type === 'node') {
          const node = applyNodeDefaults(stmt, nodeDefaults, inheritedClass);
          nodes.set(node.id, node);
        } else if (stmt.type === 'edge') {
          for (const edge of stmt.edges) {
            edges.push(applyEdgeDefaults(edge, edgeDefaults));
          }
        } else if (stmt.type === 'graph_attr') {
          if (!isSubgraph) {
            Object.assign(graphAttrs, stmt.attrs);
          }
        } else if (stmt.type === 'node_defaults') {
          Object.assign(nodeDefaults, stmt.attrs);
        } else if (stmt.type === 'edge_defaults') {
          Object.assign(edgeDefaults, stmt.attrs);
        } else if (stmt.type === 'subgraph') {
          const subgraphClass = deriveSubgraphClass(stmt.statements);
          const combinedClass = mergeClasses(inheritedClass, subgraphClass);
          processStatements(stmt.statements, { ...nodeDefaults }, { ...edgeDefaults }, combinedClass, true);
        }
      }
    }
    
    processStatements(statements, {}, {}, null, false);
    
    // Post-process edges to connect nodes
    for (const edge of edges) {
      const fromNode = nodes.get(edge.from);
      if (fromNode) {
        fromNode.outgoing.push(edge);
      }
    }
    
    return {
      id: id || 'G',
      type,
      ...graphAttrs,
      nodes,
      edges,
      attributes: graphAttrs
    };
  }

  function deriveSubgraphClass(statements) {
    let label;
    for (const stmt of statements) {
      if (stmt.type === 'graph_attr' && stmt.attrs && stmt.attrs.label !== undefined) {
        label = stmt.attrs.label;
      }
    }
    if (label === undefined || label === null) {
      return null;
    }
    return slugifyLabel(String(label));
  }

  function slugifyLabel(value) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function mergeClasses(base, extra) {
    if (!extra) return base || '';
    if (!base) return extra;
    const set = new Set(
      base
        .split(/[,\s]+/)
        .map(entry => entry.trim())
        .filter(Boolean)
    );
    set.add(extra);
    return Array.from(set).join(' ');
  }

  function toMilliseconds(duration) {
    const multipliers = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };
    const multiplier = multipliers[duration.unit];
    return multiplier ? duration.value * multiplier : duration.value;
  }
  
  function normalizeAttributes(attrs) {
    const result = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (value && typeof value === 'object' && 'value' in value && 'unit' in value) {
        result[key] = toMilliseconds(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  
  function parseNodeAttributes(attrs) {
    const normalized = normalizeAttributes(attrs);
    const { type: _nodeType, ...rest } = normalized;
    const result = { ...rest, attributes: { ...normalized } };
    
    // Convert string values to appropriate types
    if (result.max_retries !== undefined) {
      result.max_retries = parseInt(result.max_retries, 10);
    }
    if (result.goal_gate !== undefined) {
      result.goal_gate = result.goal_gate === true || result.goal_gate === 'true';
    }
    if (result.auto_status !== undefined) {
      result.auto_status = result.auto_status === true || result.auto_status === 'true';
    }
    if (result.allow_partial !== undefined) {
      result.allow_partial = result.allow_partial === true || result.allow_partial === 'true';
    }
    
    return result;
  }
  
  function parseEdgeAttributes(attrs) {
    const normalized = normalizeAttributes(attrs);
    const result = { ...normalized, attributes: { ...normalized } };
    
    if (result.weight !== undefined) {
      result.weight = parseInt(result.weight, 10);
    }
    if (result.loop_restart !== undefined) {
      result.loop_restart = result.loop_restart === true || result.loop_restart === 'true';
    }
    
    return result;
  }
}

// Entry point
Graph
  = _ "strict"? _ type:GraphType _ id:Identifier? _ "{" _ stmts:Statement* _ "}" _ {
      return buildGraph(type, id, stmts.flat());
    }

GraphType
  = "digraph" { return 'digraph'; }

Statement
  = GraphAttrStmt
  / NodeDefaults
  / EdgeDefaults
  / SubgraphStmt
  / EdgeStmt
  / GraphAttrDecl
  / NodeStmt

GraphAttrStmt
  = _ "graph" _ attrs:AttrBlock _ ";"? {
      return { type: 'graph_attr', attrs };
    }

NodeDefaults
  = _ "node" _ attrs:AttrBlock _ ";"? {
      return { type: 'node_defaults', attrs: parseNodeAttributes(attrs).attributes };
    }

EdgeDefaults
  = _ "edge" _ attrs:AttrBlock _ ";"? {
      return { type: 'edge_defaults', attrs: parseEdgeAttributes(attrs).attributes };
    }

GraphAttrDecl
  = _ key:Identifier _ "=" _ value:Value _ ";"? {
      return { type: 'graph_attr', attrs: { [key]: value } };
    }

SubgraphStmt
  = _ "subgraph" _ id:Identifier? _ "{" _ stmts:Statement* _ "}" _ ";"? {
      return { type: 'subgraph', id, statements: stmts.flat() };
    }

NodeStmt
  = _ id:Identifier _ attrs:AttrBlock? _ ";"? {
      return [{
        type: 'node',
        id,
        ...parseNodeAttributes(attrs || {})
      }];
    }

EdgeStmt
  = _ nodes:NodeChain _ attrs:AttrBlock? _ ";"? {
      const edges = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({
          type: 'edge',
          from: nodes[i],
          to: nodes[i + 1],
          ...parseEdgeAttributes(attrs || {})
        });
      }
      return [{ type: 'edge', edges }];
    }

NodeChain
  = first:Identifier rest:(_ "->" _ Identifier)+ {
      return [first, ...rest.map(r => r[3])];
    }

AttrBlock
  = "[" _ attrs:AttrList? _ "]" {
      return attrs || {};
    }

AttrList
  = first:Attr rest:(_ "," _ Attr)* {
      const result = { ...first };
      for (const r of rest) {
        Object.assign(result, r[3]);
      }
      return result;
    }

Attr
  = key:Key _ "=" _ value:Value {
      return { [key]: value };
    }

Key
  = Identifier
  / QualifiedId

QualifiedId
  = parts:Identifier ("." Identifier)+ {
      return parts.join('.');
    }

Identifier
  = [A-Za-z_][A-Za-z0-9_]* {
      return text();
    }

Value
  = String
  / Duration
  / Boolean
  / Float
  / Integer
  / Identifier

String
  = '"' chars:StringChar* '"' {
      return chars.join('');
    }

StringChar
  = '\\"' { return '"'; }
  / '\\n' { return '\n'; }
  / '\\t' { return '\t'; }
  / '\\\\' { return '\\'; }
  / [^"\\]

Integer
  = [\-]? [0-9]+ {
      return parseInt(text(), 10);
    }

Float
  = [\-]? [0-9]* "." [0-9]+ {
      return parseFloat(text());
    }

Boolean
  = "true" { return true; }
  / "false" { return false; }

Duration
  = value:Integer unit:("ms" / "s" / "m" / "h" / "d") {
      return { value, unit };
    }

_ "whitespace"
  = (Whitespace / Comment)*

Whitespace
  = [ \t\n\r]

Comment
  = "//" (![\n\r] .)*
  / "/*" (!"*/" .)* "*/"
