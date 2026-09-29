import type { TranslationRequest, TranslationResult } from '../core/types';

export type TranslationLanguage = { code: string; name: string; nativeName?: string };

export type ProviderErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'SERVER'
  | 'INVALID_RESPONSE';

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: ProviderErrorCode,
    readonly retryable: boolean = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface TranslationProvider {
  readonly id: string;
  listLanguages(): Promise<TranslationLanguage[]>;
  translate(request: TranslationRequest): Promise<TranslationResult>;
  isConfigured(): boolean;
}
