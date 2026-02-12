import { z } from 'zod';

export const circuitBreakerStateSchema = z.enum(['closed', 'open', 'half_open']);
export type CircuitBreakerState = z.infer<typeof circuitBreakerStateSchema>;

export const circuitBreakerConfigSchema = z.object({
  failure_threshold: z.number().int().positive().default(5),
  success_threshold: z.number().int().positive().default(3),
  timeout_ms: z.number().int().positive().default(60000),
  half_open_max_calls: z.number().int().positive().default(3),
});

export type CircuitBreakerConfig = z.infer<typeof circuitBreakerConfigSchema>;

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failure_count: number;
  success_count: number;
  last_failure_time_ms: number | null;
  last_success_time_ms: number | null;
  total_calls: number;
  total_failures: number;
  total_successes: number;
  consecutive_successes: number;
  consecutive_failures: number;
}

export interface CircuitBreakerEvent {
  type: 'state_change' | 'failure' | 'success' | 'rejected';
  timestamp_ms: number;
  previous_state?: CircuitBreakerState;
  new_state?: CircuitBreakerState;
  error?: Error;
  context?: Record<string, unknown>;
}

export type CircuitBreakerEventHandler = (event: CircuitBreakerEvent) => void;

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failure_count = 0;
  private success_count = 0;
  private last_failure_time_ms: number | null = null;
  private last_success_time_ms: number | null = null;
  private total_calls = 0;
  private total_failures = 0;
  private total_successes = 0;
  private consecutive_successes = 0;
  private consecutive_failures = 0;
  private half_open_calls = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly eventHandlers: CircuitBreakerEventHandler[] = [];
  private readonly name: string;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = circuitBreakerConfigSchema.parse(config ?? {});
  }

  onEvent(handler: CircuitBreakerEventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emitEvent(event: CircuitBreakerEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  async execute<T>(
    operation: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half_open');
      } else {
        this.emitEvent({
          type: 'rejected',
          timestamp_ms: Date.now(),
          context,
        });
        throw new CircuitBreakerOpenError(
          `Circuit breaker '${this.name}' is OPEN and rejecting calls`,
          this.name,
          this.getMetrics()
        );
      }
    }

    if (this.state === 'half_open' && this.half_open_calls >= this.config.half_open_max_calls) {
      this.emitEvent({
        type: 'rejected',
        timestamp_ms: Date.now(),
        context,
      });
      throw new CircuitBreakerOpenError(
        `Circuit breaker '${this.name}' is HALF_OPEN and at max calls`,
        this.name,
        this.getMetrics()
      );
    }

    if (this.state === 'half_open') {
      this.half_open_calls++;
    }

    this.total_calls++;

    try {
      const result = await operation();
      this.onSuccess(context);
      return result;
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)), context);
      throw error;
    }
  }

  private onSuccess(context?: Record<string, unknown>): void {
    this.success_count++;
    this.total_successes++;
    this.consecutive_successes++;
    this.consecutive_failures = 0;
    this.last_success_time_ms = Date.now();

    this.emitEvent({
      type: 'success',
      timestamp_ms: this.last_success_time_ms,
      context,
    });

    if (this.state === 'half_open') {
      if (this.consecutive_successes >= this.config.success_threshold) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      this.failure_count = 0;
    }
  }

  private onFailure(error: Error, context?: Record<string, unknown>): void {
    this.failure_count++;
    this.total_failures++;
    this.consecutive_failures++;
    this.consecutive_successes = 0;
    this.last_failure_time_ms = Date.now();

    this.emitEvent({
      type: 'failure',
      timestamp_ms: this.last_failure_time_ms,
      error,
      context,
    });

    if (this.state === 'half_open') {
      this.transitionTo('open');
    } else if (this.state === 'closed' && this.failure_count >= this.config.failure_threshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const previousState = this.state;
    this.state = newState;

    if (newState === 'closed') {
      this.failure_count = 0;
      this.success_count = 0;
      this.half_open_calls = 0;
      this.consecutive_successes = 0;
      this.consecutive_failures = 0;
    } else if (newState === 'half_open') {
      this.half_open_calls = 0;
      this.consecutive_successes = 0;
      this.consecutive_failures = 0;
    }

    this.emitEvent({
      type: 'state_change',
      timestamp_ms: Date.now(),
      previous_state: previousState,
      new_state: newState,
    });
  }

  private shouldAttemptReset(): boolean {
    if (this.last_failure_time_ms === null) return true;
    return Date.now() - this.last_failure_time_ms >= this.config.timeout_ms;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failure_count: this.failure_count,
      success_count: this.success_count,
      last_failure_time_ms: this.last_failure_time_ms,
      last_success_time_ms: this.last_success_time_ms,
      total_calls: this.total_calls,
      total_failures: this.total_failures,
      total_successes: this.total_successes,
      consecutive_successes: this.consecutive_successes,
      consecutive_failures: this.consecutive_failures,
    };
  }

  getName(): string {
    return this.name;
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  forceOpen(): void {
    this.transitionTo('open');
  }

  forceClosed(): void {
    this.transitionTo('closed');
  }
}

export class CircuitBreakerOpenError extends Error {
  readonly circuitBreakerName: string;
  readonly metrics: CircuitBreakerMetrics;

  constructor(message: string, circuitBreakerName: string, metrics: CircuitBreakerMetrics) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.circuitBreakerName = circuitBreakerName;
    this.metrics = metrics;
  }
}

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceClosed();
    }
  }

  clear(): void {
    this.breakers.clear();
  }
}

export const globalCircuitBreakerRegistry = new CircuitBreakerRegistry();
