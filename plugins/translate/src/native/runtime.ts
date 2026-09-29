import { metro } from '@unbound-app/api';
import type { NativeFabricBridge, NativeObjCBridge, PluginContext } from '@unbound-app/api/native';

type AnyRecord = Record<string, any>;
type MetroModule = { isInitialized?: boolean; publicModule?: { exports?: unknown } };

export type MessageStore = {
  getMessage?: (channelId: string, messageId: string) => AnyRecord | null;
  getLastMessage?: (channelId: string) => AnyRecord | null;
};

export type TranslationRuntime = {
  objc: NativeObjCBridge | null;
  fabric: NativeFabricBridge | null;
  messageStore: MessageStore | null;
  currentUserStore: { getCurrentUser?: () => AnyRecord | null } | null;
  selectedChannel: { getChannelId?: () => string | undefined; getLastSelectedChannelId?: () => string | undefined } | null;
  moduleListenerCleanup: (() => boolean) | null;
};

function captureStore(runtime: TranslationRuntime, candidate: unknown): void {
  if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) return;
  const value = candidate as AnyRecord;
  if (!runtime.messageStore && value._dispatcher && typeof value.getName === 'function' && value.getName() === 'MessageStore' && typeof value.getMessage === 'function') {
    runtime.messageStore = value as MessageStore;
  }
  if (!runtime.currentUserStore && value._dispatcher && typeof value.getName === 'function' && value.getName() === 'UserStore' && typeof value.getCurrentUser === 'function') {
    runtime.currentUserStore = value;
  }
}

function captureLoadedModule(runtime: TranslationRuntime, module: unknown): void {
  if (!module || (typeof module !== 'object' && typeof module !== 'function')) return;
  const exports = module as AnyRecord;
  captureStore(runtime, exports);
  captureStore(runtime, exports.default);
}

function captureInitializedModules(runtime: TranslationRuntime): void {
  const windowValue = (globalThis as AnyRecord).window as AnyRecord | undefined;
  const modules = windowValue?.modules as Map<number, MetroModule> | undefined;
  if (!modules) return;
  for (const [, module] of modules) {
    if (!module.isInitialized) continue;
    captureLoadedModule(runtime, module.publicModule?.exports);
    if (runtime.messageStore && runtime.currentUserStore) break;
  }
}

export function initializeRuntime(context?: PluginContext): TranslationRuntime {
  const runtime: TranslationRuntime = {
    objc: context?.native.objc ?? null,
    fabric: context?.native.fabric ?? null,
    messageStore: null,
    currentUserStore: null,
    selectedChannel: null,
    moduleListenerCleanup: null,
  };

  try { runtime.messageStore = metro.findStore('MessageStore', { short: false }) as MessageStore; } catch {}
  try { runtime.currentUserStore = metro.findStore('UserStore', { short: false }) as any; } catch {}
  try { runtime.selectedChannel = metro.findByProps('getLastSelectedChannelId', 'getChannelId') as any; } catch {}

  captureInitializedModules(runtime);
  if (!runtime.messageStore || !runtime.currentUserStore) {
    runtime.moduleListenerCleanup = metro.addListener((module: unknown) => captureLoadedModule(runtime, module));
  }
  return runtime;
}

export function currentUserId(runtime: TranslationRuntime): string | undefined {
  const user = runtime.currentUserStore?.getCurrentUser?.();
  return typeof user?.id === 'string' ? user.id : undefined;
}

export function disposeRuntime(runtime: TranslationRuntime): void {
  runtime.moduleListenerCleanup?.();
  runtime.moduleListenerCleanup = null;
  runtime.messageStore = null;
  runtime.currentUserStore = null;
  runtime.selectedChannel = null;
  runtime.objc = null;
  runtime.fabric = null;
}
