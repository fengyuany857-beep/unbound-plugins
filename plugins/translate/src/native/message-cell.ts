import type { NativeObjectHandle } from '@unbound-app/api/native';
import type { TranslationRuntime } from './runtime';

const MAX_NATIVE_VIEW_DEPTH = 10;
export type NativeMessageInfo = { channelId?: string; messageId: string };

export function nativeCall(runtime: TranslationRuntime, handle: NativeObjectHandle, selector: string, ...args: unknown[]): unknown {
  if (!runtime.objc) return null;
  try { return runtime.objc.invoke(handle, selector, args, { thread: 'main' }); }
  catch { return null; }
}

export function stringFromNative(runtime: TranslationRuntime, value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!runtime.objc || !value || typeof value !== 'object') return;
  const handle = value as NativeObjectHandle;
  if (!runtime.objc.respondsTo(handle, 'description')) return;
  const description = nativeCall(runtime, handle, 'description');
  return typeof description === 'string' ? description : undefined;
}

export function nativeChildren(runtime: TranslationRuntime, handle: NativeObjectHandle): NativeObjectHandle[] {
  if (!runtime.objc) return [];
  const subviews = nativeCall(runtime, handle, 'subviews');
  if (Array.isArray(subviews)) return subviews as NativeObjectHandle[];
  if (!subviews || typeof subviews !== 'object') return [];
  try { return runtime.objc.array(subviews as NativeObjectHandle); }
  catch { return []; }
}

export function cellKey(runtime: TranslationRuntime, cell: NativeObjectHandle): string | undefined {
  const hash = nativeCall(runtime, cell, 'hash');
  if (hash !== null && hash !== undefined) return String(hash);
  const description = nativeCall(runtime, cell, 'description');
  return typeof description === 'string' ? description : undefined;
}

export function messageInfoForCell(runtime: TranslationRuntime, cell: NativeObjectHandle): NativeMessageInfo | undefined {
  if (!runtime.objc) return;
  try {
    const viewModel = runtime.objc.getIvar(cell, 'viewModel') as NativeObjectHandle | null;
    if (!viewModel || !runtime.objc.respondsTo(viewModel, 'message')) return;
    const message = nativeCall(runtime, viewModel, 'message') as NativeObjectHandle | null;
    if (!message) return;
    const messageId = stringFromNative(runtime, nativeCall(runtime, message, 'id'));
    if (!messageId) return;
    const channel = nativeCall(runtime, message, 'channel');
    const channelId = stringFromNative(runtime, nativeCall(runtime, message, 'channelId'))
      ?? stringFromNative(runtime, nativeCall(runtime, message, 'channel_id'))
      ?? (channel && typeof channel === 'object' ? stringFromNative(runtime, nativeCall(runtime, channel as NativeObjectHandle, 'id')) : undefined);
    return { channelId, messageId };
  } catch { return; }
}

export function currentChannelId(runtime: TranslationRuntime): string | undefined {
  return runtime.selectedChannel?.getChannelId?.() ?? runtime.selectedChannel?.getLastSelectedChannelId?.();
}

export function resolveMessageForCell(runtime: TranslationRuntime, cell: NativeObjectHandle): { cellKey: string; channelId: string; messageId: string; message: Record<string, any> } | null {
  const key = cellKey(runtime, cell);
  const info = messageInfoForCell(runtime, cell);
  if (!key || !info) return null;
  const channelId = info.channelId ?? currentChannelId(runtime);
  if (!channelId) return null;
  const message = runtime.messageStore?.getMessage?.(channelId, info.messageId);
  if (!message) return null;
  return { cellKey: key, channelId, messageId: info.messageId, message };
}

export function visibleMessageCellsInCell(runtime: TranslationRuntime, cell: NativeObjectHandle): NativeObjectHandle[] {
  if (!runtime.objc) return [];
  let table = nativeCall(runtime, cell, 'superview') as NativeObjectHandle | null;
  for (let depth = 0; table && depth < MAX_NATIVE_VIEW_DEPTH; depth++) {
    if ((runtime.objc.className(table) ?? '').includes('DCDTableView')) break;
    table = nativeCall(runtime, table, 'superview') as NativeObjectHandle | null;
  }
  if (!table || !(runtime.objc.className(table) ?? '').includes('DCDTableView')) return [];
  const visibleCells = nativeCall(runtime, table, 'visibleCells');
  try {
    const cells = Array.isArray(visibleCells) ? visibleCells as NativeObjectHandle[] : visibleCells && typeof visibleCells === 'object' ? runtime.objc.array(visibleCells as NativeObjectHandle) : [];
    return cells.filter((value) => (runtime.objc?.className(value) ?? '').includes('DCDMessageTableViewCell'));
  } catch { return []; }
}

export function textViewsInView(runtime: TranslationRuntime, view: NativeObjectHandle, depth = 0, result: NativeObjectHandle[] = []): NativeObjectHandle[] {
  if (!runtime.objc || depth > MAX_NATIVE_VIEW_DEPTH || result.length >= 32) return result;
  if (runtime.objc.respondsTo(view, 'attributedText') && runtime.objc.respondsTo(view, 'setAttributedText:')) result.push(view);
  for (const child of nativeChildren(runtime, view)) textViewsInView(runtime, child, depth + 1, result);
  return result;
}

export function currentAttributedText(runtime: TranslationRuntime, view: NativeObjectHandle): NativeObjectHandle | null {
  return nativeCall(runtime, view, 'attributedText') as NativeObjectHandle | null;
}

export function textForView(runtime: TranslationRuntime, view: NativeObjectHandle): string | undefined {
  const attributedText = currentAttributedText(runtime, view);
  const text = attributedText ? nativeCall(runtime, attributedText, 'string') : null;
  return typeof text === 'string' ? text : undefined;
}
