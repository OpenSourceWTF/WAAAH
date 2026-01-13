import { RefObject } from 'react';

interface ColumnScrollPropsOptions {
  hasMoreCompleted?: boolean;
  hasMoreCancelled?: boolean;
  loadingMore?: 'completed' | 'cancelled' | null;
  completedSentinelRef: RefObject<HTMLDivElement | null>;
  cancelledSentinelRef: RefObject<HTMLDivElement | null>;
}

export interface ColumnInfiniteScrollProps {
  hasMore?: boolean;
  loadingMore?: boolean;
  sentinelRef?: RefObject<HTMLDivElement | null>;
}

export function getColumnScrollProps(
  columnId: string,
  options: ColumnScrollPropsOptions
): ColumnInfiniteScrollProps {
  const { hasMoreCompleted, hasMoreCancelled, loadingMore, completedSentinelRef, cancelledSentinelRef } = options;

  switch (columnId) {
    case 'DONE':
      return {
        hasMore: hasMoreCompleted,
        loadingMore: loadingMore === 'completed',
        sentinelRef: completedSentinelRef
      };
    case 'CANCELLED':
      return {
        hasMore: hasMoreCancelled,
        loadingMore: loadingMore === 'cancelled',
        sentinelRef: cancelledSentinelRef
      };
    default:
      return {};
  }
}
