import type { HumanChoice, HumanInterviewer } from '../handlers/builtin.js';

export interface QueuedAnswer {
  key: string;
  label?: string;
}

/**
 * Queue Interviewer - replays pre-recorded answers for deterministic testing
 *
 * Use cases:
 * - Regression testing of workflows with human gates
 * - Deterministic CI/CD pipelines
 * - Replay from history
 * - Batch processing with pre-configured approvals
 */
export class QueueInterviewer implements HumanInterviewer {
  private readonly answers: QueuedAnswer[];
  private currentIndex = 0;

  constructor(answers: QueuedAnswer[]) {
    this.answers = [...answers];
  }

  async ask(_question: string, choices: HumanChoice[]): Promise<string> {
    const answer = this.answers[this.currentIndex];
    this.currentIndex += 1;

    if (answer === undefined) {
      // Queue exhausted - return first choice as fallback
      return choices[0]?.key ?? '';
    }

    // Validate the answer key exists in choices
    const matchingChoice = choices.find(c => c.key === answer.key);
    if (matchingChoice) {
      return matchingChoice.key;
    }

    // If answer doesn't match any choice, return first choice
    return choices[0]?.key ?? '';
  }

  /**
   * Check if there are more answers in the queue
   */
  hasMore(): boolean {
    return this.currentIndex < this.answers.length;
  }

  /**
   * Get remaining answers count
   */
  remaining(): number {
    return this.answers.length - this.currentIndex;
  }

  /**
   * Reset to start of queue
   */
  reset(): void {
    this.currentIndex = 0;
  }

  /**
   * Get a copy of all answers
   */
  getAnswers(): QueuedAnswer[] {
    return [...this.answers];
  }
}

/**
 * Create a QueueInterviewer from an array of answer keys
 */
export function createQueueInterviewer(answerKeys: string[]): QueueInterviewer {
  return new QueueInterviewer(answerKeys.map(key => ({ key })));
}
