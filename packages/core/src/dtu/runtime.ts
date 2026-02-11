import {
  type TwinError,
  type TwinInvocationRequest,
  type TwinInvocationResponse,
  twinInvocationRequestSchema,
  twinInvocationResponseSchema,
} from './contracts.js';

export interface TwinExecutionContext {
  now_ms(): number;
}

export type TwinInvocationResult =
  | {
      status: 'success';
      output: unknown;
      latency_ms?: number;
      metadata?: Record<string, unknown>;
    }
  | {
      status: 'error';
      error: TwinError;
      latency_ms?: number;
      metadata?: Record<string, unknown>;
    };

export interface TwinContract {
  readonly twin_id: string;
  readonly version: string;
  invoke(request: TwinInvocationRequest, context: TwinExecutionContext): Promise<TwinInvocationResult>;
}

export interface TwinRegistryBoundary {
  register(twin: TwinContract): void;
  listTwinIds(): string[];
}

export interface TwinRuntimeBoundary {
  invoke(request: TwinInvocationRequest): Promise<TwinInvocationResponse>;
}

export interface InMemoryTwinRuntimeOptions {
  now_ms?: () => number;
}

export class InMemoryTwinRuntime implements TwinRegistryBoundary, TwinRuntimeBoundary {
  private readonly twins = new Map<string, TwinContract>();
  private readonly now_ms: () => number;

  constructor(options: InMemoryTwinRuntimeOptions = {}) {
    this.now_ms = options.now_ms ?? (() => Date.now());
  }

  register(twin: TwinContract): void {
    if (this.twins.has(twin.twin_id)) {
      throw new Error(`Twin already registered: ${twin.twin_id}`);
    }
    this.twins.set(twin.twin_id, twin);
  }

  listTwinIds(): string[] {
    return [...this.twins.keys()].sort();
  }

  async invoke(request: TwinInvocationRequest): Promise<TwinInvocationResponse> {
    const parsedRequest = twinInvocationRequestSchema.parse(request);
    const twin = this.twins.get(parsedRequest.twin_id);

    if (!twin) {
      return twinInvocationResponseSchema.parse({
        twin_id: parsedRequest.twin_id,
        twin_version: 'unregistered',
        operation: parsedRequest.operation,
        status: 'error',
        output: null,
        error: {
          code: 'twin_not_found',
          class: 'not_found',
          message: `Twin is not registered: ${parsedRequest.twin_id}`,
          retryable: false,
          details: {},
        },
        timing: {
          started_at_ms: parsedRequest.timing.requested_at_ms,
          completed_at_ms: parsedRequest.timing.requested_at_ms,
          latency_ms: 0,
          deterministic: true,
        },
        metadata: { ...parsedRequest.metadata },
      });
    }

    const result = await twin.invoke(parsedRequest, {
      now_ms: this.now_ms,
    });

    const latency_ms = result.latency_ms ?? 0;
    const started_at_ms = parsedRequest.timing.requested_at_ms;
    const completed_at_ms = started_at_ms + latency_ms;
    const metadata = {
      ...parsedRequest.metadata,
      ...(result.metadata ?? {}),
    };

    if (result.status === 'success') {
      return twinInvocationResponseSchema.parse({
        twin_id: twin.twin_id,
        twin_version: twin.version,
        operation: parsedRequest.operation,
        status: 'success',
        output: result.output,
        error: null,
        timing: {
          started_at_ms,
          completed_at_ms,
          latency_ms,
          deterministic: true,
        },
        metadata,
      });
    }

    return twinInvocationResponseSchema.parse({
      twin_id: twin.twin_id,
      twin_version: twin.version,
      operation: parsedRequest.operation,
      status: 'error',
      output: null,
      error: result.error,
      timing: {
        started_at_ms,
        completed_at_ms,
        latency_ms,
        deterministic: true,
      },
      metadata,
    });
  }
}
