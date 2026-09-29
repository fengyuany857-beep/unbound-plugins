import type { TranslationEntry, TranslationResult, TranslationState } from './types';

type Listener = (entry: TranslationEntry | undefined) => void;
type GlobalListener = (key: string, entry: TranslationEntry | undefined) => void;

export class TranslationStore {
  private readonly entries = new Map<string, TranslationEntry>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly globalListeners = new Set<GlobalListener>();

  getEntry(key: string): TranslationEntry | undefined {
    return this.entries.get(key);
  }

  upsertEntry(entry: TranslationEntry): TranslationEntry {
    const next = { ...entry, updatedAt: Date.now() };
    this.entries.set(entry.key, next);
    this.emit(entry.key);
    return next;
  }

  patchEntry(key: string, patch: Partial<TranslationEntry>): TranslationEntry | undefined {
    const current = this.entries.get(key);
    if (!current) return;
    const next = { ...current, ...patch, key: current.key, updatedAt: Date.now() };
    this.entries.set(key, next);
    this.emit(key);
    return next;
  }

  setState(key: string, state: TranslationState): TranslationEntry | undefined {
    return this.patchEntry(key, { state, error: undefined });
  }

  setReady(key: string, result: TranslationResult): TranslationEntry | undefined {
    return this.patchEntry(key, {
      state: 'ready',
      translatedText: result.translatedText,
      error: undefined,
    });
  }

  setError(key: string, error: unknown): TranslationEntry | undefined {
    return this.patchEntry(key, {
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  setHidden(key: string, hidden: boolean): TranslationEntry | undefined {
    return this.patchEntry(key, { hidden });
  }

  remove(key: string): void {
    if (!this.entries.delete(key)) return;
    this.emit(key);
  }

  subscribe(key: string, listener: Listener): () => void {
    let group = this.listeners.get(key);
    if (!group) {
      group = new Set();
      this.listeners.set(key, group);
    }
    group.add(listener);
    return () => {
      group?.delete(listener);
      if (group?.size === 0) this.listeners.delete(key);
    };
  }

  subscribeAll(listener: GlobalListener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  clear(): void {
    const keys = [...this.entries.keys()];
    this.entries.clear();
    for (const key of keys) this.emit(key);
  }

  private emit(key: string): void {
    const entry = this.entries.get(key);
    for (const listener of this.listeners.get(key) ?? []) listener(entry);
    for (const listener of this.globalListeners) listener(key, entry);
  }
}

export const translationStore = new TranslationStore();
