import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncQueueItem, SyncActionType } from '@/types/offline';
import { useAppStore } from '@/store/useAppStore';

const QUEUE_STORAGE_KEY = '@lendflow_offline_sync_queue_v1';

export const syncQueue = {
  /**
   * Retrieves all queue items
   */
  async getQueue(): Promise<SyncQueueItem[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return [];
      const parsed: SyncQueueItem[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('[syncQueue.getQueue] Error loading queue:', err);
      return [];
    }
  },

  /**
   * Adds an action to the offline queue
   */
  async enqueue(type: SyncActionType, payload: any, tempId?: string): Promise<SyncQueueItem> {
    try {
      const current = await this.getQueue();
      const newItem: SyncQueueItem = {
        id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        payload,
        tempId,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        status: 'PENDING',
      };

      const updated = [...current, newItem];
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
      useAppStore.getState().setPendingSyncCount(updated.filter(i => i.status !== 'SYNCING').length);
      return newItem;
    } catch (err) {
      console.error('[syncQueue.enqueue] Error enqueueing item:', err);
      throw err;
    }
  },

  /**
   * Dequeues (removes) an item after successful sync
   */
  async dequeue(id: string): Promise<void> {
    try {
      const current = await this.getQueue();
      const updated = current.filter(item => item.id !== id);
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
      useAppStore.getState().setPendingSyncCount(updated.length);
    } catch (err) {
      console.error('[syncQueue.dequeue] Error removing item from queue:', err);
    }
  },

  /**
   * Updates status or error of a specific queue item
   */
  async updateItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    try {
      const current = await this.getQueue();
      const updated = current.map(item => (item.id === id ? { ...item, ...updates } : item));
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
      useAppStore.getState().setPendingSyncCount(updated.filter(i => i.status !== 'SYNCING').length);
    } catch (err) {
      console.error('[syncQueue.updateItem] Error updating item:', err);
    }
  },

  /**
   * Updates any payload references when an offline temporary borrower ID gets resolved to a real UUID
   */
  async remapBorrowerId(tempBorrowerId: string, realBorrowerId: string): Promise<void> {
    try {
      const current = await this.getQueue();
      let changed = false;
      const updated = current.map(item => {
        if (item.type === 'CREATE_LOAN' && item.payload) {
          if (item.payload.existing_borrower_id === tempBorrowerId) {
            changed = true;
            return {
              ...item,
              payload: { ...item.payload, existing_borrower_id: realBorrowerId },
            };
          }
        }
        return item;
      });

      if (changed) {
        await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (err) {
      console.error('[syncQueue.remapBorrowerId] Error remapping borrower ID:', err);
    }
  },

  /**
   * Counts pending items
   */
  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    const count = queue.filter(item => item.status === 'PENDING' || item.status === 'FAILED').length;
    useAppStore.getState().setPendingSyncCount(count);
    return count;
  },

  /**
   * Clears all items (e.g. on user logout)
   */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
      useAppStore.getState().setPendingSyncCount(0);
    } catch (err) {
      console.error('[syncQueue.clear] Error clearing queue:', err);
    }
  },
};
