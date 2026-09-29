import { storage } from '@unbound-app/api';
import type { TranslationRequest, TranslationResult } from '../core/types';
import { ProviderError, type TranslationLanguage, type TranslationProvider } from './types';

export const DEFAULT_API_BASE_URL = 'https://translate.unbound.rip';
const TOKEN_SKEW_MS = 15_000;
const REQUEST_TIMEOUT_MS = 12_000;
const STORE = storage.getStore('unbound.translate');

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type TranslationResponse =
  | { translatedText?: string }
  | { translations?: Array<{ text?: string; translatedText?: string }> };

const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycanca' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'en', name: 'English' },
  { code: 'eo', name: 'Esperanto' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
].sort((left, right) => left.name.localeCompare(right.name));

function readTokens(): SessionTokens | null {
  const accessToken = STORE.get('accessToken', '');
  const refreshToken = STORE.get('refreshToken', '');
  const expiresAt = STORE.get('expiresAt', 0);
  if (!accessToken || !refreshToken || !expiresAt) return null;
  return { accessToken, refreshToken, expiresAt };
}

function writeTokens(tokens: SessionTokens): void {
  STORE.set('accessToken', tokens.accessToken);
  STORE.set('refreshToken', tokens.refreshToken);
  STORE.set('expiresAt', tokens.expiresAt);
}

export function storeSessionTokens(tokens: SessionTokens): void { writeTokens(tokens); }
export function hasRefreshToken(): boolean {
  return typeof STORE.get('refreshToken', '') === 'string' && STORE.get('refreshToken', '').length > 0;
}
export function clearTokens(): void {
  STORE.remove('accessToken');
  STORE.remove('refreshToken');
  STORE.remove('expiresAt');
}
export function getApiBaseUrlSetting(): string { return STORE.get('apiBaseUrl', DEFAULT_API_BASE_URL); }
export function setApiBaseUrl(url: string): void { STORE.set('apiBaseUrl', url.trim() || DEFAULT_API_BASE_URL); }

async function refreshSessionTokens(): Promise<SessionTokens> {
  const refreshToken = STORE.get('refreshToken', '');
  if (!refreshToken) throw new ProviderError('No refresh token configured.', 'AUTH_REQUIRED');
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrlSetting()}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
    });
  } catch (error) {
    throw new ProviderError(error instanceof Error ? error.message : 'Auth refresh network failure.', 'NETWORK', true);
  }
  if (!response.ok) {
    if (response.status === 401) clearTokens();
    const reason = await response.text().catch(() => 'refresh failed');
    throw new ProviderError(`Auth refresh failed (${response.status}): ${reason}`, 'AUTH_FAILED', false, response.status);
  }
  const data = await response.json() as { accessToken?: string; refreshToken?: string; expiresIn?: number };
  if (!data.accessToken || !data.refreshToken || typeof data.expiresIn !== 'number') {
    throw new ProviderError('Auth refresh returned an invalid payload.', 'INVALID_RESPONSE');
  }
  const next = { accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: Date.now() + data.expiresIn * 1000 };
  writeTokens(next);
  return next;
}

async function getValidAccessToken(): Promise<string> {
  const current = readTokens();
  if (current && current.expiresAt - TOKEN_SKEW_MS > Date.now()) return current.accessToken;
  return (await refreshSessionTokens()).accessToken;
}

async function requestWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    return await fetch(url, { ...init, signal: controller?.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Translation network failure.';
    throw new ProviderError(message, 'NETWORK', true);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function translatedTextFromPayload(data: TranslationResponse): string | null {
  if ('translatedText' in data && typeof data.translatedText === 'string') return data.translatedText;
  if ('translations' in data && Array.isArray(data.translations) && data.translations.length > 0) {
    const first = data.translations[0];
    if (typeof first?.translatedText === 'string') return first.translatedText;
    if (typeof first?.text === 'string') return first.text;
  }
  return null;
}

export class UnboundTranslationProvider implements TranslationProvider {
  readonly id = 'unbound';

  isConfigured(): boolean { return hasRefreshToken(); }
  async listLanguages(): Promise<TranslationLanguage[]> { return TRANSLATION_LANGUAGES; }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!request.originalText.trim()) throw new ProviderError('Message is empty.', 'INVALID_RESPONSE');
    const requestBody = { q: request.originalText, source: request.sourceLanguage, target: request.targetLanguage };
    const requestOnce = async (token: string) => requestWithTimeout(`${getApiBaseUrlSetting()}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(requestBody),
    });

    let token = await getValidAccessToken();
    let response = await requestOnce(token);
    if (response.status === 401) {
      token = (await refreshSessionTokens()).accessToken;
      response = await requestOnce(token);
    }
    if (!response.ok) {
      const reason = await response.text().catch(() => 'translation failed');
      if (response.status === 429) throw new ProviderError(`Rate limited: ${reason}`, 'RATE_LIMITED', true, 429);
      if (response.status >= 500) throw new ProviderError(`Translation server failed (${response.status}): ${reason}`, 'SERVER', true, response.status);
      if (response.status === 401 || response.status === 403) throw new ProviderError(`Authorization failed (${response.status}).`, 'AUTH_FAILED', false, response.status);
      throw new ProviderError(`Translate failed (${response.status}): ${reason}`, 'SERVER', false, response.status);
    }
    let data: TranslationResponse;
    try { data = await response.json() as TranslationResponse; }
    catch { throw new ProviderError('Translation API returned invalid JSON.', 'INVALID_RESPONSE'); }
    const translatedText = translatedTextFromPayload(data);
    if (!translatedText) throw new ProviderError('Translation API returned an unexpected payload.', 'INVALID_RESPONSE');
    return {
      key: request.key,
      translatedText,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      providerId: this.id,
      completedAt: Date.now(),
    };
  }
}

export const unboundTranslationProvider = new UnboundTranslationProvider();
export async function listLanguages(): Promise<TranslationLanguage[]> { return unboundTranslationProvider.listLanguages(); }
