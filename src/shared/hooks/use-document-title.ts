import { useEffect } from 'react';

import { messages } from '@/shared/i18n';

/** Sets the browser tab title for the current page ("Devices · Pulse"). */
export function useDocumentTitle(page: string): void {
  useEffect(() => {
    document.title = messages.app.documentTitle(page);
  }, [page]);
}
