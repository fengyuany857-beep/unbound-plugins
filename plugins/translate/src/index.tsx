import { toasts } from '@unbound-app/api';
import { startMessageMenu, stopMessageMenu } from './actions/message-menu';
import { TranslationController } from './core/controller';
import { byokTranslationProvider } from './provider/openai-compatible';

let controller: TranslationController | null = null;

export default {
  start() {
    try {
      controller = new TranslationController(byokTranslationProvider);
      controller.start();
      startMessageMenu(controller, false);
      toasts.showToast({
        title: 'Translate V2.2',
        content: 'BYOK mode ready. Copy a DeepSeek API key, then long-press a message.',
      });
    } catch (error) {
      toasts.showToast({ title: 'Translate', content: error instanceof Error ? error.message : String(error) });
    }
  },
  stop() {
    try { stopMessageMenu(); } catch {}
    try { controller?.stop(); } catch {}
    controller = null;
  },
};
