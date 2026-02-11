import type { Node, Handler, Outcome } from '../types/index.js';
import { SHAPE_TO_TYPE } from '../types/index.js';

/**
 * Registry for node handlers
 */
export class HandlerRegistry {
  private handlers: Map<string, Handler>;
  private defaultHandler: Handler;

  constructor() {
    this.handlers = new Map();
    this.defaultHandler = new DefaultHandler();
  }

  /**
   * Register a handler for a specific type
   */
  register(type: string, handler: Handler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Unregister a handler
   */
  unregister(type: string): boolean {
    return this.handlers.delete(type);
  }

  /**
   * Resolve which handler to use for a node
   */
  resolve(node: Node): Handler {
    // 1. Explicit type attribute takes highest priority
    if (node.type) {
      const handler = this.handlers.get(node.type);
      if (handler) {
        return handler;
      }
    }

    // 2. Shape-based resolution
    const handlerType = SHAPE_TO_TYPE[node.shape];
    if (handlerType) {
      const handler = this.handlers.get(handlerType);
      if (handler) {
        return handler;
      }
    }

    // 3. Default handler
    return this.defaultHandler;
  }

  /**
   * Get all registered handler types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a handler is registered
   */
  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Set the default handler
   */
  setDefault(handler: Handler): void {
    this.defaultHandler = handler;
  }
}

/**
 * Default handler that does nothing
 */
class DefaultHandler implements Handler {
  async execute(): Promise<Outcome> {
    return {
      status: 'SUCCESS',
      context_updates: {},
    };
  }
}

export default HandlerRegistry;
