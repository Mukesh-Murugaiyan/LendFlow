import { syncQueue } from './syncQueue';
import { lendflowApi } from '@/services/api/lendflowApi';
import { queryClient } from '@/services/queryClient';
import { useAppStore } from '@/store/useAppStore';
import { SyncSummary } from '@/types/offline';

let isSyncRunning = false;

export const syncEngine = {
  /**
   * Executes synchronization of all pending actions against Supabase
   */
  async sync(): Promise<SyncSummary> {
    if (isSyncRunning) {
      console.log('[syncEngine] Sync already in progress, skipping concurrent run.');
      return { totalProcessed: 0, succeeded: 0, failed: 0 };
    }

    const { isOnline } = useAppStore.getState();
    if (!isOnline) {
      console.log('[syncEngine] Device is offline. Cannot sync right now.');
      return { totalProcessed: 0, succeeded: 0, failed: 0 };
    }

    isSyncRunning = true;
    useAppStore.getState().setIsSyncing(true);

    let succeeded = 0;
    let failed = 0;

    try {
      const queue = await syncQueue.getQueue();
      const pendingItems = queue.filter(item => item.status !== 'SYNCING');

      if (pendingItems.length === 0) {
        useAppStore.getState().setPendingSyncCount(0);
        useAppStore.getState().setLastSyncedAt(new Date().toLocaleTimeString());
        return { totalProcessed: 0, succeeded: 0, failed: 0 };
      }

      console.log(`[syncEngine] Starting sync of ${pendingItems.length} pending actions...`);

      for (const item of pendingItems) {
        // Mark as syncing
        await syncQueue.updateItem(item.id, { status: 'SYNCING' });

        try {
          switch (item.type) {
            case 'CREATE_BORROWER': {
              const res = await lendflowApi.createBorrower(
                item.payload.data,
                item.payload.orgId,
                item.payload.userId
              );
              // If there was a tempId used, remap dependent queued items
              if (item.tempId && res.id) {
                await syncQueue.remapBorrowerId(item.tempId, res.id);
              }
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            case 'CREATE_LOAN': {
              await lendflowApi.createLoan(
                item.payload.data,
                item.payload.orgId,
                item.payload.userId
              );
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            case 'PAY_INTEREST': {
              await lendflowApi.markInterestPaid(
                item.payload.dueId,
                item.payload.paidAmount,
                item.payload.note
              );
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            case 'REVERSE_INTEREST': {
              await lendflowApi.reverseInterestPayment(
                item.payload.dueId,
                item.payload.reason
              );
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            case 'CLOSE_LOAN': {
              await lendflowApi.closeLoan(item.payload.loanId, item.payload.note);
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            case 'REOPEN_LOAN': {
              await lendflowApi.reopenLoan(item.payload.loanId, item.payload.note);
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            case 'DELETE_BORROWER': {
              await lendflowApi.deleteBorrower(item.payload.borrowerId);
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            case 'DELETE_LOAN': {
              await lendflowApi.deleteLoan(item.payload.loanId);
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            case 'DELETE_DUE': {
              await lendflowApi.deleteInterestDue(item.payload.dueId);
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            case 'CREATE_MANUAL_DUE': {
              await lendflowApi.createManualDue(item.payload.params);
              await syncQueue.dequeue(item.id);
              succeeded++;
              break;
            }

            default:
              console.warn(`[syncEngine] Unknown action type: ${(item as any).type}`);
              await syncQueue.dequeue(item.id);
          }
        } catch (err: any) {
          console.error(`[syncEngine] Error processing item ${item.id} (${item.type}):`, err);
          failed++;
          const nextRetry = (item.retryCount || 0) + 1;
          await syncQueue.updateItem(item.id, {
            status: 'FAILED',
            retryCount: nextRetry,
            errorMessage: err?.message || 'Sync failed',
          });
        }
      }

      // Update last synced time and refresh active queries
      const remaining = await syncQueue.getPendingCount();
      useAppStore.getState().setPendingSyncCount(remaining);
      useAppStore.getState().setLastSyncedAt(new Date().toLocaleTimeString());

      if (succeeded > 0) {
        queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
        queryClient.invalidateQueries({ queryKey: ['borrowers_list'] });
        queryClient.invalidateQueries({ queryKey: ['loans_list'] });
        queryClient.invalidateQueries({ queryKey: ['all_loans'] });
        queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
        queryClient.invalidateQueries({ queryKey: ['all_dues'] });
      }

      console.log(`[syncEngine] Sync finished: ${succeeded} succeeded, ${failed} failed, ${remaining} remaining.`);
      return { totalProcessed: pendingItems.length, succeeded, failed };
    } finally {
      isSyncRunning = false;
      useAppStore.getState().setIsSyncing(false);
    }
  },
};
