export type SyncActionType =
  | 'CREATE_BORROWER'
  | 'CREATE_LOAN'
  | 'PAY_INTEREST'
  | 'REVERSE_INTEREST'
  | 'CLOSE_LOAN'
  | 'REOPEN_LOAN'
  | 'DELETE_BORROWER'
  | 'DELETE_LOAN'
  | 'DELETE_DUE'
  | 'CREATE_MANUAL_DUE';

export interface SyncQueueItem {
  id: string; // Internal queue unique id
  type: SyncActionType;
  payload: any;
  tempId?: string; // Client-side generated ID for optimistic display
  createdAt: string;
  retryCount: number;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  errorMessage?: string;
}

export interface SyncSummary {
  totalProcessed: number;
  succeeded: number;
  failed: number;
}
