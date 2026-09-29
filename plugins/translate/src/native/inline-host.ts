import type { NativeInvoker, NativeObjectHandle } from '@unbound-app/api/native';
import { metro } from '@unbound-app/api';
import TranslationSurface from '../ui/TranslationSurface';
import { cellKey, currentAttributedText, nativeCall, stringFromNative } from './message-cell';
import { BottomAnchorTracker, readSurfaceAnchor, shouldRefreshSurfaceRow, surfaceHeightCacheKey, type SurfaceLayoutMetrics } from './surface-layout';
import { cellStates, clearSurfaceRegistry, getSurfaceModuleName, registerTranslationSurface, setSurfaceLayoutReporter, surfaceHeights, surfaces, type TranslationSurfaceState } from './surface-registry';
import type { TranslationRuntime } from './runtime';

type AnyRecord = Record<string, any>;
const MIN_SURFACE_HEIGHT = 24;
const INITIAL_SURFACE_HEIGHT = 28;
const MAX_SURFACE_HEIGHT = 420;
const SURFACE_LAYOUT_SETTLE_DELAY = 60;
const SURFACE_SPACER_FONT_SIZE = 4;
const MAX_NATIVE_VIEW_DEPTH = 10;
let activeRuntime: TranslationRuntime | null = null;
let activeLifecycle = 0;

function runtime(): TranslationRuntime | null { return activeRuntime; }
function nativeRange(location: number, length: number): unknown { return runtime()?.objc?.struct('NSRange', { location, length }) ?? null; }
function nativeFrame(width: number, height: number): unknown { return runtime()?.objc?.struct('CGRect', { origin: { x: 0, y: 0 }, size: { width, height } }) ?? null; }
function structFields(value: unknown): AnyRecord { if (!value || typeof value !== 'object') return {}; const fields = (value as AnyRecord).value; return fields && typeof fields === 'object' ? fields as AnyRecord : {}; }

function tableForCell(cell: NativeObjectHandle): NativeObjectHandle | null {
  const rt = runtime(); if (!rt?.objc) return null;
  let current: NativeObjectHandle | null = cell;
  for (let depth = 0; depth < 14 && current; depth++) {
    if (rt.objc.respondsTo(current, 'beginUpdates') && rt.objc.respondsTo(current, 'endUpdates')) return current;
    current = nativeCall(rt, current, 'superview') as NativeObjectHandle | null;
  }
  return null;
}

function tableLayoutMetrics(table: NativeObjectHandle): SurfaceLayoutMetrics {
  const rt = runtime();
  if (!rt) return { bottomInset: 0, contentHeight: 0, inverted: false, offsetX: 0, offsetY: 0, topInset: 0, viewportHeight: 0 };
  const contentSize = structFields(nativeCall(rt, table, 'contentSize'));
  const contentOffset = structFields(nativeCall(rt, table, 'contentOffset'));
  const bounds = structFields(nativeCall(rt, table, 'bounds'));
  const boundsSize = bounds.size as AnyRecord | undefined;
  const transform = structFields(nativeCall(rt, table, 'transform'));
  const contentInset = structFields(nativeCall(rt, table, 'adjustedContentInset'));
  return {
    bottomInset: Number(contentInset.bottom ?? 0),
    contentHeight: Number(contentSize.height),
    inverted: Number(transform.d) < 0,
    offsetX: Number(contentOffset.x),
    offsetY: Number(contentOffset.y),
    topInset: Number(contentInset.top ?? 0),
    viewportHeight: Number(boundsSize?.height),
  };
}

function tableIsScrolling(table: NativeObjectHandle): boolean {
  const rt = runtime(); if (!rt) return false;
  return Boolean(nativeCall(rt, table, 'isTracking') || nativeCall(rt, table, 'isDragging') || nativeCall(rt, table, 'isDecelerating'));
}

function availableMessageWidth(cell: NativeObjectHandle, label: NativeObjectHandle): number {
  const rt = runtime(); if (!rt?.fabric) return 0;
  const labelWidth = rt.fabric.measure(label).width;
  const cellWidth = rt.fabric.measure(cell).width;
  if (!Number.isFinite(labelWidth) || !Number.isFinite(cellWidth)) return labelWidth;
  const targetKey = cellKey(rt, cell);
  let view = label; let left = 0;
  for (let depth = 0; depth < MAX_NATIVE_VIEW_DEPTH; depth++) {
    const frame = rt.fabric.measure(view); left += frame.x;
    const parent = nativeCall(rt, view, 'superview') as NativeObjectHandle | null;
    if (!parent || cellKey(rt, parent) === targetKey) break;
    view = parent;
  }
  const availableWidth = cellWidth - left - 12;
  if (!Number.isFinite(availableWidth) || availableWidth < 80) return labelWidth;
  return Math.max(labelWidth, Math.min(cellWidth, availableWidth));
}

function createHost(width: number, height: number): NativeObjectHandle | null {
  const rt = runtime(); if (!rt?.objc) return null;
  try { const view = rt.objc.alloc('UIView'); rt.objc.invoke(view, 'setFrame:', [nativeFrame(width, height)], { thread: 'main' }); return view; }
  catch { return null; }
}

function fontForAttributedText(attributedText: NativeObjectHandle): NativeObjectHandle | null {
  const rt = runtime(); if (!rt?.objc) return null;
  const text = stringFromNative(rt, nativeCall(rt, attributedText, 'string')) ?? '';
  if (!text.length) return null;
  for (const index of [Math.max(0, text.length - 1), 0]) {
    const attributes = nativeCall(rt, attributedText, 'attributesAtIndex:effectiveRange:', index, null);
    if (attributes && typeof attributes === 'object' && (attributes as AnyRecord).NSFont) return (attributes as AnyRecord).NSFont as NativeObjectHandle;
  }
  return null;
}

function attributedTranslationInsertion(state: TranslationSurfaceState, invoke?: NativeInvoker): NativeObjectHandle | null {
  const rt = runtime(); if (!rt?.objc) return null;
  const call: NativeInvoker = invoke ?? ((handle, selector, ...args) => nativeCall(rt, handle, selector, ...args));
  const attachmentClass = rt.objc.getClass('YYTextAttachment');
  if (!attachmentClass) return null;
  const attachment = rt.objc.alloc(attachmentClass);
  call(attachment, 'setValue:forKey:', state.host, 'content');
  call(attachment, 'setValue:forKey:', 1, 'contentMode');
  const sourceText = stringFromNative(rt, call(state.original, 'string')) ?? '';
  const leadingNewline = sourceText.endsWith('\n') ? '' : '\n';
  const spacerText = '\u200B\n';
  const attachmentLocation = leadingNewline.length + spacerText.length;
  const insertionText = `${leadingNewline}${spacerText}\uFFFC`;
  const attributes: AnyRecord = state.font ? { NSFont: state.font } : {};
  const insertion = rt.objc.alloc('NSMutableAttributedString');
  call(insertion, 'initWithString:attributes:', insertionText, attributes);
  const spacerFont = state.font ? call(state.font, 'fontWithSize:', SURFACE_SPACER_FONT_SIZE) as NativeObjectHandle | null : null;
  if (spacerFont) call(insertion, 'addAttribute:value:range:', 'NSFont', spacerFont, nativeRange(leadingNewline.length, spacerText.length));
  call(insertion, 'addAttribute:value:range:', 'YYTextAttachment', attachment, nativeRange(attachmentLocation, 1));
  const delegateClass = rt.objc.getClass('YYTextRunDelegate');
  if (delegateClass) {
    const delegate = rt.objc.alloc(delegateClass);
    call(delegate, 'setValue:forKey:', state.height, 'ascent');
    call(delegate, 'setValue:forKey:', 0, 'descent');
    call(delegate, 'setValue:forKey:', state.width, 'width');
    const coreDelegate = call(delegate, 'CTRunDelegate');
    if (coreDelegate) call(insertion, 'addAttribute:value:range:', 'CTRunDelegate', coreDelegate, nativeRange(attachmentLocation, 1));
  }
  return insertion;
}

function captureBottomAnchor(state: TranslationSurfaceState, table: NativeObjectHandle): void {
  const rt = runtime(); if (!rt) return;
  const latestMessage = rt.messageStore?.getLastMessage?.(state.channelId);
  state.bottomAnchor.capture(readSurfaceAnchor(tableLayoutMetrics(table), latestMessage?.id === state.messageId));
}

function scheduleBottomScrollCorrection(state: TranslationSurfaceState, table: NativeObjectHandle): void {
  const rt = runtime(); if (!rt?.objc || !state.bottomAnchor.pending || state.bottomScrollTimer) return;
  let attempts = 0;
  const correct = () => {
    state.bottomScrollTimer = null;
    if (cellStates.get(state.cellKey) !== state || !runtime()?.objc) { state.bottomAnchor.clear(); return; }
    nativeCall(rt, state.label, 'layoutIfNeeded'); nativeCall(rt, state.cell, 'layoutIfNeeded'); nativeCall(rt, table, 'layoutIfNeeded');
    const correction = state.bottomAnchor.correction(tableLayoutMetrics(table), tableIsScrolling(table));
    if (correction) {
      nativeCall(rt, table, 'setContentOffset:animated:', rt.objc!.struct('CGPoint', { x: correction.x, y: correction.y }), false);
      return;
    }
    if (state.bottomAnchor.pending && attempts < 12) { attempts++; state.bottomScrollTimer = setTimeout(correct, 16); return; }
    state.bottomAnchor.clear();
  };
  state.bottomScrollTimer = setTimeout(correct, 16);
}

function refreshRowSize(state: TranslationSurfaceState, force = false): void {
  const rt = runtime(); if (!rt?.objc || !shouldRefreshSurfaceRow(force, state.lastInvalidatedHeight, state.height)) return;
  state.lastInvalidatedHeight = state.height;
  nativeCall(rt, state.label, 'invalidateIntrinsicContentSize'); nativeCall(rt, state.label, 'setNeedsLayout');
  nativeCall(rt, state.cell, 'setNeedsUpdateConstraints'); nativeCall(rt, state.cell, 'setNeedsLayout');
  const table = tableForCell(state.cell); if (!table) { state.bottomAnchor.clear(); return; }
  captureBottomAnchor(state, table); nativeCall(rt, table, 'beginUpdates'); nativeCall(rt, table, 'endUpdates'); scheduleBottomScrollCorrection(state, table);
}

function applyAttachment(state: TranslationSurfaceState, forceRefresh = false): boolean {
  const rt = runtime(); if (!rt?.objc || state.applying) return false;
  state.applying = true;
  try {
    const insertion = attributedTranslationInsertion(state); if (!insertion) return false;
    const updated = nativeCall(rt, state.original, 'mutableCopy') as NativeObjectHandle | null; if (!updated) return false;
    const sourceText = stringFromNative(rt, nativeCall(rt, state.original, 'string')) ?? '';
    nativeCall(rt, updated, 'insertAttributedString:atIndex:', insertion, sourceText.length);
    const text = stringFromNative(rt, nativeCall(rt, updated, 'string')); if (typeof text !== 'string') return false;
    state.rendered = updated; state.renderedText = text;
    nativeCall(rt, state.label, 'setAttributedText:', updated); nativeCall(rt, state.label, 'setNeedsLayout'); refreshRowSize(state, forceRefresh);
    return true;
  } finally { state.applying = false; }
}

function reconcileSurfaceText(state: TranslationSurfaceState): void {
  const rt = runtime(); if (!rt) return;
  const attributed = currentAttributedText(rt, state.label);
  const text = attributed ? stringFromNative(rt, nativeCall(rt, attributed, 'string')) : undefined;
  if (!attributed || text === undefined || text === state.renderedText) return;
  state.original = attributed; state.font = fontForAttributedText(attributed); applyAttachment(state, true);
}

function clearTimers(state: TranslationSurfaceState): void {
  if (state.layoutTimer) clearTimeout(state.layoutTimer); if (state.bottomScrollTimer) clearTimeout(state.bottomScrollTimer);
  state.layoutTimer = null; state.bottomScrollTimer = null; state.pendingHeight = null; state.bottomAnchor.clear();
}

function handleSurfaceLayout(surfaceId: string, height: number): void {
  const rt = runtime();
  const state = surfaces.get(surfaceId);
  if (!rt?.objc || !state || !Number.isFinite(height) || height <= 0 || height > MAX_SURFACE_HEIGHT) return;
  const fitted = Math.max(MIN_SURFACE_HEIGHT, height);
  const current = state.pendingHeight ?? state.height;
  if (Math.abs(current - fitted) < 2) return;
  state.pendingHeight = fitted;
  if (state.layoutTimer) clearTimeout(state.layoutTimer);
  state.layoutTimer = setTimeout(() => {
    state.layoutTimer = null;
    const settled = state.pendingHeight; state.pendingHeight = null;
    if (settled === null || surfaces.get(state.surfaceId) !== state || Math.abs(state.height - settled) < 2) return;
    const table = tableForCell(state.cell); if (table) captureBottomAnchor(state, table);
    state.height = settled; surfaceHeights.set(state.heightCacheKey, settled);
    nativeCall(rt, state.host, 'setFrame:', nativeFrame(state.width, settled)); applyAttachment(state, true);
  }, SURFACE_LAYOUT_SETTLE_DELAY);
}

export function startInlineHost(rt: TranslationRuntime, lifecycle: number): boolean {
  if (!rt.objc || !rt.fabric) return false;
  activeRuntime = rt; activeLifecycle = lifecycle;
  setSurfaceLayoutReporter(handleSurfaceLayout);
  return registerTranslationSurface(rt, lifecycle, TranslationSurface);
}

export function mountTranslationSurface(cell: NativeObjectHandle, label: NativeObjectHandle, channelId: string, messageId: string, translationKey: string): boolean {
  const rt = runtime(); if (!rt?.objc || !rt.fabric || !getSurfaceModuleName()) return false;
  const key = cellKey(rt, cell); if (!key) return false;
  const existing = cellStates.get(key);
  if (existing?.translationKey === translationKey && existing.label === label) { reconcileSurfaceText(existing); return true; }
  if (existing) unmountTranslationSurface(key, false);
  const original = currentAttributedText(rt, label); if (!original) return false;
  const width = availableMessageWidth(cell, label); if (!Number.isFinite(width) || width < 80) return false;
  const heightCacheKey = surfaceHeightCacheKey(translationKey, width);
  const height = surfaceHeights.get(heightCacheKey, INITIAL_SURFACE_HEIGHT);
  const host = createHost(width, height); if (!host) return false;
  const surfaceId = `translation-${activeLifecycle}-${key}-${messageId}`;
  const state: TranslationSurfaceState = {
    cell, cellKey: key, channelId, messageId, translationKey, host, label, labelHook: null, original,
    rendered: null, renderedText: null, font: fontForAttributedText(original), surface: null, surfaceId,
    width, height, heightCacheKey, lastInvalidatedHeight: -1, applying: false, layoutTimer: null,
    bottomScrollTimer: null, pendingHeight: null, bottomAnchor: new BottomAnchorTracker(),
  };
  const table = tableForCell(cell); if (table) captureBottomAnchor(state, table);
  surfaces.set(surfaceId, state); cellStates.set(key, state);
  try {
    state.labelHook = rt.objc.hook('DCDReusableYYLabel', 'setAttributedText:', { after: () => { if (!state.applying) setTimeout(() => reconcileSurfaceText(state), 0); } }, { instance: label });
    state.surface = rt.fabric.mount(host, getSurfaceModuleName(), { surfaceId, translationKey });
    rt.fabric.setSize(state.surface, { width, height: MIN_SURFACE_HEIGHT }, { width, height: MAX_SURFACE_HEIGHT });
    if (!applyAttachment(state)) throw new Error('Could not attach translation surface.');
    return true;
  } catch {
    unmountTranslationSurface(key, true); return false;
  }
}


export function unmountTranslationSurface(key: string, restore: boolean): void {
  const rt = runtime(); const state = cellStates.get(key); if (!state) return;
  clearTimers(state); state.labelHook?.remove();
  if (restore && rt?.objc && state.rendered && state.renderedText !== null) {
    const current = nativeCall(rt, state.label, 'attributedText') as NativeObjectHandle | null;
    const currentText = current ? stringFromNative(rt, nativeCall(rt, current, 'string')) : undefined;
    if (current && (currentText === state.renderedText || current === state.rendered)) { nativeCall(rt, state.label, 'setAttributedText:', state.original); nativeCall(rt, state.label, 'setNeedsLayout'); }
  }
  if (state.surface) { try { rt?.fabric?.unmount(state.surface); } catch {} }
  surfaces.delete(state.surfaceId); cellStates.delete(key);
}

export function mountedTranslationKey(key: string): string | undefined { return cellStates.get(key)?.translationKey; }
export function clearAllTranslationSurfaces(): void {
  for (const key of [...cellStates.keys()]) unmountTranslationSurface(key, true);
  clearSurfaceRegistry(); activeRuntime = null; activeLifecycle = 0;
}
