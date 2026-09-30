import { assets, metro, patcher, toasts } from '@unbound-app/api';
import type { TranslationController, RawMessage } from '../core/controller';
import {
  byokTranslationProvider,
  clearTranslationSession,
  configureDeepSeekSession,
} from '../provider/openai-compatible';

const Patcher = patcher.createPatcher('unbound.translate');
const BASE_KEY = 'unbound-translate';

type TreeNode = { type?: { name?: string; displayName?: string } | string; key?: unknown; props?: { children?: unknown; [prop: string]: unknown } } | null;

function typeName(node: TreeNode): string | null {
  const type = node?.type;
  if (typeof type === 'string') return type;
  return type?.name ?? type?.displayName ?? null;
}

function findInTree(node: unknown, predicate: (node: TreeNode) => boolean, depth = 0): TreeNode {
  if (depth > 15 || !node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) { const found = findInTree(child, predicate, depth + 1); if (found) return found; }
    return null;
  }
  const element = node as TreeNode;
  if (predicate(element)) return element;
  return findInTree(element?.props?.children, predicate, depth + 1);
}

function showNotice(title: string, content: string): void {
  try { toasts.showToast({ title, content }); }
  catch {
    const Alert = metro?.common?.ReactNative?.Alert;
    if (Alert && typeof Alert.alert === 'function') Alert.alert(title, content);
  }
}

function showError(error: unknown): void {
  showNotice('Translate Error', error instanceof Error ? error.message : String(error));
}

function closeSheet(host: { hideActionSheet?: (key: string) => void }, key: string | null): void {
  if (key) host.hideActionSheet?.(key);
}

async function readClipboardText(): Promise<string> {
  const common = metro?.common as Record<string, any> | undefined;
  const clipboard = common?.Clipboard ?? common?.clipboard;
  if (!clipboard || typeof clipboard.getString !== 'function') throw new Error('Clipboard read API is unavailable.');
  const value = await Promise.resolve(clipboard.getString());
  return typeof value === 'string' ? value.trim() : '';
}

async function configureDeepSeekFromClipboard(): Promise<void> {
  const apiKey = await readClipboardText();
  if (apiKey.length < 12) throw new Error('Clipboard does not look like an API key.');
  configureDeepSeekSession(apiKey);
  showNotice('DeepSeek', 'Session API key loaded. It will be forgotten when Discord exits.');
}

function showTranslated(controller: TranslationController, message: RawMessage): void {
  const translated = controller.getTranslationForMessage(message);
  if (translated) showNotice('DeepSeek Translation', translated);
  else showError(new Error('Translation finished but no text was available.'));
}

export function startMessageMenu(controller: TranslationController, inlineAvailable: boolean = false): void {
  if (typeof metro?.findByProps !== 'function') return;
  const sheetsHost = metro.findByProps('openLazy', 'hideActionSheet') as { openLazy?: (...args: unknown[]) => unknown; hideActionSheet?: (key: string) => void } | null;
  const ActionSheetRow = (metro.findByProps('ActionSheetRow') as { ActionSheetRow?: any } | null)?.ActionSheetRow;
  if (!sheetsHost?.openLazy || !ActionSheetRow) return;

  let currentMessage: RawMessage | null = null;
  let currentKey: string | null = null;
  const patchedInstances = new WeakSet<object>();

  Patcher.before(sheetsHost, 'openLazy', (ctx: any) => {
    const [componentPromise, key, extra] = ctx.args as [Promise<{ default?: unknown }> | undefined, unknown, { message?: RawMessage } | undefined];
    if (typeof key !== 'string' || !key.endsWith('MessageLongPressActionSheet') || !componentPromise?.then) return;
    if (extra?.message) currentMessage = extra.message;
    currentKey = key;
    componentPromise.then((instance) => {
      if (!instance || patchedInstances.has(instance)) return;
      patchedInstances.add(instance);
      Patcher.after(instance, 'default', ({ result }: { result: any }) => {
        const message = currentMessage;
        if (!message || typeof message.content !== 'string' || !message.content.trim()) return result;
        const rowGroup = findInTree(result, (node) => typeName(node) === 'ActionSheetRowGroup');
        const rows = rowGroup?.props?.children;
        if (!rowGroup?.props || !Array.isArray(rows)) return result;
        for (let index = rows.length - 1; index >= 0; index--) {
          const keyValue = (rows[index] as TreeNode)?.key;
          if (typeof keyValue === 'string' && keyValue.startsWith(BASE_KEY)) rows.splice(index, 1);
        }

        const iconId = assets.getIDByName('LanguageIcon') ?? assets.Icons?.LanguageIcon;
        const icon = iconId ? metro.common.React.createElement(ActionSheetRow.Icon, { source: iconId }) : undefined;
        const entry = controller.getEntryForMessage(message);
        const addRow = (suffix: string, label: string, action: () => void, disabled = false) => metro.common.React.createElement(ActionSheetRow, {
          key: `${BASE_KEY}-${suffix}`, label, icon, disabled,
          onPress: () => { closeSheet(sheetsHost, currentKey); action(); },
        });

        const injected: unknown[] = [];
        if (!byokTranslationProvider.isConfigured()) {
          injected.push(addRow('set-key', 'Set DeepSeek Key from Clipboard', () => void configureDeepSeekFromClipboard().catch(showError)));
        } else if (entry?.state === 'translating' || entry?.state === 'queued') {
          injected.push(addRow('pending', 'Translating with DeepSeek…', () => undefined, true));
        } else if (entry?.state === 'ready' && entry.translatedText) {
          injected.push(addRow('show-result', 'Show Translation', () => showTranslated(controller, message)));
          injected.push(addRow('retry', 'Re-translate (DeepSeek)', () => void controller.retranslate(message).then(() => showTranslated(controller, message)).catch(showError)));
          injected.push(addRow('copy', 'Copy Translation', () => {
            const common = metro?.common as Record<string, any> | undefined;
            const clipboard = common?.Clipboard ?? common?.clipboard;
            if (!clipboard || typeof clipboard.setString !== 'function') { showError(new Error('Clipboard API is unavailable.')); return; }
            void clipboard.setString(entry.translatedText ?? '');
          }));
          injected.push(addRow('replace-key', 'Replace DeepSeek Key from Clipboard', () => void configureDeepSeekFromClipboard().catch(showError)));
          injected.push(addRow('clear-key', 'Clear DeepSeek Session Key', () => {
            clearTranslationSession();
            showNotice('DeepSeek', 'Session API key cleared.');
          }));
        } else {
          injected.push(addRow('run', 'Translate (DeepSeek)', () => void controller.requestManual(message).then(() => showTranslated(controller, message)).catch(showError)));
          injected.push(addRow('replace-key', 'Replace DeepSeek Key from Clipboard', () => void configureDeepSeekFromClipboard().catch(showError)));
        }

        rows.splice(1, 0, ...injected);
        return result;
      });
    }).catch(() => undefined);
  });
}

export function stopMessageMenu(): void { Patcher.unpatchAll(); }
