import type { RefObject } from 'react';

interface ColumnScrollPropsOptions {
  hasMoreCompleted?: boolean;
  loadingMore?: 'completed' | null;
  completedSentinelRef: RefObject<HTMLDivElement | null>;
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
  const { hasMoreCompleted, loadingMore, completedSentinelRef } = options;

  switch (columnId) {
    case 'DONE':
      return {
        hasMore: hasMoreCompleted,
        loadingMore: loadingMore === 'completed',
        sentinelRef: completedSentinelRef
      };
    default:
      return {};
  }
}
