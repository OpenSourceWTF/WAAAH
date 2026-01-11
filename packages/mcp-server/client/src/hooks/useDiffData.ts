
import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { parseDiff } from '@/utils/diffParser';
import type { DiffFile, ReviewComment } from '@/utils/diffParser';

export function useDiffData(taskId: string) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const diffLoaded = useRef(false);

  // Fetch comments only (doesn't reset scroll)
  const fetchComments = useCallback(async () => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/review-comments`);
      if (res.ok) {
        setComments(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch comments', e);
    }
  }, [taskId]);

  // Fetch diff (only on initial load)
  const fetchDiff = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/admin/tasks/${taskId}/diff`);

      if (res.ok) {
        const data = await res.json();
        const parsed = parseDiff(data.diff || '');
        setFiles(parsed);
        diffLoaded.current = true;
      } else {
        setError('No diff available');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Initial load: fetch both
  useEffect(() => {
    if (!diffLoaded.current) {
      fetchDiff().then(() => fetchComments());
    }
  }, [fetchDiff, fetchComments]);

  return { files, comments, loading, error, fetchComments };
}
