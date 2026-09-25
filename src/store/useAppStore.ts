import { create } from 'zustand';

interface AppState {
  currentOrgId: string;
  isOnline: boolean;
  lastSyncedAt: string;

  setCurrentOrgId: (orgId: string) => void;
  setOnlineStatus: (status: boolean) => void;
  setLastSyncedAt: (timestamp: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentOrgId: '',
  isOnline: true,
  lastSyncedAt: new Date().toLocaleTimeString(),

  setCurrentOrgId: (orgId: string) => set({ currentOrgId: orgId }),
  setOnlineStatus: (status: boolean) => set({ isOnline: status }),
  setLastSyncedAt: (timestamp: string) => set({ lastSyncedAt: timestamp }),
}));
