import type { Context, Graph, Handler, Node, Outcome } from '../types/index.js';

export class ConfidenceScoreHandler implements Handler {
  readonly node_type = 'confidence.score';
  readonly schema = {
  "type": "object",
  "properties": {
    "confidence": {
      "type": "number"
    },
    "signal_path": {
      "type": "string"
    }
  },
  "required": [
    "confidence",
    "signal_path"
  ],
  "additionalProperties": false
};

  async execute(node: Node, _context: Context, _graph: Graph, _logsRoot: string): Promise<Outcome> {
    void node;
    return {
      status: 'SUCCESS',
      context_updates: {
        ['confidence.score.output']: {
  "confidence": 0,
  "signal_path": ""
},
      },
    };
  }
}
