import { create } from 'zustand';

interface AppState {
  currentOrgId: string;
  isOnline: boolean;
  lastSyncedAt: string;
  pendingSyncCount: number;
  isSyncing: boolean;

  setCurrentOrgId: (orgId: string) => void;
  setOnlineStatus: (status: boolean) => void;
  setLastSyncedAt: (timestamp: string) => void;
  setPendingSyncCount: (count: number) => void;
  setIsSyncing: (status: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentOrgId: '',
  isOnline: true,
  lastSyncedAt: new Date().toLocaleTimeString(),
  pendingSyncCount: 0,
  isSyncing: false,

  setCurrentOrgId: (orgId: string) => set({ currentOrgId: orgId }),
  setOnlineStatus: (status: boolean) => set({ isOnline: status }),
  setLastSyncedAt: (timestamp: string) => set({ lastSyncedAt: timestamp }),
  setPendingSyncCount: (count: number) => set({ pendingSyncCount: count }),
  setIsSyncing: (status: boolean) => set({ isSyncing: status }),
}));
