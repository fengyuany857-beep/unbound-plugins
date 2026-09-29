import type { TranslationResult } from './types';

export class TranslationCache {
  private readonly values = new Map<string, TranslationResult>();

  constructor(private readonly limit: number = 384) {}

  get(key: string): TranslationResult | undefined {
    const value = this.values.get(key);
    if (!value) return;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  set(result: TranslationResult): void {
    this.values.delete(result.key);
    this.values.set(result.key, result);
    while (this.values.size > this.limit) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  get size(): number {
    return this.values.size;
  }
}
