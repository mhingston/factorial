import type { Context, Graph, Handler, Node, Outcome } from '../types/index.js';

export class HttpRequestHandler implements Handler {
  readonly node_type = 'tool.http_request';
  readonly schema = {
  "type": "object",
  "properties": {
    "method": {
      "type": "string"
    },
    "timeout_ms": {
      "type": "number"
    },
    "url": {
      "type": "string"
    }
  },
  "required": [
    "method",
    "url"
  ],
  "additionalProperties": false
};

  async execute(node: Node, _context: Context, _graph: Graph, _logsRoot: string): Promise<Outcome> {
    void node;
    return {
      status: 'SUCCESS',
      context_updates: {
        ['tool.http_request.output']: {
  "method": "",
  "timeout_ms": 0,
  "url": ""
},
      },
    };
  }
}
