import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useAppStore } from '@/store/useAppStore';
import { syncEngine } from '@/services/offline/syncEngine';
import { syncQueue } from '@/services/offline/syncQueue';

let isInitialized = false;

export const networkService = {
  init() {
    if (isInitialized) return;
    isInitialized = true;

    // 1. Configure TanStack Query onlineManager
    onlineManager.setEventListener(setOnline => {
      return NetInfo.addEventListener(state => {
        const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
        setOnline(isOnline);
      });
    });

    // 2. Listen to network state changes for app store & auto-sync
    NetInfo.addEventListener((state: NetInfoState) => {
      const wasOnline = useAppStore.getState().isOnline;
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);

      useAppStore.getState().setOnlineStatus(isOnline);

      // If transition from offline -> online, trigger auto sync
      if (!wasOnline && isOnline) {
        console.log('[networkService] Reconnected to internet! Triggering auto-sync...');
        syncEngine.sync();
      }
    });

    // 3. Initial check of pending queue count
    syncQueue.getPendingCount().then(count => {
      useAppStore.getState().setPendingSyncCount(count);
    });
  },

  async checkCurrentStatus(): Promise<boolean> {
    const state = await NetInfo.fetch();
    const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    useAppStore.getState().setOnlineStatus(isOnline);
    return isOnline;
  },
};
