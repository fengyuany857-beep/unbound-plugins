import { describe, expect, test } from 'bun:test';
import { scoreRenderedTextCandidate } from './body-label-resolver';
describe('body label scoring', () => {
  test('prefers exact and markup-equivalent body text', () => {
    expect(scoreRenderedTextCandidate('hello world', 'hello world')).toBe(100);
    expect(scoreRenderedTextCandidate('hello world', '**hello world**')).toBe(92);
  });
  test('rejects unrelated labels', () => {
    expect(scoreRenderedTextCandidate('username', 'hello world')).toBe(0);
  });
});
