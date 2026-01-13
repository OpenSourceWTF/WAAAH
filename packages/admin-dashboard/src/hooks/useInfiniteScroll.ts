import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  hasMoreCompleted?: boolean;
  hasMoreCancelled?: boolean;
  loadingMore?: 'completed' | 'cancelled' | null;
  onLoadMoreCompleted?: () => void;
  onLoadMoreCancelled?: () => void;
}

export function useInfiniteScroll({
  hasMoreCompleted,
  hasMoreCancelled,
  loadingMore,
  onLoadMoreCompleted,
  onLoadMoreCancelled
}: UseInfiniteScrollOptions) {
  const completedSentinelRef = useRef<HTMLDivElement>(null);
  const cancelledSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const completedSentinel = completedSentinelRef.current;
    const cancelledSentinel = cancelledSentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            if (entry.target === completedSentinel && hasMoreCompleted && !loadingMore && onLoadMoreCompleted) {
              onLoadMoreCompleted();
            }
            if (entry.target === cancelledSentinel && hasMoreCancelled && !loadingMore && onLoadMoreCancelled) {
              onLoadMoreCancelled();
            }
          }
        });
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (completedSentinel) observer.observe(completedSentinel);
    if (cancelledSentinel) observer.observe(cancelledSentinel);

    return () => {
      if (completedSentinel) observer.unobserve(completedSentinel);
      if (cancelledSentinel) observer.unobserve(cancelledSentinel);
    };
  }, [hasMoreCompleted, hasMoreCancelled, loadingMore, onLoadMoreCompleted, onLoadMoreCancelled]);

  return {
    completedSentinelRef,
    cancelledSentinelRef
  };
}
