import AsyncLock from 'async-lock';

/**
 * Steering message for mid-task intervention
 */
export interface SteeringMessage {
  content: string;
  timestamp: string;
  source: 'user' | 'system' | 'loop_detection';
}

/**
 * Thread-safe key-value context store for pipeline execution
 */
export class Context {
  private values: Map<string, unknown>;
  private logs: string[];
  private steeringQueue: SteeringMessage[];
  private lock: AsyncLock;

  constructor() {
    this.values = new Map();
    this.logs = [];
    this.steeringQueue = [];
    this.lock = new AsyncLock();
  }

  /**
   * Set a value in the context
   */
  async set(key: string, value: unknown): Promise<void> {
    await this.lock.acquire('values', () => {
      this.values.set(key, value);
    });
  }

  /**
   * Get a value from the context
   */
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    return await this.lock.acquire('values', () => {
      if (this.values.has(key)) {
        return this.values.get(key) as T;
      }
      return defaultValue;
    });
  }

  /**
   * Get a string value from the context
   */
  async getString(key: string, defaultValue = ''): Promise<string> {
    const value = await this.get(key);
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return String(value);
  }

  /**
   * Append an entry to the execution log
   */
  async appendLog(entry: string): Promise<void> {
    await this.lock.acquire('logs', () => {
      this.logs.push(entry);
    });
  }

  /**
   * Get all logs
   */
  async getLogs(): Promise<string[]> {
    return await this.lock.acquire('logs', () => [...this.logs]);
  }

  /**
   * Create a serializable snapshot of the context
   */
  snapshot(): Record<string, unknown> {
    // Note: This should be called when safe (e.g., between node executions)
    // as it doesn't acquire the lock for performance reasons
    return Object.fromEntries(this.values);
  }

  /**
   * Create a deep clone of the context for parallel branch isolation
   */
  clone(): Context {
    const newContext = new Context();
    
    // Deep clone values
    for (const [key, value] of this.values.entries()) {
      try {
        newContext.values.set(key, structuredClone(value));
      } catch {
        // If structuredClone fails, fall back to shallow copy
        newContext.values.set(key, value);
      }
    }
    
    // Copy logs
    newContext.logs = [...this.logs];
    
    // Copy steering queue
    newContext.steeringQueue = [...this.steeringQueue];
    
    return newContext;
  }

  /**
   * Apply multiple updates to the context
   */
  async apply_updates(updates: Record<string, unknown>): Promise<void> {
    await this.lock.acquire('values', () => {
      for (const [key, value] of Object.entries(updates)) {
        this.values.set(key, value);
      }
    });
  }

  /**
   * Queue a steering message for mid-task intervention.
   * The message will be injected before the next LLM call in codergen nodes.
   */
  async steer(content: string, source: 'user' | 'system' | 'loop_detection' = 'user'): Promise<void> {
    await this.lock.acquire('steering', () => {
      this.steeringQueue.push({
        content,
        timestamp: new Date().toISOString(),
        source,
      });
    });
  }

  /**
   * Drain all steering messages from the queue.
   * Returns and clears the queue atomically.
   */
  async drainSteeringQueue(): Promise<SteeringMessage[]> {
    return await this.lock.acquire('steering', () => {
      const messages = [...this.steeringQueue];
      this.steeringQueue = [];
      return messages;
    });
  }

  /**
   * Peek at steering queue without clearing (for inspection)
   */
  async peekSteeringQueue(): Promise<SteeringMessage[]> {
    return await this.lock.acquire('steering', () => {
      return [...this.steeringQueue];
    });
  }

  /**
   * Load context from a snapshot (used for checkpoint resume)
   */
  static fromSnapshot(snapshot: Record<string, unknown>): Context {
    const context = new Context();
    for (const [key, value] of Object.entries(snapshot)) {
      context.values.set(key, value);
    }
    return context;
  }

  /**
   * Get all keys in the context
   */
  async keys(): Promise<string[]> {
    return await this.lock.acquire('values', () => Array.from(this.values.keys()));
  }

  /**
   * Check if a key exists in the context
   */
  async has(key: string): Promise<boolean> {
    return await this.lock.acquire('values', () => this.values.has(key));
  }

  /**
   * Delete a key from the context
   */
  async delete(key: string): Promise<boolean> {
    return await this.lock.acquire('values', () => this.values.delete(key));
  }

  /**
   * Clear all values from the context
   */
  async clear(): Promise<void> {
    await this.lock.acquire('values', () => {
      this.values.clear();
    });
  }
}

export default Context;
