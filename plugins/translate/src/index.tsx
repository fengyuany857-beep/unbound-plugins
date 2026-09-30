import { toasts } from '@unbound-app/api';
import { isInlineRendererInstalled, startInlineRenderer, stopInlineRenderer } from './actions/inline-renderer';
import { startMessageMenu, stopMessageMenu } from './actions/message-menu';
import { TranslationController } from './core/controller';
import { byokTranslationProvider } from './provider/openai-compatible';

let controller: TranslationController | null = null;

export default {
  start() {
    try {
      controller = new TranslationController(byokTranslationProvider);
      controller.start();

      // Stable interaction path first. Experimental inline rendering must never
      // prevent the long-press translation menu from being registered.
      startMessageMenu(controller, isInlineRendererInstalled);

      try {
        startInlineRenderer(controller);
      } catch {}

      try {
        toasts.showToast({
          title: 'Translate V2.3.1',
          content: 'BYOK translation ready. Inline rendering is fail-open.',
        });
      } catch {}
    } catch (error) {
      try {
        toasts.showToast({ title: 'Translate', content: error instanceof Error ? error.message : String(error) });
      } catch {}
    }
  },
  stop() {
    try { stopInlineRenderer(); } catch {}
    try { stopMessageMenu(); } catch {}
    try { controller?.stop(); } catch {}
    controller = null;
  },
};
