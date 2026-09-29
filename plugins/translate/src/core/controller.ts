import { createTranslationKey } from './message-key';
import { getTranslationSettings } from './settings-store';
import { TranslationCache } from './translation-cache';
import { shouldTranslate } from './translation-policy';
import { TranslationQueue } from './translation-queue';
import { translationStore } from './translation-store';
import type { MessageIdentity, TranslationEntry, TranslationRequest } from './types';
import type { TranslationProvider } from '../provider/types';

export type RawMessage = Record<string, any>;

export function messageIdentityFromRaw(message: RawMessage): MessageIdentity | null {
  const channelId = message.channelId ?? message.channel_id;
  const messageId = message.id;
  const content = message.content;
  if (typeof channelId !== 'string' || typeof messageId !== 'string' || typeof content !== 'string') return null;
  return {
    channelId,
    messageId,
    content,
    editedTimestamp: message.editedTimestamp ?? message.edited_timestamp ?? null,
    authorId: typeof message.author?.id === 'string' ? message.author.id : undefined,
    bot: Boolean(message.author?.bot),
  };
}

export class TranslationController {
  readonly cache = new TranslationCache();
  readonly queue: TranslationQueue;
  private generation = 0;
  private running = false;

  constructor(
    readonly provider: TranslationProvider,
    private readonly getCurrentUserId: () => string | undefined = () => undefined,
  ) {
    this.queue = new TranslationQueue({
      maxConcurrency: 2,
      requestsPerMinute: 22,
      execute: (request) => this.provider.translate(request),
      onStart: (request) => translationStore.setState(request.key, 'translating'),
    });
  }

  start(): void {
    this.generation += 1;
    this.running = true;
    this.queue.start();
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    this.queue.stop();
    this.cache.clear();
    translationStore.clear();
  }

  getTranslationKeyForMessage(raw: RawMessage): string | null {
    const message = messageIdentityFromRaw(raw);
    if (!message) return null;
    const settings = getTranslationSettings();
    return createTranslationKey({
      channelId: message.channelId,
      messageId: message.messageId,
      text: message.content,
      targetLanguage: settings.targetLanguage,
      providerId: this.provider.id,
    }).key;
  }

  getEntryForMessage(raw: RawMessage): TranslationEntry | undefined {
    const key = this.getTranslationKeyForMessage(raw);
    return key ? translationStore.getEntry(key) : undefined;
  }

  observeVisibleMessage(raw: RawMessage): string | null {
    const message = messageIdentityFromRaw(raw);
    if (!message) return null;
    const settings = getTranslationSettings();
    const decision = shouldTranslate(message, settings, { currentUserId: this.getCurrentUserId() });
    if (!decision.eligible) return null;
    return this.ensureTranslation(message, 'visible', 'auto');
  }

  requestManual(raw: RawMessage): Promise<string | null> {
    const message = messageIdentityFromRaw(raw);
    if (!message) return Promise.resolve(null);
    const decision = shouldTranslate(message, getTranslationSettings(), { manual: true });
    if (!decision.eligible) return Promise.resolve(null);
    const key = this.ensureTranslation(message, 'manual', 'manual');
    if (!key) return Promise.resolve(null);
    const pending = this.queue.hasPending(key);
    if (!pending && translationStore.getEntry(key)?.state === 'ready') return Promise.resolve(key);
    return new Promise((resolve, reject) => {
      const unsubscribe = translationStore.subscribe(key, (entry) => {
        if (entry?.state === 'ready') {
          unsubscribe();
          resolve(key);
        } else if (entry?.state === 'error') {
          unsubscribe();
          reject(new Error(entry.error ?? 'Translation failed.'));
        }
      });
    });
  }

  retranslate(raw: RawMessage): Promise<string | null> {
    const message = messageIdentityFromRaw(raw);
    if (!message) return Promise.resolve(null);
    const key = this.getTranslationKeyForMessage(raw);
    if (key) {
      this.cache.delete(key);
      translationStore.patchEntry(key, { state: 'idle', translatedText: undefined, error: undefined, hidden: false });
    }
    return this.requestManual(raw);
  }

  hide(raw: RawMessage): void {
    const key = this.getTranslationKeyForMessage(raw);
    if (key) translationStore.setHidden(key, true);
  }

  show(raw: RawMessage): void {
    const key = this.getTranslationKeyForMessage(raw);
    if (key) translationStore.setHidden(key, false);
  }

  getTranslationForMessage(raw: RawMessage): string | undefined {
    return this.getEntryForMessage(raw)?.translatedText;
  }

  private ensureTranslation(
    message: MessageIdentity,
    priority: TranslationRequest['priority'],
    requestSource: TranslationRequest['requestSource'],
  ): string {
    const settings = getTranslationSettings();
    const { key, contentFingerprint } = createTranslationKey({
      channelId: message.channelId,
      messageId: message.messageId,
      text: message.content,
      targetLanguage: settings.targetLanguage,
      providerId: this.provider.id,
    });

    const cached = this.cache.get(key);
    const existing = translationStore.getEntry(key);
    if (cached) {
      if (!existing) translationStore.upsertEntry(this.makeEntry(message, key));
      translationStore.setReady(key, cached);
      return key;
    }
    if (existing?.state === 'ready' || this.queue.hasPending(key)) return key;
    if (existing?.state === 'error' && requestSource === 'auto') return key;

    translationStore.upsertEntry(existing ?? this.makeEntry(message, key));
    translationStore.setState(key, 'queued');

    const request: TranslationRequest = {
      key,
      channelId: message.channelId,
      messageId: message.messageId,
      originalText: message.content,
      contentFingerprint,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      providerId: this.provider.id,
      priority,
      requestSource,
    };

    const generation = this.generation;
    void this.queue.enqueue(request).then(
      (result) => {
        if (!this.running || generation !== this.generation) return;
        this.cache.set(result);
        translationStore.setReady(key, result);
      },
      (error) => {
        if (!this.running || generation !== this.generation) return;
        translationStore.setError(key, error);
      },
    );
    return key;
  }

  private makeEntry(message: MessageIdentity, key: string): TranslationEntry {
    const settings = getTranslationSettings();
    return {
      key,
      channelId: message.channelId,
      messageId: message.messageId,
      originalText: message.content,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      providerId: this.provider.id,
      state: 'idle',
      hidden: false,
      updatedAt: Date.now(),
    };
  }
}
