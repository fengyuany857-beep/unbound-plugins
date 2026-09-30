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
      startInlineRenderer(controller);
      startMessageMenu(controller, isInlineRendererInstalled);
      toasts.showToast({
        title: 'Translate V2.3',
        content: 'Inline BYOK translation ready. Copy a DeepSeek API key, then long-press a message.',
      });
    } catch (error) {
      toasts.showToast({ title: 'Translate', content: error instanceof Error ? error.message : String(error) });
    }
  },
  stop() {
    try { stopInlineRenderer(); } catch {}
    try { stopMessageMenu(); } catch {}
    try { controller?.stop(); } catch {}
    controller = null;
  },
};
