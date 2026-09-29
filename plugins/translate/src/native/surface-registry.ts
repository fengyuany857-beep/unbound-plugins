import type { NativeFabricSurface, NativeHookToken, NativeObjectHandle } from '@unbound-app/api/native';
import type { ComponentType } from 'react';
import { metro } from '@unbound-app/api';
import { BottomAnchorTracker, SurfaceHeightCache } from './surface-layout';
import type { TranslationRuntime } from './runtime';

type AnyRecord = Record<string, any>;
export type TranslationSurfaceState = {
  cell: NativeObjectHandle;
  cellKey: string;
  channelId: string;
  messageId: string;
  translationKey: string;
  host: NativeObjectHandle;
  label: NativeObjectHandle;
  labelHook: NativeHookToken | null;
  original: NativeObjectHandle;
  rendered: NativeObjectHandle | null;
  renderedText: string | null;
  font: NativeObjectHandle | null;
  surface: NativeFabricSurface | null;
  surfaceId: string;
  width: number;
  height: number;
  heightCacheKey: string;
  lastInvalidatedHeight: number;
  applying: boolean;
  layoutTimer: ReturnType<typeof setTimeout> | null;
  bottomScrollTimer: ReturnType<typeof setTimeout> | null;
  pendingHeight: number | null;
  bottomAnchor: BottomAnchorTracker;
};

export const cellStates = new Map<string, TranslationSurfaceState>();
export const surfaces = new Map<string, TranslationSurfaceState>();
export const surfaceHeights = new SurfaceHeightCache();
let surfaceModuleName = '';
let layoutReporter: ((surfaceId: string, height: number) => void) | null = null;

export function registerTranslationSurface(runtime: TranslationRuntime, lifecycle: number, component: ComponentType<any>): boolean {
  if (surfaceModuleName) return true;
  const windowValue = (globalThis as AnyRecord).window as AnyRecord | undefined;
  const registry = (metro.common.ReactNative as AnyRecord).AppRegistry ?? windowValue?.RN$AppRegistry ?? metro.findByProps('registerComponent', 'runApplication');
  if (!registry || typeof registry.registerComponent !== 'function') return false;
  surfaceModuleName = `TranslationSurface${lifecycle}`;
  try { registry.registerComponent(surfaceModuleName, () => component); return true; }
  catch { surfaceModuleName = ''; return false; }
}

export function getSurfaceModuleName(): string { return surfaceModuleName; }
export function setSurfaceLayoutReporter(reporter: ((surfaceId: string, height: number) => void) | null): void { layoutReporter = reporter; }
export function reportSurfaceLayout(surfaceId: string, height: number): void { layoutReporter?.(surfaceId, height); }
export function clearSurfaceRegistry(): void {
  cellStates.clear();
  surfaces.clear();
  surfaceHeights.clear();
  surfaceModuleName = '';
  layoutReporter = null;
}
