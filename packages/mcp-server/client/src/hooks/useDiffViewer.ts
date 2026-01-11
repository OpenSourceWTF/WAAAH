import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import { parseDiff, getFileStats } from '@/utils/diffParser';
import type { DiffFile, ReviewComment } from '@/utils/diffParser';

export function useDiffViewer(taskId: string, onAddCommentProp: (filePath: string, lineNumber: number | null, content: string) => void) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [commentingLine, setCommentingLine] = useState<{ file: string; line: number | null } | null>(null);
  const [newComment, setNewComment] = useState('');

  // Refs for file sections to enable jump-to
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
        setExpandedFiles(new Set(parsed.map(f => f.path)));
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

  const handleAddComment = async () => {
    if (!commentingLine || !newComment.trim()) return;

    onAddCommentProp(commentingLine.file, commentingLine.line, newComment.trim());
    setNewComment('');
    setCommentingLine(null);

    // Only refresh comments (not diff) - preserves scroll
    setTimeout(fetchComments, 500);
  };

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const jumpToFile = (path: string) => {
    // Expand the file first
    setExpandedFiles(prev => new Set([...prev, path]));

    // Scroll to file after a tick
    setTimeout(() => {
      const el = fileRefs.current.get(path);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const getCommentsForLine = (filePath: string, lineNumber: number | null) => {
    return comments.filter(c =>
      c.filePath === filePath &&
      c.lineNumber === lineNumber &&
      !c.threadId
    );
  };

  const getReplies = (commentId: string) => {
    return comments.filter(c => c.threadId === commentId);
  };

  const unresolvedCount = comments.filter(c => !c.resolved && !c.threadId).length;

  // File stats for navigator
  const fileStats = useMemo(() => getFileStats(files), [files]);
  const totalAdditions = fileStats.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = fileStats.reduce((sum, f) => sum + f.deletions, 0);

  return {
    files, comments, loading, error, expandedFiles, commentingLine, setCommentingLine,
    newComment, setNewComment, fileRefs,
    toggleFile, jumpToFile, handleAddComment, getCommentsForLine, getReplies,
    unresolvedCount, fileStats, totalAdditions, totalDeletions
  };
}
