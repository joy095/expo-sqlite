import { useCallback } from 'react';
import { syncManager } from '../lib/sync';

export function useSync() {
  const sync = useCallback(() => {
    syncManager.requestSync();
  }, []);

  return { sync };
}