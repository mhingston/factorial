import type { ASTGraph } from './ast.js';

export function parse(input: string): ASTGraph;

export interface ParserLocationPosition {
  offset: number;
  line: number;
  column: number;
}

export interface ParserLocation {
  start: ParserLocationPosition;
  end: ParserLocationPosition;
  source?: unknown;
}

export class SyntaxError extends Error {
  location?: ParserLocation;
}
