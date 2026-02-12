import { z } from 'zod';

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
};

export interface CodegenTarget {
  node_type: string;
  handler_name: string;
  description?: string;
  examples: unknown[];
}

export interface CodegenArtifact {
  node_type: string;
  handler_name: string;
  schema: JsonSchema;
  default_output: unknown;
  handler_source: string;
}

export const codegenValidationReportSchema = z.object({
  schema_version: z.literal('codegen_validation_report.v1'),
  generated_at: z.string().datetime(),
  summary: z.object({
    total_handlers: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  handlers: z.array(
    z.object({
      node_type: z.string().min(1),
      handler_name: z.string().min(1),
      status: z.enum(['pass', 'fail']),
      schema_path: z.string(),
      handler_path: z.string(),
      golden_match: z.boolean(),
      errors: z.array(z.string()),
    })
  ),
});

export type CodegenValidationReport = z.infer<typeof codegenValidationReportSchema>;

function uniqueTypes(types: string[]): string[] {
  return [...new Set(types)].sort((left, right) => left.localeCompare(right));
}

function mergeSchemas(left: JsonSchema, right: JsonSchema): JsonSchema {
  const leftTypes = left.type ? (Array.isArray(left.type) ? left.type : [left.type]) : [];
  const rightTypes = right.type ? (Array.isArray(right.type) ? right.type : [right.type]) : [];
  const combined = uniqueTypes([...leftTypes, ...rightTypes]);

  if (combined.length === 1 && combined[0] === 'object') {
    const leftProps = left.properties ?? {};
    const rightProps = right.properties ?? {};
    const keys = uniqueTypes([...Object.keys(leftProps), ...Object.keys(rightProps)]);
    const mergedProps: Record<string, JsonSchema> = {};
    for (const key of keys) {
      const l = leftProps[key];
      const r = rightProps[key];
      if (l && r) {
        mergedProps[key] = mergeSchemas(l, r);
      } else {
        mergedProps[key] = l ?? r ?? { type: 'string' };
      }
    }
    const leftRequired = new Set(left.required ?? []);
    const rightRequired = new Set(right.required ?? []);
    const required = keys.filter(key => leftRequired.has(key) && rightRequired.has(key));
    return {
      type: 'object',
      properties: mergedProps,
      required,
      additionalProperties: false,
    };
  }

  if (combined.length === 1 && combined[0] === 'array') {
    const leftItems = left.items ?? { type: 'string' };
    const rightItems = right.items ?? { type: 'string' };
    return {
      type: 'array',
      items: mergeSchemas(leftItems, rightItems),
    };
  }

  return {
    type: combined.length === 1 ? combined[0] : combined,
  };
}

function inferSchemaFromValue(value: unknown): JsonSchema {
  if (value === null) {
    return { type: 'null' };
  }
  if (Array.isArray(value)) {
    const itemSchema = value.length > 0 ? inferSchemaFromValue(value[0]) : { type: 'string' };
    return { type: 'array', items: itemSchema };
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
    const properties: Record<string, JsonSchema> = {};
    for (const key of keys) {
      properties[key] = inferSchemaFromValue(record[key]);
    }
    return {
      type: 'object',
      properties,
      required: keys,
      additionalProperties: false,
    };
  }
  if (typeof value === 'number') {
    return { type: 'number' };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean' };
  }
  return { type: 'string' };
}

export function generateSchemaFromExamples(examples: unknown[]): JsonSchema {
  if (examples.length === 0) {
    return { type: 'object', properties: {}, required: [], additionalProperties: false };
  }
  let schema = inferSchemaFromValue(examples[0]);
  for (const example of examples.slice(1)) {
    schema = mergeSchemas(schema, inferSchemaFromValue(example));
  }
  return schema;
}

function buildDefaultValue(schema: JsonSchema): unknown {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'object') {
    const props = schema.properties ?? {};
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(props).sort((left, right) => left.localeCompare(right))) {
      output[key] = buildDefaultValue(props[key]);
    }
    return output;
  }
  if (type === 'array') {
    return [];
  }
  if (type === 'number') {
    return 0;
  }
  if (type === 'boolean') {
    return false;
  }
  if (type === 'null') {
    return null;
  }
  return '';
}

export function generateHandlerSource(target: CodegenTarget, schema: JsonSchema): string {
  const defaultOutput = buildDefaultValue(schema);
  const schemaLiteral = JSON.stringify(schema, null, 2);
  const outputLiteral = JSON.stringify(defaultOutput, null, 2);
  return `import type { Context, Graph, Handler, Node, Outcome } from '../types/index.js';

export class ${target.handler_name} implements Handler {
  readonly node_type = '${target.node_type}';
  readonly schema = ${schemaLiteral};

  async execute(node: Node, _context: Context, _graph: Graph, _logsRoot: string): Promise<Outcome> {
    void node;
    return {
      status: 'SUCCESS',
      context_updates: {
        ['${target.node_type}.output']: ${outputLiteral},
      },
    };
  }
}
`;
}

export function generateCodegenArtifacts(targets: CodegenTarget[]): CodegenArtifact[] {
  return targets.map(target => {
    const schema = generateSchemaFromExamples(target.examples);
    const defaultOutput = buildDefaultValue(schema);
    const handlerSource = generateHandlerSource(target, schema);
    return {
      node_type: target.node_type,
      handler_name: target.handler_name,
      schema,
      default_output: defaultOutput,
      handler_source: handlerSource,
    };
  });
}
