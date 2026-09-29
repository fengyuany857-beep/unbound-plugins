import type { NativeHookToken, NativeObjectHandle } from '@unbound-app/api/native';
import type { TranslationController } from '../core/controller';
import { translationStore } from '../core/translation-store';
import { resolveBodyLabel } from './body-label-resolver';
import { cellKey, nativeCall, resolveMessageForCell, visibleMessageCellsInCell } from './message-cell';
import { mountedTranslationKey, mountTranslationSurface, unmountTranslationSurface } from './inline-host';
import type { TranslationRuntime } from './runtime';

type CellUpdateStatus = 'done' | 'retry';
let runtime: TranslationRuntime | null = null;
let controller: TranslationController | null = null;
let hooks: NativeHookToken[] = [];
let lifecycle = 0;
let storeCleanup: (() => void) | null = null;
const activeCells = new Map<string, NativeObjectHandle>();
const pendingCells = new Set<string>();
const completedCells = new Set<string>();
const retryCounts = new Map<string, number>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function updateCell(cell: NativeObjectHandle): CellUpdateStatus {
  if (!runtime || !controller) return 'done';
  const resolved = resolveMessageForCell(runtime, cell);
  if (!resolved) return 'retry';
  const { cellKey: key, channelId, messageId, message } = resolved;
  controller.observeVisibleMessage(message);
  const entry = controller.getEntryForMessage(message);
  const wantedKey = entry?.state === 'ready' && !entry.hidden && entry.translatedText ? entry.key : undefined;
  const mounted = mountedTranslationKey(key);
  if (!wantedKey) {
    if (mounted) unmountTranslationSurface(key, true);
    return 'done';
  }
  if (mounted === wantedKey) return 'done';
  const label = resolveBodyLabel(runtime, cell, message);
  if (!label) return 'retry';
  return mountTranslationSurface(cell, label, channelId, messageId, wantedKey) ? 'done' : 'retry';
}

function scheduleCell(cell: NativeObjectHandle): void {
  if (!runtime) return;
  const key = cellKey(runtime, cell);
  if (!key) return;
  activeCells.set(key, cell);
  if (pendingCells.has(key) || completedCells.has(key) || retryTimers.has(key)) return;
  pendingCells.add(key);
  const token = lifecycle;
  setTimeout(() => {
    pendingCells.delete(key);
    if (token !== lifecycle || !runtime) return;
    const status = updateCell(cell);
    if (status === 'done') {
      completedCells.add(key);
      retryCounts.delete(key);
      return;
    }
    const attempts = (retryCounts.get(key) ?? 0) + 1;
    retryCounts.set(key, attempts);
    if (attempts > 8) { completedCells.add(key); return; }
    const timer = setTimeout(() => {
      retryTimers.delete(key);
      if (token === lifecycle) scheduleCell(cell);
    }, 120);
    retryTimers.set(key, timer);
  }, 0);
}

function refreshActiveCells(): void {
  for (const [key, cell] of activeCells) {
    completedCells.delete(key);
    retryCounts.delete(key);
    scheduleCell(cell);
  }
}

function clearCell(key: string): void {
  activeCells.delete(key);
  pendingCells.delete(key);
  completedCells.delete(key);
  retryCounts.delete(key);
  const timer = retryTimers.get(key);
  if (timer) clearTimeout(timer);
  retryTimers.delete(key);
  unmountTranslationSurface(key, true);
}

function installNativeHooks(): void {
  if (!runtime?.objc || hooks.length > 0) return;
  let initialScan: NativeHookToken;
  initialScan = runtime.objc.hook('DCDMessageTableViewCell', 'layoutSubviews', {
    after: ({ self }: { self: NativeObjectHandle }) => {
      if (!runtime) return;
      const cells = visibleMessageCellsInCell(runtime, self);
      if (cells.length === 0) return;
      initialScan.remove();
      for (const cell of cells) scheduleCell(cell);
    },
  });
  const visibility = runtime.objc.hook('DCDMessageTableViewCell', 'didMoveToWindow', {
    after: ({ self }: { self: NativeObjectHandle }) => {
      if (!runtime) return;
      const key = cellKey(runtime, self);
      if (!key) return;
      if (!nativeCall(runtime, self, 'window')) { clearCell(key); return; }
      completedCells.delete(key);
      scheduleCell(self);
    },
  });
  const reuse = runtime.objc.hook('DCDMessageTableViewCell', 'prepareForReuse', {
    after: ({ self }: { self: NativeObjectHandle }) => {
      if (!runtime) return;
      const key = cellKey(runtime, self);
      if (!key) return;
      clearCell(key);
      setTimeout(() => scheduleCell(self), 0);
    },
  });
  hooks = [initialScan, visibility, reuse];
}

export function startMessageObserver(nextRuntime: TranslationRuntime, nextController: TranslationController): void {
  lifecycle += 1;
  runtime = nextRuntime;
  controller = nextController;
  installNativeHooks();
  storeCleanup = translationStore.subscribeAll(() => refreshActiveCells());
}

export function stopMessageObserver(): void {
  lifecycle += 1;
  storeCleanup?.(); storeCleanup = null;
  for (const hook of hooks) hook.remove(); hooks = [];
  for (const timer of retryTimers.values()) clearTimeout(timer);
  retryTimers.clear();
  for (const key of [...activeCells.keys()]) clearCell(key);
  activeCells.clear(); pendingCells.clear(); completedCells.clear(); retryCounts.clear();
  runtime = null; controller = null;
}
