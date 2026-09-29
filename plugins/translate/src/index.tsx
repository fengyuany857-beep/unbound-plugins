import { toasts } from '@unbound-app/api';
import type { PluginContext } from '@unbound-app/api/native';
import { startMessageMenu, stopMessageMenu } from './actions/message-menu';
import { TranslationController } from './core/controller';
import { clearAllTranslationSurfaces, startInlineHost } from './native/inline-host';
import { startMessageObserver, stopMessageObserver } from './native/message-observer';
import { currentUserId, disposeRuntime, initializeRuntime, type TranslationRuntime } from './native/runtime';
import { unboundTranslationProvider } from './provider/unbound';
import { TranslationSettingsScreen } from './ui/settings';

let runtime: TranslationRuntime | null = null;
let controller: TranslationController | null = null;
let lifecycle = 0;

export default {
  start(context?: PluginContext) {
    lifecycle += 1;
    try {
      runtime = initializeRuntime(context);
      controller = new TranslationController(unboundTranslationProvider, () => runtime ? currentUserId(runtime) : undefined);
      controller.start();
      const inlineReady = startInlineHost(runtime, lifecycle);
      if (inlineReady) startMessageObserver(runtime, controller);
      startMessageMenu(controller, inlineReady);
      if (!inlineReady) toasts.showToast({ title: 'Translate', content: 'Inline translation renderer is unavailable on this client build.' });
    } catch (error) {
      toasts.showToast({ title: 'Translate', content: error instanceof Error ? error.message : String(error) });
    }
  },
  stop() {
    try { stopMessageMenu(); } catch {}
    try { stopMessageObserver(); } catch {}
    try { clearAllTranslationSurfaces(); } catch {}
    try { controller?.stop(); } catch {}
    if (runtime) { try { disposeRuntime(runtime); } catch {} }
    controller = null; runtime = null;
  },
  getSettingsPanel: () => <TranslationSettingsScreen />,
};
