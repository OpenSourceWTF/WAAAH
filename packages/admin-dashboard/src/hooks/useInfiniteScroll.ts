import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  hasMoreCompleted?: boolean;
  loadingMore?: 'completed' | null;
  onLoadMoreCompleted?: () => void;
}

export function useInfiniteScroll({
  hasMoreCompleted,
  loadingMore,
  onLoadMoreCompleted
}: UseInfiniteScrollOptions) {
  const completedSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const completedSentinel = completedSentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            if (entry.target === completedSentinel && hasMoreCompleted && !loadingMore && onLoadMoreCompleted) {
              onLoadMoreCompleted();
            }
          }
        });
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (completedSentinel) observer.observe(completedSentinel);

    return () => {
      if (completedSentinel) observer.unobserve(completedSentinel);
    };
  }, [hasMoreCompleted, loadingMore, onLoadMoreCompleted]);

  return {
    completedSentinelRef
  };
}
