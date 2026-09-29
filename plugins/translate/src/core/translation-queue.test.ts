import { describe, expect, test } from 'bun:test';
import { TranslationQueue } from './translation-queue';
import type { TranslationRequest } from './types';
const request = (key: string, priority: 'manual' | 'visible' = 'visible'): TranslationRequest => ({ key, channelId: 'c', messageId: key, originalText: 'hello', contentFingerprint: 'x', sourceLanguage: 'auto', targetLanguage: 'zh', providerId: 'fake', priority, requestSource: priority === 'manual' ? 'manual' : 'auto' });
const result = (key: string) => ({ key, translatedText: 'ok', sourceLanguage: 'en', targetLanguage: 'zh', providerId: 'fake', completedAt: 1 });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
describe('TranslationQueue', () => {
  test('manual work outranks visible work queued before start', async () => {
    const order: string[] = [];
    const queue = new TranslationQueue({ maxConcurrency: 1, requestsPerMinute: 99, execute: async (req) => { order.push(req.key); await sleep(1); return result(req.key); } });
    const visible = queue.enqueue(request('visible'));
    const manual = queue.enqueue(request('manual', 'manual'));
    queue.start(); await Promise.all([visible, manual]);
    expect(order).toEqual(['manual', 'visible']);
  });
  test('deduplicates the same key', async () => {
    let calls = 0;
    const queue = new TranslationQueue({ requestsPerMinute: 99, execute: async (req) => { calls++; return result(req.key); } });
    queue.start(); const a = queue.enqueue(request('same')); const b = queue.enqueue(request('same'));
    expect(a).toBe(b); await Promise.all([a, b]); expect(calls).toBe(1);
  });
  test('retries a retryable error at most once', async () => {
    let calls = 0;
    const queue = new TranslationQueue({ requestsPerMinute: 99, retryDelayMs: 1, execute: async (req) => { calls++; if (calls === 1) { const error = new Error('temporary') as Error & { retryable?: boolean }; error.retryable = true; throw error; } return result(req.key); } });
    queue.start(); await queue.enqueue(request('retry')); expect(calls).toBe(2);
  });
});
