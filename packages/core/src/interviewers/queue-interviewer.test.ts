import { describe, expect, it } from 'vitest';
import type { HumanChoice } from '../handlers/builtin.js';
import { QueueInterviewer, createQueueInterviewer } from './queue-interviewer.js';

describe('QueueInterviewer', () => {
  const sampleChoices: HumanChoice[] = [
    { key: 'A', label: 'Approve', to: 'exit' },
    { key: 'R', label: 'Reject', to: 'revise' },
    { key: 'S', label: 'Skip', to: 'skip' },
  ];

  it('returns queued answers in order', async () => {
    const interviewer = new QueueInterviewer([
      { key: 'A' },
      { key: 'R' },
    ]);

    const first = await interviewer.ask('Question 1?', sampleChoices);
    expect(first).toBe('A');

    const second = await interviewer.ask('Question 2?', sampleChoices);
    expect(second).toBe('R');
  });

  it('returns first choice when queue is exhausted', async () => {
    const interviewer = new QueueInterviewer([{ key: 'A' }]);

    const first = await interviewer.ask('Question 1?', sampleChoices);
    expect(first).toBe('A');

    const second = await interviewer.ask('Question 2?', sampleChoices);
    expect(second).toBe('A'); // Falls back to first choice
  });

  it('returns empty string when queue exhausted and no choices', async () => {
    const interviewer = new QueueInterviewer([]);

    const answer = await interviewer.ask('Question?', []);
    expect(answer).toBe('');
  });

  it('returns first choice when answer key does not match any choice', async () => {
    const interviewer = new QueueInterviewer([{ key: 'X' }]); // X not in choices

    const answer = await interviewer.ask('Question?', sampleChoices);
    expect(answer).toBe('A'); // Falls back to first choice
  });

  it('tracks remaining answers correctly', async () => {
    const interviewer = new QueueInterviewer([
      { key: 'A' },
      { key: 'R' },
      { key: 'S' },
    ]);

    expect(interviewer.remaining()).toBe(3);
    expect(interviewer.hasMore()).toBe(true);

    await interviewer.ask('Q1?', sampleChoices);
    expect(interviewer.remaining()).toBe(2);

    await interviewer.ask('Q2?', sampleChoices);
    expect(interviewer.remaining()).toBe(1);

    await interviewer.ask('Q3?', sampleChoices);
    expect(interviewer.remaining()).toBe(0);
    expect(interviewer.hasMore()).toBe(false);
  });

  it('resets to beginning of queue', async () => {
    const interviewer = new QueueInterviewer([
      { key: 'A' },
      { key: 'R' },
    ]);

    await interviewer.ask('Q1?', sampleChoices);
    await interviewer.ask('Q2?', sampleChoices);

    interviewer.reset();

    expect(interviewer.remaining()).toBe(2);
    const answer = await interviewer.ask('Q1 again?', sampleChoices);
    expect(answer).toBe('A');
  });

  it('returns copy of answers', () => {
    const answers = [{ key: 'A' }, { key: 'R' }];
    const interviewer = new QueueInterviewer(answers);

    const copy = interviewer.getAnswers();
    expect(copy).toEqual(answers);
    expect(copy).not.toBe(answers); // Different array reference
  });

  describe('createQueueInterviewer helper', () => {
    it('creates interviewer from string array', async () => {
      const interviewer = createQueueInterviewer(['A', 'R', 'S']);

      expect(await interviewer.ask('Q1?', sampleChoices)).toBe('A');
      expect(await interviewer.ask('Q2?', sampleChoices)).toBe('R');
      expect(await interviewer.ask('Q3?', sampleChoices)).toBe('S');
    });
  });
});
